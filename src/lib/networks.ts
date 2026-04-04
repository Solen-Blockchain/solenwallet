export type NetworkId = "mainnet" | "testnet" | "devnet";

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerApiUrl: string;
  explorerUrl: string;
  faucetUrl: string | null;
  color: string;
  enabled: boolean;
}

export const networks: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "Mainnet",
    chainId: 1,
    rpcUrl: "https://rpc.solenchain.io",
    explorerApiUrl: "https://api.solenchain.io",
    explorerUrl: "https://solenscan.io",
    faucetUrl: null,
    color: "#10b981",
    enabled: true,
  },
  testnet: {
    id: "testnet",
    name: "Testnet",
    chainId: 9000,
    rpcUrl: "https://testnet-rpc.solenchain.io",
    explorerApiUrl: "https://testnet-api.solenchain.io",
    explorerUrl: "https://solenscan.io",
    faucetUrl: "https://testnet-faucet.solenchain.io",
    color: "#f59e0b",
    enabled: true,
  },
  devnet: {
    id: "devnet",
    name: "Devnet",
    chainId: 1337,
    rpcUrl: "http://127.0.0.1:29944",
    explorerApiUrl: "http://127.0.0.1:29955",
    explorerUrl: "http://127.0.0.1:29955",
    faucetUrl: "http://127.0.0.1:29966",
    color: "#6366f1",
    enabled: true,
  },
};

export const DEFAULT_NETWORK: NetworkId = "testnet";

const OVERRIDES_KEY = "solen_network_overrides";

export type NetworkOverrides = Partial<Pick<NetworkConfig, "rpcUrl" | "explorerApiUrl" | "explorerUrl" | "faucetUrl">>;

/** Load user overrides from localStorage. */
export function loadNetworkOverrides(): Partial<Record<NetworkId, NetworkOverrides>> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Save user overrides to localStorage. */
export function saveNetworkOverrides(overrides: Partial<Record<NetworkId, NetworkOverrides>>) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

/** Get effective config for a network (defaults + overrides). */
export function getNetworkConfig(id: NetworkId): NetworkConfig {
  const base = networks[id];
  const overrides = loadNetworkOverrides()[id];
  if (!overrides) return base;
  return {
    ...base,
    rpcUrl: overrides.rpcUrl || base.rpcUrl,
    explorerApiUrl: overrides.explorerApiUrl || base.explorerApiUrl,
    explorerUrl: overrides.explorerUrl || base.explorerUrl,
    faucetUrl: overrides.faucetUrl ?? base.faucetUrl,
  };
}
