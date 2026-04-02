import { NetworkSelector } from "./NetworkSelector";
import { AccountSelector } from "./AccountSelector";
import { useWallet } from "../lib/context";

export function Header() {
  const { lock, hasPassword, isLocked } = useWallet();

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-emerald-400">Solen</span>
            <span className="text-gray-400 font-normal">Wallet</span>
          </div>
          <NetworkSelector />
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && <AccountSelector />}
          {!isLocked && hasPassword && (
            <button
              onClick={lock}
              title="Lock wallet"
              className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
