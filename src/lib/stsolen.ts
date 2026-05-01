/**
 * stSOLEN-specific helpers — exchange rate, op builders, BigInt-safe math.
 *
 * Mirrors the lib in `~/solenstake/src/lib/stsolen.ts` (the dapp); kept here
 * as a copy so the desktop wallet stays self-contained. If we ever merge the
 * two surfaces into a shared package, this file can be deleted.
 */

import { hexToBytes } from "@noble/hashes/utils";
import {
  callView,
  type UserOperation,
  type Action,
} from "./rpc";
import type { NetworkId } from "./networks";
import { networks } from "./networks";
import { addressToBytes } from "./wallet";

const SOLEN_DECIMALS = 8n;
const SOLEN_BASE_UNIT = 100_000_000n;
export const BOOTSTRAP_BURN = 1_000n;
export const MIN_FIRST_DEPOSIT = 11_100n;

export interface ExchangeRate {
  pool: bigint; // total_pooled_solen, base units
  supply: bigint; // total_supply, base units
}

// ── Network helpers ──────────────────────────────────────────────

export function isStsolenSupported(network: NetworkId): boolean {
  return !!networks[network].stsolenAddress;
}

export function stsolenAddress(network: NetworkId): string | null {
  return networks[network].stsolenAddress;
}

// ── Hex / byte helpers ───────────────────────────────────────────

function decodeU128LE(hex: string): bigint {
  if (hex.length < 32) return 0n;
  let v = 0n;
  for (let i = 30; i >= 0; i -= 2) {
    v = (v << 8n) | BigInt(parseInt(hex.substring(i, i + 2), 16));
  }
  return v;
}

function decodeU64LE(hex: string): bigint {
  if (hex.length < 16) return 0n;
  let v = 0n;
  for (let i = 14; i >= 0; i -= 2) {
    v = (v << 8n) | BigInt(parseInt(hex.substring(i, i + 2), 16));
  }
  return v;
}

function bytesToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function u128LE(v: bigint): number[] {
  const out: number[] = new Array(16);
  let x = v;
  for (let i = 0; i < 16; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function u64LE(v: bigint): number[] {
  const out: number[] = new Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

// ── Reads ────────────────────────────────────────────────────────

export async function readExchangeRate(
  network: NetworkId,
): Promise<ExchangeRate | null> {
  const addr = networks[network].stsolenAddress;
  if (!addr) return null;
  try {
    const r = await callView(network, addr, "exchange_rate");
    if (!r.success || r.return_data.length < 64) return null;
    return {
      pool: decodeU128LE(r.return_data.substring(0, 32)),
      supply: decodeU128LE(r.return_data.substring(32, 64)),
    };
  } catch {
    return null;
  }
}

export async function readStsolenBalance(
  network: NetworkId,
  accountId: string,
): Promise<bigint> {
  const addr = networks[network].stsolenAddress;
  if (!addr) return 0n;
  try {
    const argHex = bytesToHex(Array.from(addressToBytes(accountId)));
    const r = await callView(network, addr, "balance_of", argHex);
    if (!r.success) return 0n;
    return decodeU128LE(r.return_data);
  } catch {
    return 0n;
  }
}

export async function readPaused(network: NetworkId): Promise<boolean> {
  const addr = networks[network].stsolenAddress;
  if (!addr) return false;
  try {
    const r = await callView(network, addr, "paused");
    if (!r.success || r.return_data.length < 2) return false;
    return parseInt(r.return_data.substring(0, 2), 16) === 1;
  } catch {
    return false;
  }
}

export async function readCurrentEpoch(network: NetworkId): Promise<bigint> {
  const { rpcUrl } = networks[network];
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "solen_chainStatus",
      params: [],
    }),
  });
  const json = (await resp.json()) as { result?: { height: number } };
  return BigInt(json.result?.height ?? 0) / 100n;
}

export interface WithdrawalEntry {
  seq: bigint;
  account: string;
  solenOwed: bigint;
  requestedEpoch: bigint;
}

export async function readWithdrawalAt(
  network: NetworkId,
  seq: bigint,
): Promise<WithdrawalEntry | null> {
  const addr = networks[network].stsolenAddress;
  if (!addr) return null;
  try {
    const r = await callView(network, addr, "withdrawal_at", bytesToHex(u64LE(seq)));
    if (!r.success || r.return_data.length < 112) return null;
    return {
      seq,
      account: r.return_data.substring(0, 64),
      solenOwed: decodeU128LE(r.return_data.substring(64, 96)),
      requestedEpoch: decodeU64LE(r.return_data.substring(96, 112)),
    };
  } catch {
    return null;
  }
}

/**
 * Walk recent `withdrawal_requested` events from the explorer, filter to this
 * account, then verify each is still unclaimed via `withdrawal_at`.
 */
export async function fetchAccountWithdrawals(
  network: NetworkId,
  accountId: string,
): Promise<WithdrawalEntry[]> {
  const addr = networks[network].stsolenAddress;
  if (!addr) return [];
  const apiUrl = networks[network].explorerApiUrl;
  const target = bytesToHex(Array.from(addressToBytes(accountId))).toLowerCase();
  try {
    const resp = await fetch(`${apiUrl}/api/events?limit=200`);
    if (!resp.ok) return [];
    const events = (await resp.json()) as Array<{
      block_height: number;
      emitter: string;
      topic: string;
      data: string;
    }>;
    const seqs: bigint[] = [];
    for (const ev of events) {
      if (ev.topic !== "withdrawal_requested") continue;
      if (ev.data.length < 128) continue;
      const callerHex = ev.data.substring(0, 64).toLowerCase();
      if (callerHex !== target) continue;
      const seq = decodeU64LE(ev.data.substring(96, 112));
      if (!seqs.some((s) => s === seq)) seqs.push(seq);
    }
    const entries = await Promise.all(seqs.map((s) => readWithdrawalAt(network, s)));
    return entries.filter((e): e is WithdrawalEntry => e !== null);
  } catch {
    return [];
  }
}

// ── BigInt math ──────────────────────────────────────────────────

export function previewMint(amountIn: bigint, rate: ExchangeRate): bigint {
  if (amountIn <= 0n) return 0n;
  if (rate.supply === 0n) {
    if (amountIn < MIN_FIRST_DEPOSIT) return 0n;
    return amountIn - BOOTSTRAP_BURN;
  }
  if (rate.pool === 0n) return 0n;
  return (amountIn * rate.supply) / rate.pool;
}

export function previewOwed(stsolenIn: bigint, rate: ExchangeRate): bigint {
  if (stsolenIn <= 0n || rate.supply === 0n) return 0n;
  return (stsolenIn * rate.pool) / rate.supply;
}

export function backingValue(stsolenBal: bigint, rate: ExchangeRate): bigint {
  return previewOwed(stsolenBal, rate);
}

export function formatBaseUnits(amount: bigint): string {
  const divisor = 10n ** SOLEN_DECIMALS;
  const whole = amount / divisor;
  const frac = amount % divisor;
  if (frac === 0n) return whole.toString();
  const padded = frac.toString().padStart(Number(SOLEN_DECIMALS), "0");
  const trimmed = padded.replace(/0+$/, "");
  return trimmed.length === 0 ? whole.toString() : `${whole}.${trimmed}`;
}

export function parseBaseUnits(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`invalid number: "${input}"`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (BigInt(frac.length) > SOLEN_DECIMALS) {
    throw new Error(`too many fractional digits (max ${SOLEN_DECIMALS})`);
  }
  const padded = (frac + "0".repeat(Number(SOLEN_DECIMALS))).slice(
    0,
    Number(SOLEN_DECIMALS),
  );
  return BigInt(whole!) * 10n ** SOLEN_DECIMALS + BigInt(padded || "0");
}

// ── Op builders ──────────────────────────────────────────────────
//
// solenwallet uses a slightly different `Action` shape than the bots —
// human-friendly fields rather than serde-tagged structs. The
// `submitOperation` path serializes them appropriately.

function targetHex(network: NetworkId): string {
  const addr = networks[network].stsolenAddress;
  if (!addr) throw new Error("stSOLEN not deployed on this network");
  return addr;
}

export function buildDepositOp(
  network: NetworkId,
  senderId: string,
  nonce: number,
  amount: bigint,
): UserOperation {
  const addr = targetHex(network);
  return {
    sender: senderId,
    nonce,
    actions: [
      { type: "transfer", to: addr, amount: amount.toString() } as Action,
      { type: "call", to: addr, method: "deposit", args: "" } as Action,
    ],
    max_fee: "1000000",
    signature: "",
  };
}

export function buildRequestWithdrawalOp(
  network: NetworkId,
  senderId: string,
  nonce: number,
  stsolenBurn: bigint,
): UserOperation {
  const addr = targetHex(network);
  return {
    sender: senderId,
    nonce,
    actions: [
      {
        type: "call",
        to: addr,
        method: "request_withdrawal",
        args: bytesToHex(u128LE(stsolenBurn)),
      } as Action,
    ],
    max_fee: "1000000",
    signature: "",
  };
}

/** 2-action atomic claim with auto-crank — see `~/solenstake/src/lib/stsolen.ts` for rationale. */
export function buildClaimWithCrankOp(
  network: NetworkId,
  senderId: string,
  nonce: number,
  seq: bigint,
): UserOperation {
  const addr = targetHex(network);
  return {
    sender: senderId,
    nonce,
    actions: [
      { type: "call", to: addr, method: "crank_undelegations", args: "" } as Action,
      {
        type: "call",
        to: addr,
        method: "claim_withdrawal",
        args: bytesToHex(u64LE(seq)),
      } as Action,
    ],
    max_fee: "2000000",
    signature: "",
  };
}

/**
 * Build the rust-shape actions array used by `buildSigningMessage`. Mirrors
 * what StakingCard does for native delegations — the wallet's signing path
 * needs the serde-tagged form that the executor expects.
 */
export function rustActionsForDeposit(
  network: NetworkId,
  amount: bigint,
): unknown[] {
  const target = Array.from(hexToBytes(targetHex(network)));
  return [
    { Transfer: { to: target, amount: Number(amount) } },
    { Call: { target, method: "deposit", args: [] as number[] } },
  ];
}

export function rustActionsForRequestWithdrawal(
  network: NetworkId,
  stsolenBurn: bigint,
): unknown[] {
  const target = Array.from(hexToBytes(targetHex(network)));
  return [
    { Call: { target, method: "request_withdrawal", args: u128LE(stsolenBurn) } },
  ];
}

export function rustActionsForClaimWithCrank(
  network: NetworkId,
  seq: bigint,
): unknown[] {
  const target = Array.from(hexToBytes(targetHex(network)));
  return [
    { Call: { target, method: "crank_undelegations", args: [] as number[] } },
    { Call: { target, method: "claim_withdrawal", args: u64LE(seq) } },
  ];
}

// ── Constants ────────────────────────────────────────────────────

export const UNBONDING_EPOCHS = 7n;
export const EPOCH_LENGTH_BLOCKS = 100n;
export const BLOCK_TIME_SECONDS = 2n;
export { SOLEN_DECIMALS, SOLEN_BASE_UNIT };
