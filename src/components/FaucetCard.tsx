import { useState } from "react";
import { useWallet } from "../lib/context";
import { networks } from "../lib/networks";
import { requestDrip, getFaucetStatus, type FaucetStatus } from "../lib/faucet";
import { formatBalance } from "../lib/wallet";

export function FaucetCard() {
  const { network, activeAccount } = useWallet();
  const [claiming, setClaiming] = useState(false);
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const faucetUrl = networks[network].faucetUrl;
  if (!faucetUrl || !activeAccount) return null;

  const handleClaim = async () => {
    setClaiming(true);
    setResult(null);

    try {
      const res = await requestDrip(network, activeAccount.accountId);
      setResult({
        success: true,
        message: `Received ${formatBalance(res.amount)} SOLEN`,
      });
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "Faucet request failed",
      });
    } finally {
      setClaiming(false);
    }
  };

  const loadStatus = async () => {
    try {
      const s = await getFaucetStatus(network);
      setStatus(s);
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-200">Faucet</h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: networks[network].color + "20",
            color: networks[network].color,
          }}
        >
          {networks[network].name}
        </span>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Claim free {networks[network].name} SOLEN tokens for testing.
      </p>

      <button
        onClick={handleClaim}
        disabled={claiming}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
      >
        {claiming ? "Claiming..." : "Claim Tokens"}
      </button>

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

      <button
        onClick={loadStatus}
        className="mt-3 text-xs text-gray-500 hover:text-gray-400 transition-colors"
      >
        View faucet status
      </button>

      {status && (
        <div className="mt-2 text-xs text-gray-500 space-y-1">
          <div>Drip amount: {formatBalance(status.drip_amount)} SOLEN</div>
          <div>Cooldown: {status.cooldown_secs}s</div>
          <div>Faucet balance: {formatBalance(status.balance)} SOLEN</div>
        </div>
      )}
    </div>
  );
}
