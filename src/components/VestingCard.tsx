import { useEffect, useState } from "react";
import { useWallet } from "../lib/context";
import {
  getAccount,
  getVestingInfo,
  submitOperation,
  type VestingInfo,
  type UserOperation,
} from "../lib/rpc";
import { formatBalance, signMessage, buildSigningMessage } from "../lib/wallet";
import { networks } from "../lib/networks";
import { hexToBytes } from "@noble/hashes/utils";

const VESTING_ADDRESS = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff06";

export function VestingCard() {
  const { network, activeAccount } = useWallet();
  const [vestingInfo, setVestingInfo] = useState<VestingInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      if (!activeAccount) return;
      try {
        const info = await getVestingInfo(network, activeAccount.accountId);
        setVestingInfo(info);
      } catch {
        setVestingInfo(null);
      }
    };

    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [network, activeAccount]);

  const handleClaim = async () => {
    if (!activeAccount) return;

    setSubmitting(true);
    setResult(null);

    try {
      const accountInfo = await getAccount(network, activeAccount.accountId);
      const currentNonce = accountInfo.nonce;

      const operation: UserOperation = {
        sender: activeAccount.accountId,
        nonce: currentNonce,
        actions: [
          {
            type: "call",
            to: VESTING_ADDRESS,
            method: "claim",
            args: "",
          },
        ],
        max_fee: "100000",
        signature: "",
      };

      const senderBytes = Array.from(hexToBytes(activeAccount.accountId));
      const targetBytes = Array.from(hexToBytes(VESTING_ADDRESS));
      const rustActions = [{ Call: { target: targetBytes, method: "claim", args: [] } }];
      const sigMsg = buildSigningMessage(senderBytes, currentNonce, 100000, rustActions, networks[network].chainId);
      operation.signature = await signMessage(activeAccount.secretKey, sigMsg);

      await submitOperation(network, operation);

      setResult({
        success: true,
        message: `Claimed ${formatBalance(vestingInfo?.claimable || "0")} SOLEN`,
      });
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "Claim failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeAccount || !vestingInfo || !vestingInfo.has_schedule) return null;

  const claimable = BigInt(vestingInfo.claimable);

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Token Vesting</h3>

      <div className="bg-gray-900/50 rounded-lg p-4 mb-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Vesting Type</span>
          <span className="text-gray-200 capitalize">{vestingInfo.vesting_type}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Total Allocation</span>
          <span className="text-gray-200">{formatBalance(vestingInfo.total_amount)} SOLEN</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Vested</span>
          <span className="text-emerald-400">{formatBalance(vestingInfo.vested)} SOLEN</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Already Claimed</span>
          <span className="text-gray-200">{formatBalance(vestingInfo.claimed)} SOLEN</span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Vesting Progress</span>
            <span>
              {BigInt(vestingInfo.total_amount) > 0n
                ? ((BigInt(vestingInfo.vested) * 100n) / BigInt(vestingInfo.total_amount)).toString()
                : "0"}%
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{
                width: `${
                  BigInt(vestingInfo.total_amount) > 0n
                    ? Number((BigInt(vestingInfo.vested) * 100n) / BigInt(vestingInfo.total_amount))
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        {claimable > 0n && (
          <div className="flex justify-between text-sm pt-2 border-t border-gray-700/50">
            <span className="text-gray-400">Available to Claim</span>
            <span className="text-emerald-400 font-semibold">
              {formatBalance(vestingInfo.claimable)} SOLEN
            </span>
          </div>
        )}
      </div>

      {claimable > 0n && (
        <button
          onClick={handleClaim}
          disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {submitting ? "Claiming..." : "Claim Vested Tokens"}
        </button>
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
