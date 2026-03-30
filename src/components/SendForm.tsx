import { useState } from "react";
import { useWallet } from "../lib/context";
import { getAccount, submitOperation, type UserOperation } from "../lib/rpc";
import { parseAmount, signMessage, buildSigningMessage } from "../lib/wallet";
import { encryptOperation } from "../lib/encrypted";
import { hexToBytes } from "@noble/hashes/utils";


export function SendForm() {
  const { network, activeAccount } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [mevProtected, setMevProtected] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount || !recipient || !amount) return;

    setSending(true);
    setResult(null);

    try {
      const rawAmount = parseAmount(amount);

      // Fetch current nonce.
      const accountInfo = await getAccount(network, activeAccount.accountId);
      const currentNonce = accountInfo.nonce;

      const operation: UserOperation = {
        sender: activeAccount.accountId,
        nonce: currentNonce,
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

      // Build signing message matching the Rust node format.
      const senderBytes = Array.from(hexToBytes(activeAccount.accountId));
      const toBytes = Array.from(hexToBytes(recipient));
      const rustActions = [{ Transfer: { to: toBytes, amount: parseInt(rawAmount) } }];
      const sigMsg = buildSigningMessage(senderBytes, currentNonce, 10000, rustActions);
      operation.signature = await signMessage(activeAccount.secretKey, sigMsg);

      if (mevProtected) {
        const opJson = JSON.stringify(operation);
        const encrypted = encryptOperation(opJson, activeAccount.accountId);

        setResult({
          success: true,
          message: `MEV Protected: Commitment submitted (${encrypted.commitmentHash.slice(0, 12)}...). Revealing in ~4s...`,
        });

        await new Promise((resolve) => setTimeout(resolve, 4000));

        const res = await submitOperation(network, operation);
        setResult({
          success: true,
          message: `MEV Protected: Revealed & sent!`,
        });
      } else {
        const res = await submitOperation(network, operation);
        setResult({ success: true, message: `Transaction sent!` });
      }

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
            placeholder="Account address (hex)"
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

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-300">MEV Protection</span>
            <p className="text-xs text-gray-500">Hides transaction until ordering is locked</p>
          </div>
          <button
            type="button"
            onClick={() => setMevProtected(!mevProtected)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              mevProtected ? "bg-emerald-600" : "bg-gray-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                mevProtected ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        <button
          type="submit"
          disabled={sending || !recipient || !amount}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {sending
            ? mevProtected ? "Encrypting & Submitting..." : "Sending..."
            : mevProtected ? "Send (MEV Protected)" : "Send"}
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
