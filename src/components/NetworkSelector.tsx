import { networks, type NetworkId } from "../lib/networks";
import { useWallet } from "../lib/context";

const networkList: NetworkId[] = ["mainnet", "testnet", "devnet"];

export function NetworkSelector() {
  const { network, setNetwork } = useWallet();

  return (
    <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
      {networkList.map((id) => {
        const net = networks[id];
        const active = id === network;
        return (
          <button
            key={id}
            onClick={() => setNetwork(id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? "text-white shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
            style={active ? { backgroundColor: net.color + "30", color: net.color } : {}}
          >
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: net.color }}
            />
            {net.name}
          </button>
        );
      })}
    </div>
  );
}
