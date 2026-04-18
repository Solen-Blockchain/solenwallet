import { useState } from "react";
import { networks, type NetworkId } from "../lib/networks";
import { useWallet } from "../lib/context";

const networkList: NetworkId[] = ["mainnet", "testnet", "devnet"];

export function NetworkSelector() {
  const { network, setNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const current = networks[network];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: current.color }}
        />
        <span style={{ color: current.color }}>{current.name}</span>
        <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {networkList.map((id) => {
            const net = networks[id];
            const active = id === network;
            return (
              <button
                key={id}
                onClick={() => { setNetwork(id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                  active ? "bg-gray-700/50" : "hover:bg-gray-700"
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: net.color }}
                />
                <span style={{ color: active ? net.color : "#9ca3af" }}>{net.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
