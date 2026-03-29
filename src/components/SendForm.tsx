import { useState } from "react";
import { useWallet } from "../lib/context";
import { submitOperation, type UserOperation } from "../lib/rpc";
import { parseAmount, signMessage } from "../lib/wallet";


export function SendForm() {
  const { network, activeAccount } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount || !recipient || !amount) return;

    setSending(true);
    setResult(null);

    try {
      const rawAmount = parseAmount(amount);

      // Build the operation
      const operation: UserOperation = {
        sender: activeAccount.accountId,
        nonce: 0, // Will be filled by node
        actions: [
          {
            type: "transfer",
            to: recipient,
            amount: rawAmount,
          },
        ],
        max_fee: "10000",
        signature: "",
      };

      // Sign the operation
      const opBytes = new TextEncoder().encode(JSON.stringify(operation));
      operation.signature = signMessage(activeAccount.secretKey, opBytes);

      const res = await submitOperation(network, operation);
      setResult({
        success: true,
        message: `Sent! TX: ${res.op_hash.slice(0, 16)}...`,
      });
      setRecipient("");
      setAmount("");
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setSending(false);
    }
  };

  if (!activeAccount) return null;

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Send SOLEN</h3>

      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Recipient</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Account ID (hex)"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 font-mono"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Amount</label>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 pr-20 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              SOLEN
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={sending || !recipient || !amount}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>

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
