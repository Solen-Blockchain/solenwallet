import { useEffect, useState } from "react";
import { useWallet } from "../lib/context";
import {
  getAccount,
  callView,
  submitOperation,
  type UserOperation,
} from "../lib/rpc";
import { signMessage, buildSigningMessage } from "../lib/wallet";
import { networks } from "../lib/networks";
import { httpFetch } from "../lib/http";
import { hexToBytes } from "@noble/hashes/utils";

interface TokenInfo {
  contract: string;
  name: string;
  symbol: string;
  balance: bigint;
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

  useEffect(() => {
    if (!activeAccount) return;

    const fetchTokens = async () => {
      // Discover token contracts from the explorer indexer API.
      let contracts: string[] = [];
      try {
        const apiUrl = networks[network].explorerApiUrl;
        const res = await httpFetch(`${apiUrl}/api/accounts/${activeAccount.accountId}/tokens`);
        if (res.ok) {
          contracts = await res.json();
        }
      } catch {}
      const found: TokenInfo[] = [];

      for (const contract of contracts) {
        try {
          const [balRes, nameRes, symRes] = await Promise.all([
            callView(network, contract, "balance_of", activeAccount.accountId),
            callView(network, contract, "name"),
            callView(network, contract, "symbol"),
          ]);

          const balance = balRes.success ? hexToU128(balRes.return_data) : BigInt(0);
          const name = nameRes.success
            ? new TextDecoder().decode(hexToBytes(nameRes.return_data))
            : contract.slice(0, 12) + "...";
          const symbol = symRes.success
            ? new TextDecoder().decode(hexToBytes(symRes.return_data))
            : "???";

          found.push({ contract, name, symbol, balance });
        } catch {
          // Contract not accessible.
        }
      }

      setTokens(found);
      if (found.length > 0 && !selectedToken) {
        setSelectedToken(found[0].contract);
      }
    };

    fetchTokens();
    const interval = setInterval(fetchTokens, 15000);
    return () => clearInterval(interval);
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
      const toHex = recipient.replace(/^0x/, "").padEnd(64, "0");
      const amountBigInt = BigInt(amount);
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

      const senderBytes = Array.from(hexToBytes(activeAccount.accountId));
      const targetBytes = Array.from(hexToBytes(selectedToken));
      const argsBytes = Array.from(hexToBytes(args));
      const rustActions = [{ Call: { target: targetBytes, method: "transfer", args: argsBytes } }];
      const sigMsg = buildSigningMessage(senderBytes, currentNonce, 100000, rustActions, networks[network].chainId);
      operation.signature = await signMessage(activeAccount.secretKey, sigMsg);

      await submitOperation(network, operation);

      const token = tokens.find((t) => t.contract === selectedToken);
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Balance</span>
            <span className="text-xl font-bold text-purple-400">
              {selected.balance.toLocaleString()} <span className="text-sm font-normal text-gray-500">{selected.symbol}</span>
            </span>
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
            placeholder="Recipient account ID (hex)"
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
