export type NetworkId = "mainnet" | "testnet" | "devnet";

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainId: number;
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
    chainId: 1,
    rpcUrl: "https://rpc.solenchain.com",
    explorerApiUrl: "https://api.solenchain.com",
    faucetUrl: null,
    color: "#10b981",
    enabled: true,
  },
  testnet: {
    id: "testnet",
    name: "Testnet",
    chainId: 9000,
    rpcUrl: "https://testnet-rpc.solenchain.com",
    explorerApiUrl: "https://testnet-api.solenchain.com",
    faucetUrl: "https://testnet-faucet.solenchain.com",
    color: "#f59e0b",
    enabled: true,
  },
  devnet: {
    id: "devnet",
    name: "Devnet",
    chainId: 1337,
    rpcUrl: "http://127.0.0.1:29944",
    explorerApiUrl: "http://127.0.0.1:29955",
    faucetUrl: "http://127.0.0.1:29966",
    color: "#6366f1",
    enabled: true,
  },
};

export const DEFAULT_NETWORK: NetworkId = "testnet";
