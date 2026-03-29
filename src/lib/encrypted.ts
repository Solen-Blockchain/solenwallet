/**
 * Encrypted mempool support — commit-reveal scheme for MEV protection.
 *
 * Flow:
 * 1. Generate a random encryption key
 * 2. Encrypt the operation data
 * 3. Submit commitment (hash of encrypted data + sender)
 * 4. After ordering is locked (~2 blocks), reveal the plaintext
 *
 * This prevents frontrunning and sandwich attacks by hiding
 * transaction details until ordering is finalized.
 */

import { sha512 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

/**
 * Generate a random 32-byte encryption key.
 */
export function generateRevealKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Simple XOR encryption (symmetric — same operation encrypts and decrypts).
 * For production, use AES-GCM. XOR is used here for simplicity.
 */
export function xorEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Compute BLAKE3 hash (using SHA-512 as a stand-in since we don't
 * have blake3 in the browser; the L1 node will verify with its own hash).
 * In production, use a proper BLAKE3 implementation.
 */
function hashBytes(data: Uint8Array): Uint8Array {
  return sha512(data).slice(0, 32); // truncate to 32 bytes
}

/**
 * Create a commitment for an encrypted operation.
 *
 * commitment_hash = hash(encrypted_data || sender_bytes)
 */
export function createCommitment(
  encryptedData: Uint8Array,
  senderHex: string,
): string {
  const sender = hexToBytes(senderHex);
  const combined = new Uint8Array(encryptedData.length + sender.length);
  combined.set(encryptedData);
  combined.set(sender, encryptedData.length);
  return bytesToHex(hashBytes(combined));
}

/**
 * Encrypt an operation for commit-reveal submission.
 * Returns the encrypted data, reveal key, and commitment hash.
 */
export function encryptOperation(
  operationJson: string,
  senderHex: string,
): {
  encryptedData: string; // hex
  revealKey: string; // hex
  commitmentHash: string; // hex
} {
  const opBytes = new TextEncoder().encode(operationJson);
  const revealKey = generateRevealKey();
  const encrypted = xorEncrypt(opBytes, revealKey);
  const commitmentHash = createCommitment(encrypted, senderHex);

  return {
    encryptedData: bytesToHex(encrypted),
    revealKey: bytesToHex(revealKey),
    commitmentHash,
  };
}

/**
 * Decrypt an operation for reveal.
 */
export function decryptOperation(
  encryptedDataHex: string,
  revealKeyHex: string,
): string {
  const encrypted = hexToBytes(encryptedDataHex);
  const key = hexToBytes(revealKeyHex);
  const decrypted = xorEncrypt(encrypted, key);
  return new TextDecoder().decode(decrypted);
}
