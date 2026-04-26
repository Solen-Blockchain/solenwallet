import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { bytesToHex } from "@noble/hashes/utils";
import { type NetworkId, DEFAULT_NETWORK } from "./networks";
import { type WalletAccount, publicKeyToAccountId } from "./wallet";
import {
  type Keystore,
  type StoredMnemonic,
  emptyKeystore,
  loadKeystore,
  saveKeystore,
  migrateLegacy,
  hydrateAccounts,
  dehydrateAccount,
  highestIndexFor,
} from "./keystore";
import { generateMnemonic24, isValidMnemonic, accountFromMnemonic } from "./hd";
import { encrypt, decrypt, hashPassword } from "./crypto";

const DEFAULT_LOCK_MS = 10 * 60 * 1000; // 10 minutes
const LOCK_TIMEOUT_KEY = "solen_lock_timeout_ms";
const ENCRYPTED_KEY = "solen_wallet_encrypted";
const PW_HASH_KEY = "solen_pw_hash";
const SESSION_KEY = "solen_session_key";

export const LOCK_TIMEOUT_OPTIONS = [
  { label: "1 minute", ms: 60_000 },
  { label: "5 minutes", ms: 300_000 },
  { label: "10 minutes", ms: 600_000 },
  { label: "30 minutes", ms: 1_800_000 },
  { label: "1 hour", ms: 3_600_000 },
  { label: "Never", ms: 0 },
];

interface WalletState {
  network: NetworkId;
  setNetwork: (n: NetworkId) => void;
  accounts: WalletAccount[];
  activeAccount: WalletAccount | null;
  setActiveAccount: (a: WalletAccount | null) => void;
  addAccount: (a: WalletAccount) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  // HD APIs
  /** Stored mnemonic metadata (no plaintext words). */
  mnemonics: Pick<StoredMnemonic, "id" | "label">[];
  /** Generate a new mnemonic, derive index 0, persist. Returns the mnemonic
   *  so the UI can show the confirmation flow. Requires password. */
  createMnemonicAccount: (name: string) => Promise<{ mnemonic: string; mnemonicId: string }>;
  /** Import an existing mnemonic, derive index 0, persist. Requires password. */
  importMnemonicAccount: (name: string, mnemonic: string, label?: string) => Promise<void>;
  /** Derive the next unused index from an existing stored mnemonic. */
  addAccountFromMnemonic: (name: string, mnemonicId: string) => Promise<void>;
  /** Re-verify password and return the requested mnemonic for display.
   *  Returns null on wrong password or unknown mnemonic. */
  revealMnemonic: (password: string, mnemonicId: string) => Promise<string | null>;
  // Lock state
  isLocked: boolean;
  hasPassword: boolean;
  lockTimeoutMs: number;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  setPassword: (password: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  removePassword: (password: string) => Promise<boolean>;
  setLockTimeout: (ms: number) => void;
}

const WalletContext = createContext<WalletState | null>(null);

/** Migrate any legacy hex (64-char) accountIds inside a Keystore to Base58.
 *  Returns whether anything was changed. */
function migrateHexAccountIds(ks: Keystore): boolean {
  let changed = false;
  for (const a of ks.accounts) {
    if (a.accountId.length === 64 && /^[0-9a-fA-F]+$/.test(a.accountId)) {
      a.accountId = publicKeyToAccountId(a.accountId);
      changed = true;
    }
  }
  return changed;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkId>(() => {
    return (localStorage.getItem("solen_network") as NetworkId) || DEFAULT_NETWORK;
  });

  const [hasPassword, setHasPassword] = useState(() => !!localStorage.getItem(PW_HASH_KEY));

  const [lockTimeoutMs, setLockTimeoutMs] = useState(
    () => parseInt(localStorage.getItem(LOCK_TIMEOUT_KEY) || "") || DEFAULT_LOCK_MS,
  );

  // If password is set, start locked. Otherwise unlocked.
  const [isLocked, setIsLocked] = useState(() => !!localStorage.getItem(PW_HASH_KEY));

  // The Keystore is the source of truth; `accounts` is the hydrated view.
  const [keystore, setKeystore] = useState<Keystore>(() => {
    if (localStorage.getItem(PW_HASH_KEY)) return emptyKeystore();
    return loadKeystore();
  });
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);

  // Hydrate accounts from the keystore on first load (no-password path).
  // The unlock path sets accounts directly.
  useEffect(() => {
    if (!isLocked && accounts.length === 0 && keystore.accounts.length > 0) {
      hydrateAccounts(keystore).then(setAccounts).catch(() => setAccounts([]));
    }
    // We deliberately only run this once; later updates go through applyKeystore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-lock timer
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (!hasPassword || lockTimeoutMs === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsLocked(true);
      setKeystore(emptyKeystore());
      setAccounts([]);
      setActiveAccount(null);
    }, lockTimeoutMs);
  }, [hasPassword, lockTimeoutMs]);

  useEffect(() => {
    if (!hasPassword || isLocked) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hasPassword, isLocked, resetTimer]);

  // Initialize active account once accounts are loaded.
  useEffect(() => {
    if (accounts.length > 0 && !activeAccount) {
      const savedId = localStorage.getItem("solen_active_account");
      setActiveAccount(accounts.find((a) => a.accountId === savedId) || accounts[0]);
    }
  }, [accounts, activeAccount]);

  useEffect(() => {
    localStorage.setItem("solen_network", network);
  }, [network]);

  useEffect(() => {
    if (activeAccount) {
      localStorage.setItem("solen_active_account", activeAccount.accountId);
    }
  }, [activeAccount]);

  // Persist a Keystore: encrypted blob if password is set, plaintext otherwise.
  const persistKeystore = useCallback(async (ks: Keystore) => {
    if (hasPassword) {
      const sessionKey = sessionStorage.getItem(SESSION_KEY);
      if (!sessionKey) {
        // Should never happen while unlocked, but fail loud rather than
        // silently writing plaintext.
        throw new Error("session key missing — wallet is locked");
      }
      const encrypted = await encrypt(JSON.stringify(ks), sessionKey);
      localStorage.setItem(ENCRYPTED_KEY, encrypted);
    } else {
      saveKeystore(ks);
    }
  }, [hasPassword]);

  // Apply a Keystore change: hydrate, set state, persist.
  const applyKeystore = useCallback(async (ks: Keystore) => {
    const hydrated = await hydrateAccounts(ks);
    setKeystore(ks);
    setAccounts(hydrated);
    await persistKeystore(ks);
  }, [persistKeystore]);

  const lock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsLocked(true);
    setKeystore(emptyKeystore());
    setAccounts([]);
    setActiveAccount(null);
  }, []);

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    const storedHash = localStorage.getItem(PW_HASH_KEY);
    if (!storedHash) return true;

    const inputHash = await hashPassword(password);
    if (inputHash !== storedHash) return false;

    try {
      const encryptedData = localStorage.getItem(ENCRYPTED_KEY);
      let ks: Keystore;
      let needsResave = false;

      if (encryptedData) {
        const json = await decrypt(encryptedData, password);
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed) || (parsed && typeof parsed === "object" && parsed.version !== 2)) {
          // Legacy shape (bare WalletAccount[] or unknown) — migrate.
          ks = migrateLegacy(parsed);
          needsResave = true;
        } else {
          ks = parsed as Keystore;
        }
        if (migrateHexAccountIds(ks)) needsResave = true;
      } else {
        // Migration: accounts stored unencrypted (pre-password-set), encrypt now.
        ks = loadKeystore();
        needsResave = true;
      }

      const hydrated = await hydrateAccounts(ks);

      // Stash the password for re-encryption on subsequent writes BEFORE the
      // resave, so persistKeystore() can find it.
      sessionStorage.setItem(SESSION_KEY, password);

      if (needsResave) {
        const reEncrypted = await encrypt(JSON.stringify(ks), password);
        localStorage.setItem(ENCRYPTED_KEY, reEncrypted);
        // Clean up any stale plaintext form.
        localStorage.removeItem("solen_wallet_accounts");
      }

      setKeystore(ks);
      setAccounts(hydrated);
      setIsLocked(false);
      resetTimer();
      return true;
    } catch {
      return false;
    }
  }, [resetTimer]);

  const setPasswordFn = useCallback(async (password: string) => {
    const pwHash = await hashPassword(password);
    localStorage.setItem(PW_HASH_KEY, pwHash);

    // Wrap whatever's currently in memory into the encrypted blob.
    const currentKs = keystore.accounts.length > 0 ? keystore : loadKeystore();
    const encrypted = await encrypt(JSON.stringify(currentKs), password);
    localStorage.setItem(ENCRYPTED_KEY, encrypted);
    localStorage.removeItem("solen_wallet_accounts");

    sessionStorage.setItem(SESSION_KEY, password);
    setKeystore(currentKs);
    setHasPassword(true);
  }, [keystore]);

  const changePasswordFn = useCallback(async (oldPassword: string, newPassword: string): Promise<boolean> => {
    const storedHash = localStorage.getItem(PW_HASH_KEY);
    if (!storedHash) return false;
    const oldHash = await hashPassword(oldPassword);
    if (oldHash !== storedHash) return false;

    try {
      const encryptedData = localStorage.getItem(ENCRYPTED_KEY);
      let ks: Keystore = emptyKeystore();
      if (encryptedData) {
        const json = await decrypt(encryptedData, oldPassword);
        const parsed = JSON.parse(json);
        ks = (Array.isArray(parsed) || parsed?.version !== 2) ? migrateLegacy(parsed) : parsed;
      } else {
        ks = loadKeystore();
      }

      const newHash = await hashPassword(newPassword);
      localStorage.setItem(PW_HASH_KEY, newHash);
      const encrypted = await encrypt(JSON.stringify(ks), newPassword);
      localStorage.setItem(ENCRYPTED_KEY, encrypted);
      sessionStorage.setItem(SESSION_KEY, newPassword);
      return true;
    } catch {
      return false;
    }
  }, []);

  const removePasswordFn = useCallback(async (password: string): Promise<boolean> => {
    const storedHash = localStorage.getItem(PW_HASH_KEY);
    if (!storedHash) return true;
    const inputHash = await hashPassword(password);
    if (inputHash !== storedHash) return false;

    try {
      const encryptedData = localStorage.getItem(ENCRYPTED_KEY);
      let ks: Keystore = emptyKeystore();
      if (encryptedData) {
        const json = await decrypt(encryptedData, password);
        const parsed = JSON.parse(json);
        ks = (Array.isArray(parsed) || parsed?.version !== 2) ? migrateLegacy(parsed) : parsed;
      }
      // Refuse to drop password while HD mnemonics exist — the plaintext
      // keystore would expose them. The UI should prompt the user to delete
      // HD accounts first if they really want to remove the password.
      if (ks.mnemonics.length > 0) {
        return false;
      }
      saveKeystore(ks);
      localStorage.removeItem(PW_HASH_KEY);
      localStorage.removeItem(ENCRYPTED_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      setHasPassword(false);
      setIsLocked(false);
      const hydrated = await hydrateAccounts(ks);
      setKeystore(ks);
      setAccounts(hydrated);
      if (timerRef.current) clearTimeout(timerRef.current);
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleSetLockTimeout = useCallback((ms: number) => {
    setLockTimeoutMs(ms);
    localStorage.setItem(LOCK_TIMEOUT_KEY, String(ms));
  }, []);

  // ── Account-level mutations ────────────────────────────────

  const addAccount = useCallback(async (a: WalletAccount) => {
    const newKs: Keystore = {
      ...keystore,
      accounts: [...keystore.accounts, dehydrateAccount(a)],
    };
    await applyKeystore(newKs);
    setActiveAccount((prev) => prev ?? a);
  }, [keystore, applyKeystore]);

  const removeAccount = useCallback(async (accountId: string) => {
    const newKs: Keystore = {
      ...keystore,
      accounts: keystore.accounts.filter((a) => a.accountId !== accountId),
      // Note: leave orphaned mnemonics in place. They're harmless and let
      // the user re-derive an accidentally-removed account.
    };
    await applyKeystore(newKs);
    setActiveAccount((prev) => (prev?.accountId === accountId ? null : prev));
  }, [keystore, applyKeystore]);

  // ── HD mnemonic mutations ──────────────────────────────────

  const createMnemonicAccount = useCallback(async (name: string) => {
    if (!hasPassword) {
      throw new Error("Set a password before creating a recovery phrase");
    }
    const mnemonic = generateMnemonic24();
    const mnemonicId = crypto.randomUUID();
    const derived = await accountFromMnemonic(mnemonic, 0);
    const newAccount: WalletAccount = {
      name,
      accountId: derived.accountId,
      publicKey: bytesToHex(derived.publicKey),
      secretKey: bytesToHex(derived.privateSeed) + bytesToHex(derived.publicKey),
      hd: { mnemonicId, derivationIndex: 0 },
    };
    const newKs: Keystore = {
      ...keystore,
      mnemonics: [...keystore.mnemonics, { id: mnemonicId, label: "Default", mnemonic }],
      accounts: [...keystore.accounts, dehydrateAccount(newAccount)],
    };
    await applyKeystore(newKs);
    setActiveAccount((prev) => prev ?? newAccount);
    return { mnemonic, mnemonicId };
  }, [keystore, applyKeystore, hasPassword]);

  const importMnemonicAccount = useCallback(async (name: string, mnemonic: string, label?: string) => {
    if (!hasPassword) {
      throw new Error("Set a password before importing a recovery phrase");
    }
    const trimmed = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
    if (!isValidMnemonic(trimmed)) {
      throw new Error("Invalid recovery phrase (checksum failed)");
    }
    const mnemonicId = crypto.randomUUID();
    const derived = await accountFromMnemonic(trimmed, 0);
    const newAccount: WalletAccount = {
      name,
      accountId: derived.accountId,
      publicKey: bytesToHex(derived.publicKey),
      secretKey: bytesToHex(derived.privateSeed) + bytesToHex(derived.publicKey),
      hd: { mnemonicId, derivationIndex: 0 },
    };
    const newKs: Keystore = {
      ...keystore,
      mnemonics: [...keystore.mnemonics, { id: mnemonicId, label: label || "Imported", mnemonic: trimmed }],
      accounts: [...keystore.accounts, dehydrateAccount(newAccount)],
    };
    await applyKeystore(newKs);
    setActiveAccount((prev) => prev ?? newAccount);
  }, [keystore, applyKeystore, hasPassword]);

  const addAccountFromMnemonic = useCallback(async (name: string, mnemonicId: string) => {
    const mnem = keystore.mnemonics.find((m) => m.id === mnemonicId);
    if (!mnem) throw new Error("Recovery phrase not found");
    const nextIndex = highestIndexFor(keystore, mnemonicId) + 1;
    const derived = await accountFromMnemonic(mnem.mnemonic, nextIndex);
    const newAccount: WalletAccount = {
      name,
      accountId: derived.accountId,
      publicKey: bytesToHex(derived.publicKey),
      secretKey: bytesToHex(derived.privateSeed) + bytesToHex(derived.publicKey),
      hd: { mnemonicId, derivationIndex: nextIndex },
    };
    await addAccount(newAccount);
  }, [keystore, addAccount]);

  const revealMnemonic = useCallback(async (password: string, mnemonicId: string): Promise<string | null> => {
    const storedHash = localStorage.getItem(PW_HASH_KEY);
    if (!storedHash) return null;
    const inputHash = await hashPassword(password);
    if (inputHash !== storedHash) return null;
    const mnem = keystore.mnemonics.find((m) => m.id === mnemonicId);
    return mnem?.mnemonic ?? null;
  }, [keystore]);

  const mnemonicsList = useMemo(
    () => keystore.mnemonics.map((m) => ({ id: m.id, label: m.label })),
    [keystore.mnemonics],
  );

  const value = useMemo<WalletState>(() => ({
    network,
    setNetwork,
    accounts,
    activeAccount,
    setActiveAccount,
    addAccount,
    removeAccount,
    mnemonics: mnemonicsList,
    createMnemonicAccount,
    importMnemonicAccount,
    addAccountFromMnemonic,
    revealMnemonic,
    isLocked,
    hasPassword,
    lockTimeoutMs,
    unlock,
    lock,
    setPassword: setPasswordFn,
    changePassword: changePasswordFn,
    removePassword: removePasswordFn,
    setLockTimeout: handleSetLockTimeout,
  }), [
    network, accounts, activeAccount, mnemonicsList,
    addAccount, removeAccount,
    createMnemonicAccount, importMnemonicAccount, addAccountFromMnemonic, revealMnemonic,
    isLocked, hasPassword, lockTimeoutMs, unlock, lock,
    setPasswordFn, changePasswordFn, removePasswordFn, handleSetLockTimeout,
  ]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
