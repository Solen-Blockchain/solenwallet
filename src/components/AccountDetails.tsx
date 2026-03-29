import { useState } from "react";
import { useWallet } from "../lib/context";

export function AccountDetails() {
  const { activeAccount, removeAccount } = useWallet();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!activeAccount) return null;

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Account Details</h3>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">Account ID</div>
          <div className="flex items-center gap-2">
            <code className="text-sm text-gray-300 font-mono break-all flex-1">
              {activeAccount.accountId}
            </code>
            <button
              onClick={() => copyToClipboard(activeAccount.accountId, "id")}
              className="text-gray-500 hover:text-gray-300 shrink-0"
            >
              {copied === "id" ? (
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Public Key</div>
          <div className="flex items-center gap-2">
            <code className="text-sm text-gray-300 font-mono break-all flex-1">
              {activeAccount.publicKey}
            </code>
            <button
              onClick={() => copyToClipboard(activeAccount.publicKey, "pub")}
              className="text-gray-500 hover:text-gray-300 shrink-0"
            >
              {copied === "pub" ? (
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">Secret Key</span>
            <button
              onClick={() => setShowKey(!showKey)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {showKey && (
            <div className="flex items-center gap-2">
              <code className="text-sm text-red-400 font-mono break-all flex-1">
                {activeAccount.secretKey.slice(0, 64)}
              </code>
              <button
                onClick={() => copyToClipboard(activeAccount.secretKey.slice(0, 64), "sec")}
                className="text-gray-500 hover:text-gray-300 shrink-0"
              >
                {copied === "sec" ? (
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-gray-700/50">
          <button
            onClick={() => {
              if (confirm(`Remove account "${activeAccount.name}"? This cannot be undone.`)) {
                removeAccount(activeAccount.accountId);
              }
            }}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Remove Account
          </button>
        </div>
      </div>
    </div>
  );
}
