// Post-quantum (ML-DSA-65 / FIPS 204) + AND-hybrid key derivation and signing.
//
// PHRASE-PRESERVING: an account's post-quantum key derives from the SAME BIP-39
// mnemonic as its Ed25519 key, at a sibling HD path — so ONE recovery phrase
// backs both, and upgrading an account to quantum-safe never changes its phrase
// (or its address). This is safe against the quantum threat: cracking the
// Ed25519 public key recovers the Ed25519 scalar, not the mnemonic (a one-way
// hash), so the ML-DSA key can't be derived from it.
//
// Signature layout is byte-identical to the Rust node (`fips204` + `Hybrid`
// auth): ML-DSA-only = ml_dsa[3309]; hybrid = ed25519[64] ‖ ml_dsa[3309]. The
// signing message comes from `buildSigningMessage` (wallet.ts), which matches
// `UserOperation::signing_message`. Uses the same `@noble/post-quantum` the
// cross-impl-verified wallet SDK does.

import { ml_dsa65 } from "@noble/post-quantum/ml-dsa";
import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

import { mnemonicToSeed, deriveEd25519FromSeed, SOLEN_COIN_TYPE } from "./hd";

// ed25519 v3 async SHA-512 hook (idempotent with wallet.ts/hd.ts).
(ed25519.etc as Record<string, unknown>).sha512Async = async (...m: Uint8Array[]) =>
  sha512(ed25519.etc.concatBytes(...m));

/** ML-DSA-65 sizes (bytes). */
export const ML_DSA_PK_LEN = 1952;
export const ML_DSA_SIG_LEN = 3309;
export const ED25519_SIG_LEN = 64;

/**
 * HD path for the ML-DSA key of account `index`: the sibling of the Ed25519
 * account key (`m/44'/COIN'/index'/0'`) at `m/44'/COIN'/index'/1'`. Same
 * mnemonic, distinct key material.
 */
export function mlDsaPath(index: number): number[] {
  return [44, SOLEN_COIN_TYPE, index, 1];
}

/** The Ed25519 account key path (mirrors hd.ts `solenPath`). */
function edPath(index: number): number[] {
  return [44, SOLEN_COIN_TYPE, index, 0];
}

export interface MlDsaKeys {
  /** 32-byte ML-DSA seed (ξ) — derived from the mnemonic, never stored. */
  mlSeed: Uint8Array;
  /** ML-DSA-65 secret key (4032 bytes). */
  mlSecretKey: Uint8Array;
  /** ML-DSA-65 public key (1952 bytes) — registered on-chain. */
  mlPublicKey: Uint8Array;
}

export interface HybridKeys extends MlDsaKeys {
  /** 32-byte Ed25519 secret seed (the account key). */
  edSeed: Uint8Array;
  /** 32-byte Ed25519 public key (the account id). */
  edPublicKey: Uint8Array;
}

/**
 * The 32-byte ML-DSA seed (ξ) for account `index`, derived from the mnemonic.
 * Cheap (no lattice keygen) — used at unlock to hydrate an account so signing
 * can reconstruct the secret key on demand without persisting key material.
 */
export async function mlSeedFromMnemonic(
  mnemonic: string,
  index: number,
  passphrase = "",
): Promise<Uint8Array> {
  const seed = await mnemonicToSeed(mnemonic, passphrase);
  return deriveEd25519FromSeed(seed, mlDsaPath(index)).privateKey;
}

/** Reconstruct the ML-DSA-65 secret key (4032 bytes) from its 32-byte seed. */
export function mlSecretKeyFromSeed(mlSeed: Uint8Array): Uint8Array {
  return ml_dsa65.keygen(mlSeed).secretKey;
}

/** Derive the ML-DSA-65 keypair for account `index` from the mnemonic. */
export async function mlDsaFromMnemonic(
  mnemonic: string,
  index: number,
  passphrase = "",
): Promise<MlDsaKeys> {
  const seed = await mnemonicToSeed(mnemonic, passphrase);
  const mlSeed = deriveEd25519FromSeed(seed, mlDsaPath(index)).privateKey;
  const { publicKey, secretKey } = ml_dsa65.keygen(mlSeed);
  return { mlSeed, mlSecretKey: secretKey, mlPublicKey: publicKey };
}

/**
 * Derive BOTH the account's Ed25519 key (`…/index'/0'`) and its ML-DSA key
 * (`…/index'/1'`) from the one mnemonic — the material for a `Hybrid` auth that
 * keeps the existing address and recovery phrase.
 */
export async function hybridFromMnemonic(
  mnemonic: string,
  index: number,
  passphrase = "",
): Promise<HybridKeys> {
  const seed = await mnemonicToSeed(mnemonic, passphrase);
  const edSeed = deriveEd25519FromSeed(seed, edPath(index)).privateKey;
  const edPublicKey = await ed25519.getPublicKeyAsync(edSeed);
  const mlSeed = deriveEd25519FromSeed(seed, mlDsaPath(index)).privateKey;
  const { publicKey: mlPublicKey, secretKey: mlSecretKey } = ml_dsa65.keygen(mlSeed);
  return { edSeed, edPublicKey, mlSeed, mlSecretKey, mlPublicKey };
}

/** AND-hybrid signature over `message`: `ed25519[64] ‖ ml_dsa[3309]`. */
export async function signHybrid(
  message: Uint8Array,
  edSeed: Uint8Array,
  mlSecretKey: Uint8Array,
): Promise<Uint8Array> {
  const ed = await ed25519.signAsync(message, edSeed);
  const ml = ml_dsa65.sign(mlSecretKey, message);
  const sig = new Uint8Array(ed.length + ml.length);
  sig.set(ed, 0);
  sig.set(ml, ed.length);
  return sig;
}

/** ML-DSA-only signature over `message` (3309 bytes). */
export function signMlDsa(message: Uint8Array, mlSecretKey: Uint8Array): Uint8Array {
  return ml_dsa65.sign(mlSecretKey, message);
}

// ── AuthMethod builders (Rust serde externally-tagged enum shape) ──────────

/** `AuthMethod::Hybrid { ed25519_public_key, ml_dsa_public_key }` as JSON. */
export function hybridAuthMethod(edPublicKey: Uint8Array, mlPublicKey: Uint8Array) {
  return {
    Hybrid: {
      ed25519_public_key: Array.from(edPublicKey),
      ml_dsa_public_key: Array.from(mlPublicKey),
    },
  };
}

/** `AuthMethod::MlDsa { public_key }` as JSON. */
export function mlDsaAuthMethod(mlPublicKey: Uint8Array) {
  return { MlDsa: { public_key: Array.from(mlPublicKey) } };
}

/** `AuthMethod::Ed25519 { public_key }` as JSON (the classical default). */
export function ed25519AuthMethod(edPublicKey: Uint8Array) {
  return { Ed25519: { public_key: Array.from(edPublicKey) } };
}
