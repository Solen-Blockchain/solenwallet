import { useState } from "react";
import { useWallet } from "../lib/context";

export function AccountSelector() {
  const { accounts, activeAccount, setActiveAccount } = useWallet();
  const [open, setOpen] = useState(false);

  if (accounts.length === 0) return null;

  const truncate = (id: string) => `${id.slice(0, 8)}...${id.slice(-6)}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500" />
        <div className="text-left">
          <div className="font-medium text-gray-200">
            {activeAccount?.name || "Select Account"}
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {activeAccount ? truncate(activeAccount.accountId) : ""}
          </div>
        </div>
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {accounts.map((acc) => (
            <button
              key={acc.accountId}
              onClick={() => { setActiveAccount(acc); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 hover:bg-gray-700 transition-colors ${
                acc.accountId === activeAccount?.accountId ? "bg-gray-700/50" : ""
              }`}
            >
              <div className="font-medium text-sm text-gray-200">{acc.name}</div>
              <div className="text-xs text-gray-500 font-mono">{truncate(acc.accountId)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
