import { getNetworkConfig, type NetworkId } from "./networks";
import { httpFetch } from "./http";

export interface FaucetStatus {
  faucet_account: string;
  balance: string;
  drip_amount: string;
  cooldown_secs: number;
}

export interface FaucetDripResult {
  op_hash: string;
  amount: string;
  recipient: string;
}

export async function getFaucetStatus(network: NetworkId): Promise<FaucetStatus> {
  const url = getNetworkConfig(network).faucetUrl;
  if (!url) throw new Error("Faucet not available on this network");

  const res = await httpFetch(`${url}/status`);
  if (!res.ok) throw new Error(`Faucet status failed: ${res.status}`);
  return res.json();
}

export async function requestDrip(
  network: NetworkId,
  accountId: string,
): Promise<FaucetDripResult> {
  const url = getNetworkConfig(network).faucetUrl;
  if (!url) throw new Error("Faucet not available on this network");

  const res = await httpFetch(`${url}/drip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: accountId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Faucet drip failed: ${body}`);
  }

  return res.json();
}
