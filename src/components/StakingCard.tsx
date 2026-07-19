import { useEffect, useState, useCallback } from "react";
import { useWallet } from "../lib/context";
import {
  getAccount,
  getBalance,
  getValidators,
  getStakingInfo,
  submitOperation,
  type ValidatorInfo,
  type StakingInfo,
  type UserOperation,
} from "../lib/rpc";
import { formatBalance, parseAmount, signOperation, buildSigningMessage, addressToBytes } from "../lib/wallet";
import { networks } from "../lib/networks";
import { hexToBytes } from "@noble/hashes/utils";

const STAKING_ADDRESS = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff01";

export function StakingCard() {
  const { network, activeAccount } = useWallet();
  const [validators, setValidators] = useState<ValidatorInfo[]>([]);
  const [stakingInfo, setStakingInfo] = useState<StakingInfo | null>(null);
  const [selectedValidator, setSelectedValidator] = useState("");
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"stake" | "unstake">("stake");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  // Build a set of validators the user is staking with.
  const myDelegations = new Map<string, string>();
  if (stakingInfo) {
    for (const d of stakingInfo.delegations) {
      myDelegations.set(d.validator, d.amount);
    }
  }

  // Fetch validators, staking info, and balance.
  const fetchData = useCallback(async () => {
    try {
      const vals = await getValidators(network);
      setValidators(vals);

      if (activeAccount) {
        const [info, bal] = await Promise.all([
          getStakingInfo(network, activeAccount.accountId),
          getBalance(network, activeAccount.accountId),
        ]);
        setStakingInfo(info);
        setBalance(bal);
      }
    } catch {
      // Network may not be available yet.
    }
  }, [network, activeAccount]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleWithdraw = async () => {
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
            to: STAKING_ADDRESS,
            method: "withdraw",
            args: "", // epoch read from chain meta by the system call
          },
        ],
        max_fee: "100000",
        signature: "",
      };

      const senderBytes = Array.from(addressToBytes(activeAccount.accountId));
      const targetBytes = Array.from(hexToBytes(STAKING_ADDRESS));
      const rustActions = [{ Call: { target: targetBytes, method: "withdraw", args: [] as number[] } }];
      const sigMsg = buildSigningMessage(senderBytes, currentNonce, 100000, rustActions, networks[network].chainId);
      operation.signature = await signOperation(activeAccount, sigMsg);

      await submitOperation(network, operation);
      setResult({ success: true, message: "Withdraw submitted. Matured tokens will be credited to your balance." });
      fetchData();
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : "Withdraw failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount || !selectedValidator || !amount) return;

    setSubmitting(true);
    setResult(null);

    try {
      const rawAmount = parseAmount(amount);

      // Build system call args: validator[32 bytes hex] + amount[16 bytes LE hex]
      const validatorBytes = addressToBytes(selectedValidator);
      const validatorHex = Array.from(validatorBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const amountBigInt = BigInt(rawAmount);
      const amountBytes = new Uint8Array(16);
      let val = amountBigInt;
      for (let i = 0; i < 16; i++) {
        amountBytes[i] = Number(val & 0xFFn);
        val >>= 8n;
      }
      const amountHex = Array.from(amountBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const args = validatorHex + amountHex;

      const method = action === "stake" ? "delegate" : "undelegate";

      // Fetch current nonce.
      const accountInfo = await getAccount(network, activeAccount.accountId);
      const currentNonce = accountInfo.nonce;

      const operation: UserOperation = {
        sender: activeAccount.accountId,
        nonce: currentNonce,
        actions: [
          {
            type: "call",
            to: STAKING_ADDRESS,
            method,
            args,
          },
        ],
        max_fee: "100000",
        signature: "",
      };

      // Build the signing message matching the Rust node format.
      const senderBytes = Array.from(addressToBytes(activeAccount.accountId));
      const targetBytes = Array.from(hexToBytes(STAKING_ADDRESS));
      const argsBytes = Array.from(hexToBytes(args));
      const rustActions = [{ Call: { target: targetBytes, method, args: argsBytes } }];
      const sigMsg = buildSigningMessage(senderBytes, currentNonce, 100000, rustActions, networks[network].chainId);
      operation.signature = await signOperation(activeAccount, sigMsg);

      await submitOperation(network, operation);
      setResult({
        success: true,
        message: action === "stake"
          ? `Staked ${amount} SOLEN to ${selectedValidator.slice(0, 8)}...`
          : `Unstaking ${amount} SOLEN from ${selectedValidator.slice(0, 8)}...`,
      });
      setAmount("");
      fetchData();
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "Staking failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeAccount) return null;

  const totalStaked = stakingInfo ? formatBalance(stakingInfo.total_delegated) : "0";

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Staking</h3>

      {/* Staking summary */}
      <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Your Total Staked</span>
          <span className="text-xl font-bold text-emerald-400">{totalStaked} SOLEN</span>
        </div>
        {stakingInfo && stakingInfo.delegations.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-700/50">
            {stakingInfo.delegations.map((d, i) => {
              const validator = validators.find((v) => v.address === d.validator);
              const isSelected = selectedValidator === d.validator;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedValidator(d.validator)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-emerald-600/20 border border-emerald-500/50"
                      : "bg-gray-800/50 border border-transparent hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${validator && !validator.is_active ? "bg-red-500" : isSelected ? "bg-emerald-400" : "bg-emerald-500"}`} />
                    <div>
                      <span className="font-mono text-xs text-gray-300">{d.validator.slice(0, 12)}...{d.validator.slice(-6)}</span>
                      {validator?.is_genesis && (
                        <span className="ml-1 text-[10px] text-indigo-400">Genesis</span>
                      )}
                      {validator && !validator.is_active && (
                        <span className="ml-1 text-[10px] text-red-400 font-medium">Jailed</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-emerald-400">{formatBalance(d.amount)} SOLEN</span>
                </button>
              );
            })}
          </div>
        )}
        {stakingInfo && stakingInfo.pending_undelegations > 0 && (
          <div className="flex items-center justify-between text-xs text-yellow-500 mt-2 pt-2 border-t border-gray-700/50">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              {stakingInfo.pending_undelegations} pending undelegation(s)
            </div>
            <button
              onClick={handleWithdraw}
              disabled={submitting}
              className="bg-yellow-600 hover:bg-yellow-500 text-white text-[10px] font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "..." : "Withdraw"}
            </button>
          </div>
        )}
        {stakingInfo && stakingInfo.delegations.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-2">
            No active delegations
          </div>
        )}
      </div>

      {/* Validators list */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Validators</label>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {validators.map((v) => {
            const myStake = myDelegations.get(v.address);
            const isSelected = selectedValidator === v.address;
            return (
              <button
                key={v.address}
                type="button"
                onClick={() => setSelectedValidator(v.address)}
                className={`w-full flex justify-between items-center px-3 py-2 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? "bg-emerald-600/20 border border-emerald-500/50 text-emerald-300"
                    : "bg-gray-900/50 border border-gray-700/50 text-gray-400 hover:border-gray-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${v.is_active ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="font-mono">{v.address.slice(0, 16)}...</span>
                  {!v.is_active && (
                    <span className="text-[10px] text-red-400 font-medium bg-red-500/10 px-1.5 py-0.5 rounded">Jailed</span>
                  )}
                  {v.is_genesis && (
                    <span className="text-[10px] text-indigo-400">Genesis</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {myStake && (
                    <span className="text-emerald-400 font-medium">Staking: {formatBalance(myStake)}</span>
                  )}
                  <span className="text-gray-500">{((v.commission_bps || 1000) / 100).toFixed(0)}% fee</span>
                  <span>{formatBalance(v.total_stake)} staked</span>
                </div>
              </button>
            );
          })}
          {validators.length === 0 && (
            <div className="text-xs text-gray-600 text-center py-4">
              No validators found
            </div>
          )}
        </div>
      </div>

      {/* Stake/Unstake form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAction("stake")}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              action === "stake"
                ? "bg-emerald-600 text-white"
                : "bg-gray-900 text-gray-400 hover:text-gray-300"
            }`}
          >
            Stake
          </button>
          <button
            type="button"
            onClick={() => setAction("unstake")}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              action === "unstake"
                ? "bg-orange-600 text-white"
                : "bg-gray-900 text-gray-400 hover:text-gray-300"
            }`}
          >
            Unstake
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 pr-20 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-solen-orange/50"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            SOLEN
          </span>
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedValidator || !amount}
          className={`w-full font-medium py-2.5 rounded-lg transition-colors disabled:bg-gray-700 disabled:text-gray-500 text-white ${
            action === "stake"
              ? "bg-solen-orange hover:bg-solen-orange-light"
              : "bg-orange-600 hover:bg-orange-500"
          }`}
        >
          {submitting
            ? "Submitting..."
            : action === "stake"
              ? "Stake SOLEN"
              : "Unstake SOLEN"}
        </button>

        <div className="text-xs text-gray-500 text-center">
          Available balance: <span className="text-gray-300">{balance !== null ? formatBalance(balance) : "..."} SOLEN</span>
        </div>
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
