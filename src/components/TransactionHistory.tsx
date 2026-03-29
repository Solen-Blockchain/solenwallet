import { useState, useEffect, useCallback } from "react";
import { useWallet } from "../lib/context";
import { networks } from "../lib/networks";
import { httpFetch } from "../lib/http";
import { formatBalance } from "../lib/wallet";

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
      const apiUrl = networks[network].explorerApiUrl;
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

  useEffect(() => {
    fetchTxs();
  }, [fetchTxs]);

  if (!activeAccount) return null;

  const truncate = (s: string) => `${s.slice(0, 10)}...${s.slice(-6)}`;

  const getTransferInfo = (tx: Transaction) => {
    const transferEvent = tx.events.find((e) => e.topic === "transfer");
    if (transferEvent) return parseTransferEvent(transferEvent.data);
    return null;
  };

  const getTxType = (tx: Transaction): string => {
    if (tx.events.some((e) => e.topic === "transfer")) return "Transfer";
    if (tx.events.some((e) => e.topic === "deploy")) return "Deploy";
    if (tx.events.some((e) => e.topic === "call")) return "Call";
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
          {txs.map((tx, i) => (
            <div
              key={`${tx.block_height}-${tx.index}-${i}`}
              className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
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
                    {isSent(tx) ? "" : ` from ${truncate(tx.sender)}`}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tx.success ? "Success" : `Failed: ${tx.error || "unknown"}`}
                    {" \u00b7 "}Gas: {tx.gas_used}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {(() => {
                  const transfer = getTransferInfo(tx);
                  if (transfer) {
                    const sent = isSent(tx);
                    return (
                      <div className={`text-sm font-medium ${sent ? "text-red-400" : "text-emerald-400"}`}>
                        {sent ? "-" : "+"}{formatBalance(transfer.amount)} SOLEN
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="text-xs text-gray-500">
                  Block #{tx.block_height}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
