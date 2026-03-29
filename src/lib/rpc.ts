import { networks, type NetworkId } from "./networks";
import { httpFetch } from "./http";

let requestId = 0;

export async function rpcCall<T>(
  network: NetworkId,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const url = networks[network].rpcUrl;
  const id = ++requestId;

  const res = await httpFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (!res.ok) {
    throw new Error(`RPC request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  return json.result as T;
}

export interface ChainStatus {
  height: number;
  latest_state_root: string;
  pending_ops: number;
}

export interface AccountInfo {
  id: string;
  balance: string;
  nonce: number;
  code_hash: string | null;
}

export interface BlockInfo {
  height: number;
  hash: string;
  parent_hash: string;
  state_root: string;
  timestamp: number;
  tx_count: number;
  gas_used: number;
}

export function getChainStatus(network: NetworkId) {
  return rpcCall<ChainStatus>(network, "solen_chainStatus");
}

export function getBalance(network: NetworkId, accountId: string) {
  return rpcCall<string>(network, "solen_getBalance", { account_id: accountId });
}

export function getAccount(network: NetworkId, accountId: string) {
  return rpcCall<AccountInfo>(network, "solen_getAccount", { account_id: accountId });
}

export function getBlock(network: NetworkId, height: number) {
  return rpcCall<BlockInfo>(network, "solen_getBlock", { height });
}

export function getLatestBlock(network: NetworkId) {
  return rpcCall<BlockInfo>(network, "solen_getLatestBlock");
}

export interface UserOperation {
  sender: string;
  nonce: number;
  actions: Action[];
  max_fee: string;
  signature: string;
}

export interface Action {
  type: "transfer" | "call" | "deploy";
  to?: string;
  amount?: string;
  method?: string;
  args?: string;
  code?: string;
}

export function submitOperation(network: NetworkId, operation: UserOperation) {
  return rpcCall<{ op_hash: string }>(network, "solen_submitOperation", { operation });
}

export function simulateOperation(network: NetworkId, operation: UserOperation) {
  return rpcCall<{ success: boolean; gas_used: number; error?: string }>(
    network,
    "solen_simulateOperation",
    { operation },
  );
}

// Staking

export interface ValidatorInfo {
  address: string;
  self_stake: string;
  total_delegated: string;
  total_stake: string;
  is_active: boolean;
  is_genesis: boolean;
}

export interface StakingInfo {
  total_delegated: string;
  delegations: { validator: string; amount: string }[];
  pending_undelegations: number;
}

export function getValidators(network: NetworkId) {
  return rpcCall<ValidatorInfo[]>(network, "solen_getValidators");
}

export function getStakingInfo(network: NetworkId, accountId: string) {
  return rpcCall<StakingInfo>(network, "solen_getStakingInfo", { account_id: accountId });
}
