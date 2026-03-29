import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { type NetworkId, DEFAULT_NETWORK } from "./networks";
import { type WalletAccount, loadAccounts, saveAccounts } from "./wallet";

interface WalletState {
  network: NetworkId;
  setNetwork: (n: NetworkId) => void;
  accounts: WalletAccount[];
  activeAccount: WalletAccount | null;
  setActiveAccount: (a: WalletAccount | null) => void;
  addAccount: (a: WalletAccount) => void;
  removeAccount: (accountId: string) => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkId>(() => {
    return (localStorage.getItem("solen_network") as NetworkId) || DEFAULT_NETWORK;
  });
  const [accounts, setAccounts] = useState<WalletAccount[]>(() => loadAccounts());
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(() => {
    const accs = loadAccounts();
    const savedId = localStorage.getItem("solen_active_account");
    return accs.find((a) => a.accountId === savedId) || accs[0] || null;
  });

  useEffect(() => {
    localStorage.setItem("solen_network", network);
  }, [network]);

  useEffect(() => {
    saveAccounts(accounts);
  }, [accounts]);

  useEffect(() => {
    if (activeAccount) {
      localStorage.setItem("solen_active_account", activeAccount.accountId);
    }
  }, [activeAccount]);

  const addAccount = (a: WalletAccount) => {
    setAccounts((prev) => [...prev, a]);
    if (!activeAccount) setActiveAccount(a);
  };

  const removeAccount = (accountId: string) => {
    setAccounts((prev) => prev.filter((a) => a.accountId !== accountId));
    if (activeAccount?.accountId === accountId) {
      const remaining = accounts.filter((a) => a.accountId !== accountId);
      setActiveAccount(remaining[0] || null);
    }
  };

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
