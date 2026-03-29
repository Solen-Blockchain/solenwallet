import { NetworkSelector } from "./NetworkSelector";
import { AccountSelector } from "./AccountSelector";

export function Header() {
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
        <AccountSelector />
      </div>
    </header>
  );
}
