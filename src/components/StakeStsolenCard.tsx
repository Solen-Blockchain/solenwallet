import { useEffect, useState, useCallback } from "react";
import { hexToBytes } from "@noble/hashes/utils";
import { useWallet } from "../lib/context";
import {
  getAccount,
  submitOperation,
  type UserOperation,
} from "../lib/rpc";
import {
  signMessage,
  buildSigningMessage,
  addressToBytes,
} from "../lib/wallet";
import { networks } from "../lib/networks";
import {
  BLOCK_TIME_SECONDS,
  EPOCH_LENGTH_BLOCKS,
  UNBONDING_EPOCHS,
  backingValue,
  buildClaimWithCrankOp,
  buildDepositOp,
  buildRequestWithdrawalOp,
  fetchAccountWithdrawals,
  formatBaseUnits,
  isStsolenSupported,
  parseBaseUnits,
  previewMint,
  previewOwed,
  readCurrentEpoch,
  readExchangeRate,
  readPaused,
  readStsolenBalance,
  rustActionsForClaimWithCrank,
  rustActionsForDeposit,
  rustActionsForRequestWithdrawal,
  type ExchangeRate,
  type WithdrawalEntry,
} from "../lib/stsolen";

type Tab = "stake" | "unstake" | "claims";

export function StakeStsolenCard() {
  const { network, activeAccount } = useWallet();
  const [tab, setTab] = useState<Tab>("stake");
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [paused, setPaused] = useState(false);
  const [stsolenBal, setStsolenBal] = useState<bigint>(0n);
  const [currentEpoch, setCurrentEpoch] = useState<bigint>(0n);
  const [claims, setClaims] = useState<WithdrawalEntry[]>([]);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!isStsolenSupported(network)) {
      setRate(null);
      return;
    }
    try {
      const [r, p, e] = await Promise.all([
        readExchangeRate(network),
        readPaused(network),
        readCurrentEpoch(network),
      ]);
      setRate(r);
      setPaused(p);
      setCurrentEpoch(e);
      if (activeAccount) {
        const [bal, items] = await Promise.all([
          readStsolenBalance(network, activeAccount.accountId),
          fetchAccountWithdrawals(network, activeAccount.accountId),
        ]);
        setStsolenBal(bal);
        items.sort((a, b) => (a.seq < b.seq ? 1 : a.seq > b.seq ? -1 : 0));
        setClaims(items);
      } else {
        setStsolenBal(0n);
        setClaims([]);
      }
    } catch {
      /* silent */
    }
  }, [network, activeAccount]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15_000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (!isStsolenSupported(network)) {
    return (
      <div className="rounded-xl bg-gray-900 p-6 text-sm text-gray-400">
        stSOLEN is mainnet-only at the moment.
      </div>
    );
  }

  const stsolenBalDisplay = formatBaseUnits(stsolenBal);
  const backingDisplay =
    rate ? formatBaseUnits(backingValue(stsolenBal, rate)) : "0";

  let amountBase: bigint = 0n;
  let parseError: string | null = null;
  if (amount.trim() !== "") {
    try {
      amountBase = parseBaseUnits(amount);
    } catch (e) {
      parseError = (e as Error).message;
    }
  }
  const mintPreview = rate ? previewMint(amountBase, rate) : 0n;
  const owedPreview = rate ? previewOwed(amountBase, rate) : 0n;
  const insufficientStsolen =
    tab === "unstake" && amountBase > 0n && amountBase > stsolenBal;

  async function signAndSubmit(
    op: UserOperation,
    rustActions: unknown[],
    successMsg: string,
  ) {
    if (!activeAccount) return;
    setSubmitting(true);
    setResult(null);
    try {
      const accountInfo = await getAccount(network, activeAccount.accountId);
      op.nonce = accountInfo.nonce;
      const senderBytes = Array.from(addressToBytes(activeAccount.accountId));
      const sigMsg = buildSigningMessage(
        senderBytes,
        op.nonce,
        Number(op.max_fee),
        rustActions,
        networks[network].chainId,
      );
      op.signature = await signMessage(activeAccount.secretKey, sigMsg);
      await submitOperation(network, op);
      setResult({ success: true, message: successMsg });
      setAmount("");
      fetchData();
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "submit failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onStake() {
    if (!activeAccount || !rate || amountBase <= 0n) return;
    const op = buildDepositOp(network, activeAccount.accountId, 0, amountBase);
    await signAndSubmit(
      op,
      rustActionsForDeposit(network, amountBase),
      "Stake submitted. stSOLEN should appear shortly.",
    );
  }

  async function onUnstake() {
    if (!activeAccount || !rate || amountBase <= 0n) return;
    const op = buildRequestWithdrawalOp(
      network,
      activeAccount.accountId,
      0,
      amountBase,
    );
    await signAndSubmit(
      op,
      rustActionsForRequestWithdrawal(network, amountBase),
      "Withdrawal requested. Claim from this card after the unbonding window.",
    );
  }

  async function onClaim(seq: bigint) {
    if (!activeAccount) return;
    const op = buildClaimWithCrankOp(network, activeAccount.accountId, 0, seq);
    await signAndSubmit(
      op,
      rustActionsForClaimWithCrank(network, seq),
      "Claim submitted. SOLEN should land in your balance shortly.",
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">stSOLEN</h2>
          <p className="text-xs text-gray-400">Liquid staking for Solen</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-white tabular-nums">
            {stsolenBalDisplay} stSOLEN
          </div>
          <div className="text-[11px] text-gray-500 tabular-nums">
            ≈ {backingDisplay} SOLEN backing
          </div>
        </div>
      </div>

      {paused && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          Deposits and new withdrawals are paused. Existing claims still work.
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-1 rounded-lg bg-gray-950 p-1">
        {(["stake", "unstake", "claims"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setResult(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
              tab === t ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t}
            {t === "claims" && claims.length > 0 && (
              <span className="ml-1 inline-block rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-300">
                {claims.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab !== "claims" ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Amount ({tab === "stake" ? "SOLEN" : "stSOLEN"})
            </label>
            <input
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={paused || submitting || !activeAccount}
              className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm tabular-nums text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            />
            {parseError && (
              <span className="text-[11px] text-red-400">{parseError}</span>
            )}
            {insufficientStsolen && (
              <span className="text-[11px] text-red-400">
                Insufficient stSOLEN
              </span>
            )}
          </div>

          <div className="rounded-md bg-gray-950/50 px-3 py-2 text-xs tabular-nums space-y-1">
            {tab === "stake" ? (
              <div className="flex justify-between text-gray-400">
                <span>You'll receive</span>
                <span className="text-white">
                  {formatBaseUnits(mintPreview)} stSOLEN
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-gray-400">
                  <span>You'll receive</span>
                  <span className="text-white">
                    {formatBaseUnits(owedPreview)} SOLEN
                  </span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Eligible at epoch</span>
                  <span className="text-white">
                    {(currentEpoch + UNBONDING_EPOCHS + 1n).toString()} (~
                    {Number(
                      (UNBONDING_EPOCHS + 1n) *
                        EPOCH_LENGTH_BLOCKS *
                        BLOCK_TIME_SECONDS,
                    ) / 60}{" "}
                    min)
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-gray-400">
              <span>Rate</span>
              <span>
                {rate && rate.supply > 0n
                  ? `1 stSOLEN = ${formatBaseUnits((10n ** 8n * rate.pool) / rate.supply)} SOLEN`
                  : "1:1 (initial)"}
              </span>
            </div>
          </div>

          <button
            onClick={tab === "stake" ? onStake : onUnstake}
            disabled={
              !activeAccount ||
              !rate ||
              paused ||
              submitting ||
              amountBase <= 0n ||
              parseError !== null ||
              insufficientStsolen
            }
            className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed py-2.5 text-sm font-medium text-white transition-colors"
          >
            {submitting
              ? "Submitting…"
              : tab === "stake"
                ? "Stake SOLEN"
                : "Request withdrawal"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {claims.length === 0 ? (
            <div className="rounded-md bg-gray-950/50 px-3 py-4 text-xs text-gray-500 text-center">
              No pending claims. Use the Unstake tab to start one.
            </div>
          ) : (
            <ul className="space-y-2">
              {claims.map((c) => {
                const eligible = c.requestedEpoch + UNBONDING_EPOCHS + 1n;
                const ready = currentEpoch >= eligible;
                const minsLeft = ready
                  ? 0
                  : Number(
                      (eligible - currentEpoch) *
                        EPOCH_LENGTH_BLOCKS *
                        BLOCK_TIME_SECONDS,
                    ) / 60;
                return (
                  <li
                    key={c.seq.toString()}
                    className="flex items-center justify-between rounded-md bg-gray-950/50 px-3 py-2 text-xs tabular-nums"
                  >
                    <div className="space-y-0.5">
                      <div className="text-white">
                        {formatBaseUnits(c.solenOwed)} SOLEN
                      </div>
                      <div className="text-[10px] text-gray-500">
                        seq {c.seq.toString()} · req'd at epoch{" "}
                        {c.requestedEpoch.toString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ready ? (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                          Ready
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">
                          ~{minsLeft.toFixed(0)} min
                        </span>
                      )}
                      <button
                        onClick={() => onClaim(c.seq)}
                        disabled={!ready || submitting}
                        className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed px-2 py-1 text-[10px] font-medium text-white"
                      >
                        Claim
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {result && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            result.success
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
              : "bg-red-500/10 text-red-300 border border-red-500/40"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
