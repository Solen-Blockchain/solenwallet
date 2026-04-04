import { useEffect, useState, useRef } from "react";
import { useWallet } from "../lib/context";
import {
  getAccount,
  callView,
  submitOperation,
  type UserOperation,
} from "../lib/rpc";
import { signMessage, buildSigningMessage, addressToBytes } from "../lib/wallet";
import { networks, getNetworkConfig } from "../lib/networks";
import { httpFetch } from "../lib/http";
import { hexToBytes } from "@noble/hashes/utils";
import { openUrl } from "../lib/open";

interface TokenInfo {
  contract: string;
  name: string;
  symbol: string;
  balance: bigint;
  decimals: number;
}

function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toLocaleString();
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr}`;
}

function parseTokenAmount(input: string, decimals: number): bigint {
  const parts = input.split(".");
  const whole = BigInt(parts[0] || "0");
  let frac = BigInt(0);
  if (parts[1]) {
    const fracStr = parts[1].slice(0, decimals).padEnd(decimals, "0");
    frac = BigInt(fracStr);
  }
  return whole * BigInt(10) ** BigInt(decimals) + frac;
}

function hexToU128(hex: string): bigint {
  const bytes = hexToBytes(hex.length > 32 ? hex.slice(0, 32) : hex);
  let value = BigInt(0);
  for (let i = Math.min(bytes.length, 16) - 1; i >= 0; i--) {
    value = (value << BigInt(8)) | BigInt(bytes[i]);
  }
  return value;
}

export function TokenCard() {
  const { network, activeAccount } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Cache token metadata (name/symbol/decimals) — these don't change.
  const metaCacheRef = useRef<Map<string, { name: string; symbol: string; decimals: number }>>(new Map());

  useEffect(() => {
    if (!activeAccount) return;
    let cancelled = false;

    const fetchTokens = async () => {
      // Discover token contracts from the explorer indexer API.
      let contracts: string[] = [];
      try {
        const apiUrl = getNetworkConfig(network).explorerApiUrl;
        const res = await httpFetch(`${apiUrl}/api/accounts/${activeAccount.accountId}/tokens`);
        if (res.ok) {
          contracts = await res.json();
        }
      } catch {}

      // Fetch all contracts in parallel.
      const results = await Promise.all(
        contracts.map(async (contract): Promise<TokenInfo | null> => {
          try {
            const cached = metaCacheRef.current.get(contract);

            // Always fetch balance; only fetch metadata if not cached.
            const balPromise = callView(network, contract, "balance_of", activeAccount.accountId);
            let name: string, symbol: string, decimals: number;

            if (cached) {
              name = cached.name;
              symbol = cached.symbol;
              decimals = cached.decimals;
              const balRes = await balPromise;
              const balance = balRes.success ? hexToU128(balRes.return_data) : BigInt(0);
              return { contract, name, symbol, balance, decimals };
            }

            const [balRes, nameRes, symRes, decRes] = await Promise.all([
              balPromise,
              callView(network, contract, "name"),
              callView(network, contract, "symbol"),
              callView(network, contract, "decimals"),
            ]);

            const balance = balRes.success ? hexToU128(balRes.return_data) : BigInt(0);
            name = nameRes.success
              ? new TextDecoder().decode(hexToBytes(nameRes.return_data))
              : contract.slice(0, 12) + "...";
            symbol = symRes.success
              ? new TextDecoder().decode(hexToBytes(symRes.return_data))
              : "???";
            decimals = decRes.success && decRes.return_data.length >= 2
              ? parseInt(decRes.return_data.slice(0, 2), 16)
              : 8;

            metaCacheRef.current.set(contract, { name, symbol, decimals });
            return { contract, name, symbol, balance, decimals };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      const found = results.filter((t): t is TokenInfo => t !== null);
      setTokens(found);
      if (found.length > 0 && !selectedToken) {
        setSelectedToken(found[0].contract);
      }
    };

    fetchTokens();
    const interval = setInterval(fetchTokens, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [network, activeAccount]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount || !selectedToken || !recipient || !amount) return;

    setSubmitting(true);
    setResult(null);

    try {
      const accountInfo = await getAccount(network, activeAccount.accountId);
      const currentNonce = accountInfo.nonce;

      // Build args: to[32] + amount[16 LE]
      const recipientBytes = addressToBytes(recipient);
      const toHex = Array.from(recipientBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const token = tokens.find((t) => t.contract === selectedToken);
      const amountBigInt = parseTokenAmount(amount, token?.decimals ?? 8);
      const amountBytes = new Uint8Array(16);
      let val = amountBigInt;
      for (let i = 0; i < 16; i++) {
        amountBytes[i] = Number(val & BigInt(0xff));
        val >>= BigInt(8);
      }
      const amountHex = Array.from(amountBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const args = toHex + amountHex;

      const operation: UserOperation = {
        sender: activeAccount.accountId,
        nonce: currentNonce,
        actions: [
          {
            type: "call",
            to: selectedToken,
            method: "transfer",
            args,
          },
        ],
        max_fee: "100000",
        signature: "",
      };

      const senderBytes = Array.from(addressToBytes(activeAccount.accountId));
      const targetBytes = Array.from(addressToBytes(selectedToken));
      const argsBytes = Array.from(hexToBytes(args));
      const rustActions = [{ Call: { target: targetBytes, method: "transfer", args: argsBytes } }];
      const sigMsg = buildSigningMessage(senderBytes, currentNonce, 100000, rustActions, networks[network].chainId);
      operation.signature = await signMessage(activeAccount.secretKey, sigMsg);

      await submitOperation(network, operation);

      setResult({
        success: true,
        message: `Sent ${amount} ${token?.symbol || "tokens"} to ${recipient.slice(0, 12)}...`,
      });
      setAmount("");
      setRecipient("");
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "Transfer failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeAccount || tokens.length === 0) return null;

  const tokensWithBalance = tokens.filter((t) => t.balance > BigInt(0));
  const selected = tokensWithBalance.find((t) => t.contract === selectedToken);

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Token Balances</h3>

      {/* Token selector + balance display */}
      <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
        <select
          value={selectedToken}
          onChange={(e) => setSelectedToken(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500/50 mb-2"
        >
          {tokensWithBalance.map((t) => (
            <option key={t.contract} value={t.contract}>
              {t.symbol} — {t.name}
            </option>
          ))}
        </select>
        {selected && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Balance</span>
              <span className="text-xl font-bold text-purple-400">
                {formatTokenAmount(selected.balance, selected.decimals)} <span className="text-sm font-normal text-gray-500">{selected.symbol}</span>
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
              <span className="text-xs text-gray-500">Contract ID</span>
              <button
                onClick={() => openUrl(`${getNetworkConfig(network).explorerUrl}/account/${selected.contract}`)}
                className="text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                title={selected.contract}
              >
                {selected.contract.slice(0, 12)}...{selected.contract.slice(-6)}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Decimals</span>
              <span className="text-xs text-gray-300">{selected.decimals}</span>
            </div>
          </div>
        )}
      </div>

      {/* Send form — only show if user has tokens */}
      {selected && selected.balance > BigInt(0) && (
        <form onSubmit={handleTransfer} className="space-y-3">
          <div className="text-sm text-gray-400 font-medium">Send {selected.symbol}</div>

          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Recipient address (Base58 or hex)"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 font-mono"
          />

          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 pr-16 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              {selected.symbol}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || !recipient || !amount}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {submitting ? "Sending..." : `Send ${selected.symbol}`}
          </button>
        </form>
      )}

      {result && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm ${
            result.success
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
