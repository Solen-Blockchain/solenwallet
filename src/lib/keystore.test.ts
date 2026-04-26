// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";

// Tiny in-memory localStorage shim so we don't pull in jsdom for these tests.
const memStore: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in memStore ? memStore[k] : null),
  setItem: (k: string, v: string) => {
    memStore[k] = v;
  },
  removeItem: (k: string) => {
    delete memStore[k];
  },
  clear: () => {
    for (const k of Object.keys(memStore)) delete memStore[k];
  },
  key: (i: number) => Object.keys(memStore)[i] ?? null,
  get length() {
    return Object.keys(memStore).length;
  },
} as Storage;

import {
  loadKeystore,
  saveKeystore,
  migrateLegacy,
  emptyKeystore,
  __testing,
} from "./keystore";

const KEY = __testing.STORAGE_KEY;

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k];
});

describe("migrateLegacy (pure)", () => {
  it("wraps a legacy bare-array keystore into v2 with all entries marked kind: 'key'", () => {
    const legacy = [
      { name: "Main", accountId: "Abc", publicKey: "pk1", secretKey: "sk1" },
      { name: "Alt", accountId: "Def", publicKey: "pk2", secretKey: "sk2" },
    ];
    const ks = migrateLegacy(legacy);
    expect(ks.version).toBe(2);
    expect(ks.mnemonics).toEqual([]);
    expect(ks.accounts.length).toBe(2);
    for (const a of ks.accounts) expect(a.kind).toBe("key");
    expect(ks.accounts[0]).toMatchObject({
      kind: "key",
      name: "Main",
      accountId: "Abc",
      publicKey: "pk1",
      secretKey: "sk1",
    });
  });

  it("passes through an already-v2 keystore unchanged", () => {
    const v2 = {
      version: 2 as const,
      mnemonics: [{ id: "m1", label: "Default", mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about" }],
      accounts: [
        { kind: "key" as const, name: "A", accountId: "X", publicKey: "p", secretKey: "s" },
      ],
    };
    const ks = migrateLegacy(v2);
    expect(ks).toEqual(v2);
  });

  it("returns an empty keystore for unrecognized shapes", () => {
    expect(migrateLegacy(null)).toEqual(emptyKeystore());
    expect(migrateLegacy(undefined)).toEqual(emptyKeystore());
    expect(migrateLegacy({ random: "object" })).toEqual(emptyKeystore());
    expect(migrateLegacy(42)).toEqual(emptyKeystore());
  });

  it("ignores malformed entries in a legacy array", () => {
    const legacy = [
      { name: "Good", accountId: "A", publicKey: "p", secretKey: "s" },
      { name: "Missing fields" },
      "not an object",
      null,
    ];
    const ks = migrateLegacy(legacy);
    expect(ks.accounts.length).toBe(1);
    expect(ks.accounts[0].name).toBe("Good");
  });
});

describe("loadKeystore + saveKeystore (with localStorage)", () => {
  it("returns an empty keystore when no data is stored", () => {
    expect(loadKeystore()).toEqual(emptyKeystore());
  });

  it("migrates a stored bare-array shape on first load and persists v2 immediately", () => {
    const legacy = [
      { name: "Main", accountId: "A", publicKey: "p", secretKey: "s" },
    ];
    memStore[KEY] = JSON.stringify(legacy);

    const ks = loadKeystore();
    expect(ks.version).toBe(2);
    expect(ks.accounts).toHaveLength(1);
    expect(ks.accounts[0].kind).toBe("key");

    // Reload should now read the v2 shape directly.
    const rehydrated = JSON.parse(memStore[KEY]);
    expect(rehydrated.version).toBe(2);
  });

  it("round-trips a v2 keystore", () => {
    const ks = {
      version: 2 as const,
      mnemonics: [{ id: "m1", label: "Default", mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about" }],
      accounts: [
        { kind: "key" as const, name: "Legacy", accountId: "X", publicKey: "p1", secretKey: "s1" },
        {
          kind: "hd" as const,
          name: "HD #0",
          accountId: "Y",
          publicKey: "p2",
          mnemonicId: "m1",
          derivationIndex: 0,
        },
      ],
    };
    saveKeystore(ks);
    expect(loadKeystore()).toEqual(ks);
  });

  it("recovers gracefully from corrupted JSON", () => {
    memStore[KEY] = "{not json";
    expect(loadKeystore()).toEqual(emptyKeystore());
  });

  it("is idempotent — loading after save does not modify the stored shape", () => {
    const ks = {
      version: 2 as const,
      mnemonics: [],
      accounts: [
        { kind: "key" as const, name: "A", accountId: "X", publicKey: "p", secretKey: "s" },
      ],
    };
    saveKeystore(ks);
    const stored1 = memStore[KEY];
    loadKeystore();
    expect(memStore[KEY]).toBe(stored1);
  });
});
