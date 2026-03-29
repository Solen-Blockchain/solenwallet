import { useState, useEffect, useCallback } from "react";
import { useWallet } from "../lib/context";
import { networks } from "../lib/networks";
import { formatBalance } from "../lib/wallet";

interface Transaction {
  hash: string;
  block_height: number;
  timestamp: number;
  actions: Array<{
    type: string;
    to?: string;
    amount?: string;
  }>;
  status: string;
  gas_used: number;
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
      const res = await fetch(
        `${apiUrl}/api/accounts/${activeAccount.accountId}/txs?limit=20`,
      );
      if (!res.ok) throw new Error(`Failed to fetch transactions`);
      const data = await res.json();
      setTxs(Array.isArray(data) ? data : data.transactions || []);
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
          {txs.map((tx) => (
            <div
              key={tx.hash}
              className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                    tx.status === "success"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {tx.actions[0]?.type === "transfer" ? "TX" : tx.actions[0]?.type?.slice(0, 2).toUpperCase() || "??"}
                </div>
                <div>
                  <div className="text-sm text-gray-300">
                    {tx.actions[0]?.type === "transfer" && tx.actions[0]?.to
                      ? `To ${truncate(tx.actions[0].to)}`
                      : tx.actions[0]?.type || "Unknown"}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {truncate(tx.hash)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {tx.actions[0]?.amount && (
                  <div className="text-sm text-gray-300">
                    {formatBalance(tx.actions[0].amount)} SOLEN
                  </div>
                )}
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
