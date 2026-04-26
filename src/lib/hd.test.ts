// @vitest-environment node
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) {
  (globalThis as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import { describe, it, expect } from "vitest";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import {
  SOLEN_COIN_TYPE,
  generateMnemonic24,
  isValidMnemonic,
  mnemonicToSeed,
  deriveEd25519FromSeed,
  accountFromMnemonic,
  solenPath,
  formatSolenPath,
} from "./hd";

// ── BIP-39 ─────────────────────────────────────────────────────

describe("BIP-39", () => {
  it("generateMnemonic24 returns 24 words from the english wordlist", () => {
    const m = generateMnemonic24();
    const words = m.split(" ");
    expect(words.length).toBe(24);
    for (const w of words) expect(w).toMatch(/^[a-z]+$/);
    expect(isValidMnemonic(m)).toBe(true);
  });

  it("isValidMnemonic rejects checksum failures", () => {
    // Valid 24-word "abandon ... art"
    const valid =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
    expect(isValidMnemonic(valid)).toBe(true);
    // Same words but last word swapped to a wordlist word that breaks the checksum
    const broken = valid.replace(/art$/, "zoo");
    expect(isValidMnemonic(broken)).toBe(false);
    // Non-wordlist garbage
    expect(isValidMnemonic("not a real mnemonic at all")).toBe(false);
  });

  it("mnemonicToSeed matches the canonical 12-word TREZOR vector", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const seed = await mnemonicToSeed(mnemonic, "TREZOR");
    expect(bytesToHex(seed)).toBe(
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
    );
  });

  it("mnemonicToSeed throws on an invalid mnemonic", async () => {
    await expect(mnemonicToSeed("totally not valid words")).rejects.toThrow(/invalid mnemonic/);
  });
});

// ── SLIP-0010 ed25519 (canonical vectors from the spec) ────────

interface Slip10Vector {
  seedHex: string;
  steps: { path: number[]; chainCodeHex: string; privateKeyHex: string }[];
}

// From https://github.com/satoshilabs/slips/blob/master/slip-0010.md
const SLIP10_VECTORS: Slip10Vector[] = [
  {
    seedHex: "000102030405060708090a0b0c0d0e0f",
    steps: [
      {
        path: [],
        chainCodeHex: "90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb",
        privateKeyHex: "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7",
      },
      {
        path: [0],
        chainCodeHex: "8b59aa11380b624e81507a27fedda59fea6d0b779a778918a2fd3590e16e9c69",
        privateKeyHex: "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3",
      },
      {
        path: [0, 1],
        chainCodeHex: "a320425f77d1b5c2505a6b1b27382b37368ee640e3557c315416801243552f14",
        privateKeyHex: "b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2",
      },
      {
        path: [0, 1, 2],
        chainCodeHex: "2e69929e00b5ab250f49c3fb1c12f252de4fed2c1db88387094a0f8c4c9ccd6c",
        privateKeyHex: "92a5b23c0b8a99e37d07df3fb9966917f5d06e02ddbd909c7e184371463e9fc9",
      },
      {
        path: [0, 1, 2, 2],
        chainCodeHex: "8f6d87f93d750e0efccda017d662a1b31a266e4a6f5993b15f5c1f07f74dd5cc",
        privateKeyHex: "30d1dc7e5fc04c31219ab25a27ae00b50f6fd66622f6e9c913253d6511d1e662",
      },
      {
        path: [0, 1, 2, 2, 1000000000],
        chainCodeHex: "68789923a0cac2cd5a29172a475fe9e0fb14cd6adb5ad98a3fa70333e7afa230",
        privateKeyHex: "8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793",
      },
    ],
  },
  {
    seedHex:
      "fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542",
    steps: [
      {
        path: [],
        chainCodeHex: "ef70a74db9c3a5af931b5fe73ed8e1a53464133654fd55e7a66f8570b8e33c3b",
        privateKeyHex: "171cb88b1b3c1db25add599712e36245d75bc65a1a5c9e18d76f9f2b1eab4012",
      },
      {
        path: [0],
        chainCodeHex: "0b78a3226f915c082bf118f83618a618ab6dec793752624cbeb622acb562862d",
        privateKeyHex: "1559eb2bbec5790b0c65d8693e4d0875b1747f4970ae8b650486ed7470845635",
      },
      {
        path: [0, 2147483647],
        chainCodeHex: "138f0b2551bcafeca6ff2aa88ba8ed0ed8de070841f0c4ef0165df8181eaad7f",
        privateKeyHex: "ea4f5bfe8694d8bb74b7b59404632fd5968b774ed545e810de9c32a4fb4192f4",
      },
      {
        path: [0, 2147483647, 1],
        chainCodeHex: "73bd9fff1cfbde33a1b846c27085f711c0fe2d66fd32e139d3ebc28e5a4a6b90",
        privateKeyHex: "3757c7577170179c7868353ada796c839135b3d30554bbb74a4b1e4a5a58505c",
      },
      {
        path: [0, 2147483647, 1, 2147483646],
        chainCodeHex: "0902fe8a29f9140480a00ef244bd183e8a13288e4412d8389d140aac1794825a",
        privateKeyHex: "5837736c89570de861ebc173b1086da4f505d4adb387c6a1b1342d5e4ac9ec72",
      },
      {
        path: [0, 2147483647, 1, 2147483646, 2],
        chainCodeHex: "5d70af781f3a37b829f0d060924d5e960bdc02e85423494afc0b1a41bbe196d4",
        privateKeyHex: "551d333177df541ad876a60ea71f00447931c0a9da16f227c11ea080d7391b8d",
      },
    ],
  },
];

describe("SLIP-0010 ed25519 derivation", () => {
  for (const [vIdx, v] of SLIP10_VECTORS.entries()) {
    for (const step of v.steps) {
      const label = step.path.length === 0
        ? `vector ${vIdx + 1} master`
        : `vector ${vIdx + 1} m/${step.path.map((i) => i + "H").join("/")}`;
      it(label, () => {
        const seed = hexToBytes(v.seedHex);
        const derived = deriveEd25519FromSeed(seed, step.path);
        expect(bytesToHex(derived.privateKey)).toBe(step.privateKeyHex);
        expect(bytesToHex(derived.chainCode)).toBe(step.chainCodeHex);
      });
    }
  }

  it("rejects un-hardenable indices (>= 2^31)", () => {
    expect(() => deriveEd25519FromSeed(hexToBytes("00".repeat(32)), [0x80000000])).toThrow();
    expect(() => deriveEd25519FromSeed(hexToBytes("00".repeat(32)), [-1])).toThrow();
  });
});

// ── End-to-end Solen account derivation ─────────────────────────

describe("Solen account derivation", () => {
  // Locked-in mnemonic for deterministic tests. NOT a real wallet — never use.
  const TEST_MNEMONIC =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

  it(`derives at path m/44'/${SOLEN_COIN_TYPE}'/0'/0' with the expected components`, () => {
    expect(solenPath(0)).toEqual([44, SOLEN_COIN_TYPE, 0, 0]);
    expect(formatSolenPath(0)).toBe(`m/44'/${SOLEN_COIN_TYPE}'/0'/0'`);
  });

  it("is deterministic across repeated calls", async () => {
    const a1 = await accountFromMnemonic(TEST_MNEMONIC, 0);
    const a2 = await accountFromMnemonic(TEST_MNEMONIC, 0);
    expect(a1.accountId).toBe(a2.accountId);
    expect(bytesToHex(a1.publicKey)).toBe(bytesToHex(a2.publicKey));
    expect(bytesToHex(a1.privateSeed)).toBe(bytesToHex(a2.privateSeed));
  });

  it("derives different accounts at different indices", async () => {
    const a0 = await accountFromMnemonic(TEST_MNEMONIC, 0);
    const a1 = await accountFromMnemonic(TEST_MNEMONIC, 1);
    expect(a0.accountId).not.toBe(a1.accountId);
    expect(a0.derivationIndex).toBe(0);
    expect(a1.derivationIndex).toBe(1);
  });

  it("BIP-39 passphrase changes the derived account", async () => {
    const a = await accountFromMnemonic(TEST_MNEMONIC, 0);
    const b = await accountFromMnemonic(TEST_MNEMONIC, 0, "extra-secret");
    expect(a.accountId).not.toBe(b.accountId);
  });

  it("public key is 32 bytes; accountId is non-empty Base58", async () => {
    const a = await accountFromMnemonic(TEST_MNEMONIC, 0);
    expect(a.publicKey.length).toBe(32);
    expect(a.privateSeed.length).toBe(32);
    expect(a.accountId.length).toBeGreaterThan(30);
    expect(a.accountId).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });
});
