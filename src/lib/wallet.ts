import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

// ed25519 v3 requires sha512 configured for async operations
(ed25519.etc as Record<string, unknown>).sha512Async = async (...m: Uint8Array[]) =>
  sha512(ed25519.etc.concatBytes(...m));

// --- Base58 (Bitcoin alphabet) ---
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  // Count leading zeros
  let zeros = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    zeros++;
  }
  // Convert to BigInt
  let num = BigInt(0);
  for (const b of bytes) {
    num = num * BigInt(256) + BigInt(b);
  }
  // Encode
  const chars: string[] = [];
  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(58));
    num = num / BigInt(58);
    chars.unshift(BASE58_ALPHABET[remainder]);
  }
  // Add leading '1's for each leading zero byte
  for (let i = 0; i < zeros; i++) {
    chars.unshift("1");
  }
  return chars.join("");
}

export function base58Decode(str: string): Uint8Array {
  // Count leading '1's
  let zeros = 0;
  for (const c of str) {
    if (c !== "1") break;
    zeros++;
  }
  // Convert from base58 to BigInt
  let num = BigInt(0);
  for (const c of str) {
    const idx = BASE58_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error(`Invalid Base58 character: ${c}`);
    num = num * BigInt(58) + BigInt(idx);
  }
  // Convert BigInt to bytes
  const hex = num === BigInt(0) ? "" : num.toString(16).padStart(2, "0");
  const paddedHex = hex.length % 2 ? "0" + hex : hex;
  const byteLen = paddedHex.length / 2;
  const result = new Uint8Array(zeros + byteLen);
  for (let i = 0; i < byteLen; i++) {
    result[zeros + i] = parseInt(paddedHex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

/**
 * Detect whether a string is hex or Base58, and return the raw 32-byte array.
 * - 64-char hex string (with optional 0x prefix) -> hex decode
 * - Otherwise -> Base58 decode
 */
export function addressToBytes(address: string): Uint8Array {
  const clean = address.startsWith("0x") ? address.slice(2) : address;
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return hexToBytes(clean);
  }
  return base58Decode(address);
}

export interface Keypair {
  publicKey: string; // hex
  secretKey: string; // hex (64 bytes: 32 secret + 32 public)
}

export interface WalletAccount {
  name: string;
  accountId: string; // Base58, derived from public key
  publicKey: string;
  secretKey: string; // hex; for HD accounts this is re-derived from the
                     // mnemonic at unlock and not persisted to the keystore.
  /** If present, this account was derived from a stored mnemonic.
   *  The secretKey above is re-derived after each unlock; the canonical
   *  source of truth is `{mnemonicId, derivationIndex}` in the keystore. */
  hd?: {
    mnemonicId: string;
    derivationIndex: number;
  };
}

export async function generateKeypair(): Promise<Keypair> {
  const privKey = ed25519.utils.randomSecretKey();
  const pubKey = await ed25519.getPublicKeyAsync(privKey);
  return {
    publicKey: bytesToHex(pubKey),
    secretKey: bytesToHex(privKey) + bytesToHex(pubKey),
  };
}

export async function keypairFromSecret(secretHex: string): Promise<Keypair> {
  const privBytes = hexToBytes(secretHex.slice(0, 64));
  const pubKey = await ed25519.getPublicKeyAsync(privBytes);
  return {
    publicKey: bytesToHex(pubKey),
    secretKey: secretHex.slice(0, 64) + bytesToHex(pubKey),
  };
}

export async function signMessage(secretHex: string, message: Uint8Array): Promise<string> {
  const privBytes = hexToBytes(secretHex.slice(0, 64));
  const sig = await ed25519.signAsync(message, privBytes);
  return bytesToHex(sig);
}

export function publicKeyToAccountId(pubKeyHex: string): string {
  // Account ID IS the public key, encoded as Base58.
  // Ed25519 public keys are always 32 bytes (64 hex chars).
  return base58Encode(hexToBytes(pubKeyHex));
}

// loadAccounts/saveAccounts are the legacy API used by existing UI. They now
// route through the v2 keystore (see ./keystore.ts) but expose the unchanged
// WalletAccount[] shape so callers don't need to change. HD-derived accounts
// (kind: "hd") are not surfaced through this API — phase 2 UI will use the
// keystore module directly.
import {
  loadKeystore,
  saveKeystore,
  type StoredKey,
} from "./keystore";

export function loadAccounts(): WalletAccount[] {
  const ks = loadKeystore();
  // Migrate old 64-char-hex accountIds to Base58 in-place. Mirrors the
  // pre-v2 migration behavior — kept for users upgrading across both
  // boundaries simultaneously.
  let migrated = false;
  for (const acc of ks.accounts) {
    if (acc.kind === "key" &&
        acc.accountId.length === 64 &&
        /^[0-9a-fA-F]+$/.test(acc.accountId)) {
      acc.accountId = publicKeyToAccountId(acc.accountId);
      migrated = true;
    }
  }
  if (migrated) saveKeystore(ks);

  return ks.accounts
    .filter((a): a is StoredKey & { kind: "key" } => a.kind === "key")
    .map(({ kind: _kind, ...rest }) => rest);
}

export function saveAccounts(accounts: WalletAccount[]) {
  const ks = loadKeystore();
  const hdOnly = ks.accounts.filter((a) => a.kind === "hd");
  const keyAccounts: StoredKey[] = accounts.map((a) => ({ kind: "key", ...a }));
  saveKeystore({ ...ks, accounts: [...hdOnly, ...keyAccounts] });
}

export async function createAccount(name: string): Promise<WalletAccount> {
  const kp = await generateKeypair();
  return {
    name,
    accountId: publicKeyToAccountId(kp.publicKey),
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
}

export async function importAccount(name: string, secretKey: string): Promise<WalletAccount> {
  const kp = await keypairFromSecret(secretKey);
  return {
    name,
    accountId: publicKeyToAccountId(kp.publicKey),
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
}

/**
 * Build the signing message for a UserOperation, matching the Rust node's format:
 * chain_id[8 LE] + sender[32] + nonce[8 LE] + max_fee[16 LE] + blake3(json(actions))[32]
 *
 * The `rustActions` parameter should be the actions in Rust serde format
 * (e.g., [{ "Transfer": { "to": [...], "amount": 100 } }]).
 */
export function buildSigningMessage(
  senderBytes: number[],
  nonce: number,
  maxFee: number,
  rustActions: unknown[],
  chainId: number = 0,
): Uint8Array {
  const msg = new Uint8Array(8 + 32 + 8 + 16 + 32); // 96 bytes total

  // chain_id[8 LE]
  const chainView = new DataView(new ArrayBuffer(8));
  chainView.setBigUint64(0, BigInt(chainId), true);
  msg.set(new Uint8Array(chainView.buffer), 0);

  // sender[32]
  msg.set(senderBytes, 8);

  // nonce[8 LE]
  const nonceView = new DataView(new ArrayBuffer(8));
  nonceView.setBigUint64(0, BigInt(nonce), true);
  msg.set(new Uint8Array(nonceView.buffer), 40);

  // max_fee[16 LE] (u128 — just use first 8 bytes, rest zero)
  const feeView = new DataView(new ArrayBuffer(16));
  feeView.setBigUint64(0, BigInt(maxFee), true);
  msg.set(new Uint8Array(feeView.buffer), 48);

  // blake3(json(actions))[32]
  const actionsJson = JSON.stringify(rustActions);
  const actionsHash = blake3(new TextEncoder().encode(actionsJson));
  msg.set(actionsHash.slice(0, 32), 64);

  return msg;
}

export function formatBalance(raw: string): string {
  const num = BigInt(raw || "0");
  const decimals = 8;
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const frac = num % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function parseAmount(amount: string): string {
  const decimals = 8;
  const parts = amount.split(".");
  const whole = BigInt(parts[0] || "0");
  const fracStr = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
  const frac = BigInt(fracStr);
  return (whole * BigInt(10 ** decimals) + frac).toString();
}
