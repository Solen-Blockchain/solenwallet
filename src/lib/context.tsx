import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { type NetworkId, DEFAULT_NETWORK } from "./networks";
import { type WalletAccount, loadAccounts, saveAccounts } from "./wallet";
import { encrypt, decrypt, hashPassword } from "./crypto";

const AUTO_LOCK_MS = 10 * 60 * 1000; // 10 minutes

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
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  setPassword: (password: string) => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkId>(() => {
    return (localStorage.getItem("solen_network") as NetworkId) || DEFAULT_NETWORK;
  });

  const [hasPassword, setHasPassword] = useState(
    () => !!localStorage.getItem("solen_pw_hash"),
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
    if (!hasPassword) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsLocked(true);
      setAccounts([]);
      setActiveAccount(null);
    }, AUTO_LOCK_MS);
  }, [hasPassword]);

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

  return (
    <WalletContext.Provider
      value={{
        network,
        setNetwork,
        accounts,
        activeAccount,
        setActiveAccount,
        addAccount,
        removeAccount,
        isLocked,
        hasPassword,
        unlock,
        lock,
        setPassword: setPasswordFn,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
