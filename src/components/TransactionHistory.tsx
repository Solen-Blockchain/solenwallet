import { useState, useEffect, useCallback } from "react";
import { useWallet } from "../lib/context";
import { getNetworkConfig } from "../lib/networks";
import { httpFetch } from "../lib/http";
import { callView } from "../lib/rpc";
import { formatBalance } from "../lib/wallet";
import { openUrl } from "../lib/open";

// Parse a little-endian u128 hex string to a BigInt
function leHexToAmount(hex: string): string {
  // Reverse byte pairs for LE → BE conversion
  let be = "";
  for (let i = hex.length - 2; i >= 0; i -= 2) {
    be += hex.slice(i, i + 2);
  }
  return BigInt("0x" + be).toString();
}

// Transfer event data: 64 hex chars (recipient) + 32 hex chars (LE u128 amount)
function parseTransferEvent(data: string): { recipient: string; amount: string } | null {
  if (data.length < 96) return null;
  const recipient = data.slice(0, 64);
  const amountHex = data.slice(64, 96);
  return { recipient, amount: leHexToAmount(amountHex) };
}

interface TxEvent {
  block_height: number;
  tx_index: number;
  emitter: string;
  topic: string;
  data: string;
}

interface Transaction {
  block_height: number;
  index: number;
  sender: string;
  nonce: number;
  success: boolean;
  gas_used: number;
  error: string | null;
  events: TxEvent[];
}

export function TransactionHistory() {
  const { network, activeAccount } = useWallet();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTxs = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);
    setError(null);

    try {
      const apiUrl = getNetworkConfig(network).explorerApiUrl;
      const res = await httpFetch(
        `${apiUrl}/api/accounts/${activeAccount.accountId}/txs?limit=20`,
      );
      if (!res.ok) throw new Error(`Failed to fetch transactions`);
      const data = await res.json();
      setTxs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [network, activeAccount]);

  // Token symbol cache + lookup.
  const [tokenSymbols, setTokenSymbols] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchTxs();
    const interval = setInterval(fetchTxs, 10000);
    return () => clearInterval(interval);
  }, [fetchTxs]);

  useEffect(() => {
    if (txs.length === 0) return;
    const contracts = new Set<string>();
    for (const tx of txs) {
      for (const e of tx.events) {
        if (e.topic === "transfer" && e.emitter !== tx.sender) {
          contracts.add(e.emitter);
        }
      }
    }
    if (contracts.size === 0) return;
    let cancelled = false;
    const lookups = Array.from(contracts).map(async (id) => {
      try {
        const res = await callView(network, id, "symbol");
        if (res.success) {
          const sym = new TextDecoder().decode(
            Uint8Array.from(res.return_data.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)))
          );
          return [id, sym] as [string, string];
        }
      } catch {}
      return [id, id.slice(0, 8) + "..."] as [string, string];
    });
    Promise.all(lookups).then((results) => {
      if (cancelled) return;
      setTokenSymbols((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [id, sym] of results) {
          if (next[id] !== sym) { next[id] = sym; changed = true; }
        }
        return changed ? next : prev;
      });
    });
    return () => { cancelled = true; };
  }, [txs, network]);

  if (!activeAccount) return null;

  const truncate = (s: string) => `${s.slice(0, 10)}...${s.slice(-6)}`;

  const getTransferInfo = (tx: Transaction) => {
    const nativeTransfer = tx.events.find((e) => e.topic === "transfer" && e.emitter === tx.sender);
    if (nativeTransfer) {
      const info = parseTransferEvent(nativeTransfer.data);
      return info ? { ...info, tokenContract: undefined as string | undefined } : null;
    }
    const tokenTransfer = tx.events.find((e) => e.topic === "transfer" && e.emitter !== tx.sender);
    if (tokenTransfer) {
      const info = parseTransferEvent(tokenTransfer.data);
      return info ? { ...info, tokenContract: tokenTransfer.emitter } : null;
    }
    return null;
  };

  const getStakeInfo = (tx: Transaction) => {
    const event = tx.events.find((e) => e.topic === "delegate" || e.topic === "undelegate");
    if (!event) return null;
    if (event.data.length >= 96) {
      return { amount: leHexToAmount(event.data.slice(64, 96)), type: event.topic };
    }
    if (event.data.length >= 32) {
      return { amount: leHexToAmount(event.data.slice(0, 32)), type: event.topic };
    }
    return null;
  };

  const getRewardInfo = (tx: Transaction) => {
    if (!activeAccount) return null;
    const myRewardEvents = tx.events.filter((e) => {
      if (e.topic !== "epoch_reward" && e.topic !== "delegator_reward") return false;
      if (e.data.length < 96) return false;
      const recipient = e.data.slice(0, 64);
      return recipient === activeAccount.accountId;
    });
    if (myRewardEvents.length === 0) return null;
    let total = BigInt(0);
    for (const event of myRewardEvents) {
      total += BigInt(leHexToAmount(event.data.slice(64, 96)));
    }
    return { amount: total.toString() };
  };

  const getBridgeInfo = (tx: Transaction) => {
    const deposit = tx.events.find((e) => e.topic === "bridge_deposit" && e.data.length >= 136);
    if (deposit) {
      return { type: "deposit" as const, amount: leHexToAmount(deposit.data.slice(104, 136)) };
    }
    const release = tx.events.find((e) => e.topic === "bridge_release" && e.data.length >= 96);
    if (release) {
      return { type: "release" as const, amount: leHexToAmount(release.data.slice(64, 96)) };
    }
    return null;
  };

  const getTxType = (tx: Transaction): string => {
    const bridge = getBridgeInfo(tx);
    if (bridge?.type === "deposit") return "Bridge → Base";
    if (bridge?.type === "release") return "Bridge → Solen";
    const transfer = getTransferInfo(tx);
    if (transfer?.tokenContract) return "Token Transfer";
    if (transfer) return "Transfer";
    if (tx.events.some((e) => e.topic === "delegate")) return "Stake";
    if (tx.events.some((e) => e.topic === "undelegate")) return "Unstake";
    if (tx.events.some((e) => e.topic === "epoch_reward" || e.topic === "delegator_reward")) return "Reward";
    if (tx.events.some((e) => e.topic === "deploy")) return "Deploy";
    return "Transaction";
  };

  const isSent = (tx: Transaction): boolean => {
    return tx.sender === activeAccount!.accountId;
  };

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-200">Transactions</h3>
        <button
          onClick={fetchTxs}
          disabled={loading}
          className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 mb-3">{error}</div>
      )}

      {txs.length === 0 && !loading && !error ? (
        <div className="text-sm text-gray-500 text-center py-8">
          No transactions yet
        </div>
      ) : (
        <div className="space-y-2">
          {txs.map((tx, i) => {
            const explorerUrl = getNetworkConfig(network).explorerUrl;
            return (
            <div
              key={`${tx.block_height}-${tx.index}-${i}`}
              role="button"
              tabIndex={0}
              onClick={() => openUrl(`${explorerUrl}/tx/${tx.block_height}/${tx.index}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openUrl(`${explorerUrl}/tx/${tx.block_height}/${tx.index}`);
                }
              }}
              className="flex items-center justify-between p-3 bg-gray-900/50 hover:bg-gray-900/80 rounded-lg cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                    tx.success
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {isSent(tx) ? "OUT" : "IN"}
                </div>
                <div>
                  <div className="text-sm text-gray-300">
                    {getTxType(tx)}
                    {isSent(tx) ? "" : (
                      <>
                        {" from "}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openUrl(`${explorerUrl}/account/${tx.sender}`);
                          }}
                          className="font-mono text-gray-300 hover:text-purple-400 transition-colors"
                          title={tx.sender}
                        >
                          {truncate(tx.sender)}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tx.success ? "Success" : `Failed: ${tx.error || "unknown"}`}
                    {" \u00b7 "}Gas: {tx.gas_used}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {(() => {
                  const bridge = getBridgeInfo(tx);
                  if (bridge) {
                    return (
                      <div className="text-sm font-medium text-indigo-400">
                        {bridge.type === "deposit" ? "→ " : "← "}{formatBalance(bridge.amount)} SOLEN
                      </div>
                    );
                  }
                  const transfer = getTransferInfo(tx);
                  if (transfer) {
                    const sent = isSent(tx);
                    const isToken = !!transfer.tokenContract;
                    const sym = transfer.tokenContract ? (tokenSymbols[transfer.tokenContract] || "tokens") : "SOLEN";
                    const displayAmount = formatBalance(transfer.amount);
                    return (
                      <div className={`text-sm font-medium ${isToken ? "text-purple-400" : sent ? "text-red-400" : "text-emerald-400"}`}>
                        {sent ? "-" : "+"}{displayAmount} {sym}
                      </div>
                    );
                  }
                  const stake = getStakeInfo(tx);
                  if (stake) {
                    const isDelegate = stake.type === "delegate";
                    return (
                      <div className={`text-sm font-medium ${isDelegate ? "text-blue-400" : "text-orange-400"}`}>
                        {isDelegate ? "Stake " : "Unstake "}{formatBalance(stake.amount)} SOLEN
                      </div>
                    );
                  }
                  const reward = getRewardInfo(tx);
                  if (reward) {
                    return (
                      <div className="text-sm font-medium text-amber-400">
                        +{formatBalance(reward.amount)} SOLEN
                      </div>
                    );
                  }
                  return null;
                })()}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openUrl(`${explorerUrl}/block/${tx.block_height}`);
                  }}
                  className="text-xs text-gray-500 hover:text-purple-400 transition-colors"
                >
                  Block #{tx.block_height}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
