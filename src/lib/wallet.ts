import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

// ed25519 v3 requires sha512 configured via etc
(ed25519.etc as Record<string, unknown>).sha512Sync = (...m: Uint8Array[]) =>
  sha512(ed25519.etc.concatBytes(...m));

export interface Keypair {
  publicKey: string; // hex
  secretKey: string; // hex (64 bytes: 32 secret + 32 public)
}

export interface WalletAccount {
  name: string;
  accountId: string; // hex, derived from public key
  publicKey: string;
  secretKey: string; // encrypted or raw for now
}

export function generateKeypair(): Keypair {
  const privKey = ed25519.utils.randomSecretKey();
  const pubKey = ed25519.getPublicKey(privKey);
  return {
    publicKey: bytesToHex(pubKey),
    secretKey: bytesToHex(privKey) + bytesToHex(pubKey),
  };
}

export function keypairFromSecret(secretHex: string): Keypair {
  const privBytes = hexToBytes(secretHex.slice(0, 64));
  const pubKey = ed25519.getPublicKey(privBytes);
  return {
    publicKey: bytesToHex(pubKey),
    secretKey: secretHex.slice(0, 64) + bytesToHex(pubKey),
  };
}

export function signMessage(secretHex: string, message: Uint8Array): string {
  const privBytes = hexToBytes(secretHex.slice(0, 64));
  const sig = ed25519.sign(message, privBytes);
  return bytesToHex(sig);
}

export function publicKeyToAccountId(pubKeyHex: string): string {
  // Account ID is the public key hex padded to 64 chars
  return pubKeyHex.padStart(64, "0");
}

const STORAGE_KEY = "solen_wallet_accounts";

export function loadAccounts(): WalletAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: WalletAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function createAccount(name: string): WalletAccount {
  const kp = generateKeypair();
  return {
    name,
    accountId: publicKeyToAccountId(kp.publicKey),
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
}

export function importAccount(name: string, secretKey: string): WalletAccount {
  const kp = keypairFromSecret(secretKey);
  return {
    name,
    accountId: publicKeyToAccountId(kp.publicKey),
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
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
