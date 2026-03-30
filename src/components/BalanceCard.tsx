import { useState, useEffect, useCallback } from "react";
import { useWallet } from "../lib/context";
import { getBalance } from "../lib/rpc";
import { formatBalance } from "../lib/wallet";

export function BalanceCard() {
  const { network, activeAccount } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);
    try {
      const raw = await getBalance(network, activeAccount.accountId);
      setBalance(raw);
    } catch {
      // Keep the last known balance on failure — just retry next interval.
    } finally {
      setLoading(false);
    }
  }, [network, activeAccount]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  if (!activeAccount) return null;

  return (
    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900 rounded-2xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">Total Balance</span>
        <button
          onClick={fetchBalance}
          disabled={loading}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="Refresh balance"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-white">
          {balance !== null ? formatBalance(balance) : loading ? "..." : "0"}
        </span>
        <span className="text-lg text-gray-400">SOLEN</span>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700/50">
        <div className="text-xs text-gray-500 font-mono break-all">
          {activeAccount.accountId}
        </div>
      </div>
    </div>
  );
}
