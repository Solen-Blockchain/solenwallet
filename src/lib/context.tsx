import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { type NetworkId, DEFAULT_NETWORK } from "./networks";
import { type WalletAccount, loadAccounts, saveAccounts } from "./wallet";
import { encrypt, decrypt, hashPassword } from "./crypto";

const DEFAULT_LOCK_MS = 10 * 60 * 1000; // 10 minutes
const LOCK_TIMEOUT_KEY = "solen_lock_timeout_ms";

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
  addAccount: (a: WalletAccount) => void;
  removeAccount: (accountId: string) => void;
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkId>(() => {
    return (localStorage.getItem("solen_network") as NetworkId) || DEFAULT_NETWORK;
  });

  const [hasPassword, setHasPassword] = useState(
    () => !!localStorage.getItem("solen_pw_hash"),
  );

  const [lockTimeoutMs, setLockTimeoutMs] = useState(
    () => parseInt(localStorage.getItem(LOCK_TIMEOUT_KEY) || "") || DEFAULT_LOCK_MS,
  );

  // If password is set, start locked. Otherwise unlocked.
  const [isLocked, setIsLocked] = useState(() => !!localStorage.getItem("solen_pw_hash"));
  const [accounts, setAccounts] = useState<WalletAccount[]>(() => {
    if (localStorage.getItem("solen_pw_hash")) return []; // Don't load until unlocked
    return loadAccounts();
  });
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);

  // Auto-lock timer
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (!hasPassword || lockTimeoutMs === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsLocked(true);
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

  // Initialize active account after loading
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

  const lock = useCallback(() => {
    setIsLocked(true);
    setAccounts([]);
    setActiveAccount(null);
  }, []);

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    const storedHash = localStorage.getItem("solen_pw_hash");
    if (!storedHash) return true;

    const inputHash = await hashPassword(password);
    if (inputHash !== storedHash) return false;

    try {
      const encryptedData = localStorage.getItem("solen_wallet_encrypted");
      if (encryptedData) {
        const json = await decrypt(encryptedData, password);
        const decrypted: WalletAccount[] = JSON.parse(json);
        setAccounts(decrypted);
      } else {
        // Migration: accounts stored unencrypted, encrypt them now
        const raw = loadAccounts();
        setAccounts(raw);
        if (raw.length > 0) {
          const encrypted = await encrypt(JSON.stringify(raw), password);
          localStorage.setItem("solen_wallet_encrypted", encrypted);
          localStorage.removeItem("solen_wallet_accounts");
        }
      }
      setIsLocked(false);
      resetTimer();
      return true;
    } catch {
      return false;
    }
  }, [resetTimer]);

  const setPasswordFn = useCallback(async (password: string) => {
    const pwHash = await hashPassword(password);
    localStorage.setItem("solen_pw_hash", pwHash);

    // Encrypt current accounts
    const currentAccounts = accounts.length > 0 ? accounts : loadAccounts();
    if (currentAccounts.length > 0) {
      const encrypted = await encrypt(JSON.stringify(currentAccounts), password);
      localStorage.setItem("solen_wallet_encrypted", encrypted);
      localStorage.removeItem("solen_wallet_accounts");
    }
    setAccounts(currentAccounts);
    setHasPassword(true);
  }, [accounts]);

  const changePasswordFn = useCallback(async (oldPassword: string, newPassword: string): Promise<boolean> => {
    const storedHash = localStorage.getItem("solen_pw_hash");
    if (!storedHash) return false;
    const oldHash = await hashPassword(oldPassword);
    if (oldHash !== storedHash) return false;

    // Decrypt with old, re-encrypt with new
    try {
      const encryptedData = localStorage.getItem("solen_wallet_encrypted");
      let accs: WalletAccount[] = [];
      if (encryptedData) {
        const json = await decrypt(encryptedData, oldPassword);
        accs = JSON.parse(json);
      } else {
        accs = loadAccounts();
      }

      const newHash = await hashPassword(newPassword);
      localStorage.setItem("solen_pw_hash", newHash);
      if (accs.length > 0) {
        const encrypted = await encrypt(JSON.stringify(accs), newPassword);
        localStorage.setItem("solen_wallet_encrypted", encrypted);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const removePasswordFn = useCallback(async (password: string): Promise<boolean> => {
    const storedHash = localStorage.getItem("solen_pw_hash");
    if (!storedHash) return true;
    const inputHash = await hashPassword(password);
    if (inputHash !== storedHash) return false;

    // Decrypt and save plaintext
    try {
      const encryptedData = localStorage.getItem("solen_wallet_encrypted");
      if (encryptedData) {
        const json = await decrypt(encryptedData, password);
        const accs: WalletAccount[] = JSON.parse(json);
        saveAccounts(accs);
        setAccounts(accs);
      }
      localStorage.removeItem("solen_pw_hash");
      localStorage.removeItem("solen_wallet_encrypted");
      setHasPassword(false);
      setIsLocked(false);
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

  const addAccount = useCallback((a: WalletAccount) => {
    setAccounts((prev) => {
      const updated = [...prev, a];
      saveAccounts(updated);
      return updated;
    });
    setActiveAccount((prev) => prev ?? a);
  }, []);

  const removeAccount = useCallback((accountId: string) => {
    setAccounts((prev) => {
      const updated = prev.filter((a) => a.accountId !== accountId);
      saveAccounts(updated);
      return updated;
    });
    setActiveAccount((prev) =>
      prev?.accountId === accountId ? null : prev,
    );
  }, []);

  const value = useMemo<WalletState>(() => ({
    network,
    setNetwork,
    accounts,
    activeAccount,
    setActiveAccount,
    addAccount,
    removeAccount,
    isLocked,
    hasPassword,
    lockTimeoutMs,
    unlock,
    lock,
    setPassword: setPasswordFn,
    changePassword: changePasswordFn,
    removePassword: removePasswordFn,
    setLockTimeout: handleSetLockTimeout,
  }), [network, accounts, activeAccount, isLocked, hasPassword, lockTimeoutMs, unlock, lock, setPasswordFn, changePasswordFn, removePasswordFn, handleSetLockTimeout, addAccount, removeAccount]);

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
