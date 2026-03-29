export type NetworkId = "mainnet" | "testnet" | "devnet";

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  rpcUrl: string;
  explorerApiUrl: string;
  faucetUrl: string | null;
  color: string;
  enabled: boolean;
}

export const networks: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "Mainnet",
    rpcUrl: "http://127.0.0.1:9944",
    explorerApiUrl: "http://127.0.0.1:9955",
    faucetUrl: null,
    color: "#10b981",
    enabled: true,
  },
  testnet: {
    id: "testnet",
    name: "Testnet",
    rpcUrl: "http://127.0.0.1:19944",
    explorerApiUrl: "http://127.0.0.1:19955",
    faucetUrl: "http://127.0.0.1:19966",
    color: "#f59e0b",
    enabled: true,
  },
  devnet: {
    id: "devnet",
    name: "Devnet",
    rpcUrl: "http://127.0.0.1:29944",
    explorerApiUrl: "http://127.0.0.1:29955",
    faucetUrl: "http://127.0.0.1:29966",
    color: "#6366f1",
    enabled: true,
  },
};

export const DEFAULT_NETWORK: NetworkId = "devnet";
