import { networks, type NetworkId } from "./networks";
import { httpFetch } from "./http";

let requestId = 0;

export async function rpcCall<T>(
  network: NetworkId,
  method: string,
  params: unknown[] | Record<string, unknown> = [],
): Promise<T> {
  const url = networks[network].rpcUrl;
  const id = ++requestId;

  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  console.log("[RPC Request]", method, body.slice(0, 1000));

  const res = await httpFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
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
  return rpcCall<string>(network, "solen_getBalance", [accountId]);
}

export function getAccount(network: NetworkId, accountId: string) {
  return rpcCall<AccountInfo>(network, "solen_getAccount", [accountId]);
}

export function getBlock(network: NetworkId, height: number) {
  return rpcCall<BlockInfo>(network, "solen_getBlock", [height]);
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

/**
 * Convert wallet-friendly operation format to Rust serde format.
 *
 * Wallet uses: { sender: "hex", actions: [{ type: "transfer", to: "hex", amount: "123" }] }
 * Rust expects: { sender: [1,2,3...], actions: [{ Transfer: { to: [1,2,3...], amount: 123 } }] }
 */
function toRustOperation(op: UserOperation): Record<string, unknown> {
  const sender = hexToBytes(op.sender);
  const signature = op.signature ? hexToBytes(op.signature) : [];

  const actions = op.actions.map((action) => {
    switch (action.type) {
      case "transfer":
        return {
          Transfer: {
            to: hexToBytes(action.to || ""),
            amount: parseInt(action.amount || "0"),
          },
        };
      case "call":
        return {
          Call: {
            target: hexToBytes(action.to || ""),
            method: action.method || "",
            args: action.args ? hexToBytes(action.args) : [],
          },
        };
      case "deploy":
        return {
          Deploy: {
            code: action.code ? hexToBytes(action.code) : [],
            salt: new Array(32).fill(0),
          },
        };
      default:
        return action;
    }
  });

  return {
    sender,
    nonce: op.nonce,
    actions,
    max_fee: parseInt(op.max_fee || "10000"),
    signature,
  };
}

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

export function submitOperation(network: NetworkId, operation: UserOperation) {
  return rpcCall<{ op_hash: string }>(network, "solen_submitOperation", [toRustOperation(operation)]);
}

export function simulateOperation(network: NetworkId, operation: UserOperation) {
  return rpcCall<{ success: boolean; gas_used: number; error?: string }>(
    network,
    "solen_simulateOperation",
    [toRustOperation(operation)],
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
  commission_bps: number;
}

export interface StakingInfo {
  total_delegated: string;
  delegations: { validator: string; amount: string }[];
  pending_undelegations: number;
}

export function getValidators(network: NetworkId) {
  return rpcCall<ValidatorInfo[]>(network, "solen_getValidators", []);
}

export function getStakingInfo(network: NetworkId, accountId: string) {
  return rpcCall<StakingInfo>(network, "solen_getStakingInfo", [accountId]);
}

// Vesting

export interface VestingInfo {
  has_schedule: boolean;
  total_amount: string;
  vested: string;
  claimed: string;
  claimable: string;
  vesting_type: string;
}

export function getVestingInfo(network: NetworkId, accountId: string) {
  return rpcCall<VestingInfo>(network, "solen_getVestingInfo", [accountId]);
}

// Contract view calls

export interface CallViewResult {
  success: boolean;
  return_data: string;
  gas_used: number;
  error?: string;
}

export function callView(
  network: NetworkId,
  contractId: string,
  method: string,
  args?: string,
) {
  return rpcCall<CallViewResult>(network, "solen_callView", [
    contractId,
    method,
    args || null,
  ]);
}
