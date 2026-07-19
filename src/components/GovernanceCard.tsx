import { useEffect, useState } from "react";
import { useWallet } from "../lib/context";
import {
  getGovernanceProposals,
  getStakingInfo,
  submitOperation,
  getAccount,
  type GovernanceProposal,
  type UserOperation,
} from "../lib/rpc";
import { signOperation, buildSigningMessage, addressToBytes } from "../lib/wallet";
import { networks } from "../lib/networks";
import { hexToBytes } from "@noble/hashes/utils";

function formatSolen(raw: string): string {
  const n = BigInt(raw);
  const whole = n / BigInt(100_000_000);
  const frac = n % BigInt(100_000_000);
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr}`;
}

function parseAction(action: string): string {
  const m = action.match(/SetBlockTime\s*\{\s*new_block_time_ms:\s*(\d+)/);
  if (m) return `Set block time to ${m[1]}ms`;
  const f = action.match(/SetBaseFee\s*\{\s*new_fee:\s*(\d+)/);
  if (f) return `Set base fee to ${f[1]}`;
  const b = action.match(/SetBurnRate\s*\{\s*new_burn_rate_bps:\s*(\d+)/);
  if (b) return `Set burn rate to ${(Number(b[1]) / 100).toFixed(1)}%`;
  const r = action.match(/SetEpochReward\s*\{\s*new_reward:\s*(\d+)/);
  if (r) return `Set epoch reward to ${formatSolen(r[1])} SOLEN`;
  const s = action.match(/SetMinValidatorStake\s*\{\s*new_min_stake:\s*(\d+)/);
  if (s) return `Set min validator stake to ${formatSolen(s[1])} SOLEN`;
  if (action.includes("EmergencyPause")) return "Emergency Pause";
  if (action.includes("EmergencyResume")) return "Emergency Resume";
  return action;
}

function statusColor(status: string): string {
  if (status === "Active") return "text-blue-400 bg-blue-400/10 border-blue-400/30";
  if (status === "Passed") return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
  if (status === "Executed") return "text-purple-400 bg-purple-400/10 border-purple-400/30";
  if (status === "Rejected") return "text-red-400 bg-red-400/10 border-red-400/30";
  return "text-gray-400 bg-gray-400/10 border-gray-400/30";
}

export function GovernanceCard() {
  const { network, activeAccount } = useWallet();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [stakeWeight, setStakeWeight] = useState("");
  const [votingOn, setVotingOn] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [userStake, setUserStake] = useState("0");

  useEffect(() => {
    const fetch = async () => {
      try {
        const props = await getGovernanceProposals(network);
        setProposals(props.sort((a, b) => b.id - a.id));
      } catch {}

      if (activeAccount) {
        try {
          const info = await getStakingInfo(network, activeAccount.accountId);
          setUserStake(info.total_delegated);
        } catch {}
      }
    };

    fetch();
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, [network, activeAccount]);

  const handleVote = async (proposalId: number, support: boolean) => {
    if (!activeAccount) return;
    setSubmitting(true);
    setResult(null);

    try {
      const accountInfo = await getAccount(network, activeAccount.accountId);

      // Build vote args: proposal_id[8] + support[1] + stake_weight[16]
      const weight = stakeWeight
        ? BigInt(Math.floor(parseFloat(stakeWeight) * 100_000_000))
        : BigInt(userStake);

      const args: number[] = [];
      // proposal_id LE u64
      const pidBuf = new ArrayBuffer(8);
      new DataView(pidBuf).setBigUint64(0, BigInt(proposalId), true);
      args.push(...new Uint8Array(pidBuf));
      // support byte
      args.push(support ? 1 : 0);
      // stake_weight LE u128
      const wBuf = new ArrayBuffer(16);
      const wView = new DataView(wBuf);
      wView.setBigUint64(0, weight & BigInt("0xFFFFFFFFFFFFFFFF"), true);
      wView.setBigUint64(8, weight >> BigInt(64), true);
      args.push(...new Uint8Array(wBuf));

      const argsHex = args.map((b) => b.toString(16).padStart(2, "0")).join("");

      const govAddr = "ff".repeat(31) + "02";

      const operation: UserOperation = {
        sender: activeAccount.accountId,
        nonce: accountInfo.nonce,
        actions: [{ type: "call", to: govAddr, method: "vote", args: argsHex }],
        max_fee: "100000",
        signature: "",
      };

      const senderBytes = Array.from(addressToBytes(activeAccount.accountId));
      const targetBytes = Array.from(hexToBytes(govAddr));
      const argsBytes = Array.from(hexToBytes(argsHex));
      const rustActions = [{ Call: { target: targetBytes, method: "vote", args: argsBytes } }];
      const sigMsg = buildSigningMessage(senderBytes, accountInfo.nonce, 100000, rustActions, networks[network].chainId);
      operation.signature = await signOperation(activeAccount, sigMsg);

      await submitOperation(network, operation);

      setResult({ success: true, message: `Vote ${support ? "FOR" : "AGAINST"} proposal #${proposalId} submitted` });
      setVotingOn(null);
      setStakeWeight("");
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : "Vote failed" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-200">Governance Proposals</h3>
          {BigInt(userStake) > BigInt(0) && (
            <span className="text-xs text-gray-500">
              Your stake: {formatSolen(userStake)} SOLEN
            </span>
          )}
        </div>

        {proposals.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No proposals yet</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => {
              const totalVoted = BigInt(p.total_for) + BigInt(p.total_against);
              const forPct = totalVoted > BigInt(0)
                ? Number((BigInt(p.total_for) * BigInt(1000)) / totalVoted) / 10
                : 0;

              return (
                <div key={p.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-200">#{p.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(p.status)}`}>
                          {p.status}
                        </span>
                      </div>
                      <p className="text-sm text-emerald-400 font-medium">{parseAction(p.action)}</p>
                      {p.description && (
                        <p className="text-xs text-gray-500 mt-1">{p.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Vote bar */}
                  {totalVoted > BigInt(0) && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>For: {formatSolen(p.total_for)}</span>
                        <span>Against: {formatSolen(p.total_against)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${forPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>{forPct.toFixed(1)}% for</span>
                        <span>{p.vote_count} votes</span>
                      </div>
                    </div>
                  )}

                  {/* Vote buttons */}
                  {p.status === "Active" && activeAccount && (
                    <div className="mt-3">
                      {votingOn === p.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={stakeWeight}
                            onChange={(e) => setStakeWeight(e.target.value)}
                            placeholder={`Stake weight (default: ${formatSolen(userStake)} SOLEN)`}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVote(p.id, true)}
                              disabled={submitting}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-sm py-2 rounded-lg transition-colors"
                            >
                              {submitting ? "..." : "Vote FOR"}
                            </button>
                            <button
                              onClick={() => handleVote(p.id, false)}
                              disabled={submitting}
                              className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 text-white text-sm py-2 rounded-lg transition-colors"
                            >
                              {submitting ? "..." : "Vote AGAINST"}
                            </button>
                            <button
                              onClick={() => { setVotingOn(null); setStakeWeight(""); }}
                              className="px-3 bg-gray-800 text-gray-400 text-sm py-2 rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setVotingOn(p.id)}
                          className="w-full text-sm text-emerald-400 hover:text-emerald-300 bg-emerald-400/5 hover:bg-emerald-400/10 border border-emerald-400/20 py-2 rounded-lg transition-colors"
                        >
                          Vote on this proposal
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex gap-4 mt-2 text-xs text-gray-600">
                    <span>Voting ends: epoch {p.voting_end_epoch}</span>
                    <span>Execute after: epoch {p.execute_after_epoch}</span>
                    <span>Proposer: {p.proposer.slice(0, 8)}...</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {result && (
          <div
            className={`mt-3 p-3 rounded-lg text-sm ${
              result.success
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
