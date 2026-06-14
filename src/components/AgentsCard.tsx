import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../lib/context";
import { getAccount, submitRustOperation, getChainStatus } from "../lib/rpc";
import {
  signMessage, buildSigningMessage, addressToBytes,
  generateKeypair, base58Encode, parseAmount, formatBalance,
} from "../lib/wallet";
import { networks } from "../lib/networks";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";

/** A parsed on-chain Session auth method (an agent). */
interface Agent {
  pubkeyHex: string;
  budgetTotal: bigint;
  spendingLimit: bigint;
  allowedTargets: string[];
  allowedMethods: string[];
  expiresAt: number;
  restrictSubcalls: boolean;
}

const NEVER = Number.MAX_SAFE_INTEGER;

function isSession(m: Record<string, unknown>): m is { Session: Record<string, unknown> } {
  return !!(m as { Session?: unknown }).Session;
}

export function AgentsCard() {
  const { activeAccount, network } = useWallet();
  const chainId = networks[network].chainId;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [rawMethods, setRawMethods] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState(false);

  // Grant form.
  const [newKey, setNewKey] = useState<{ pub: string; seed: string } | null>(null);
  const [budget, setBudget] = useState("");
  const [perOp, setPerOp] = useState("");
  const [methods, setMethods] = useState("");
  const [targets, setTargets] = useState("");
  const [expiryHeight, setExpiryHeight] = useState("");
  const [lockdown, setLockdown] = useState(false);

  const load = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);
    try {
      const info = await getAccount(network, activeAccount.accountId);
      const methodsArr = info.auth_methods ?? [];
      setRawMethods(methodsArr);
      setAgents(
        methodsArr.filter(isSession).map((m) => {
          const s = m.Session as Record<string, any>;
          return {
            pubkeyHex: bytesToHex(Uint8Array.from(s.session_key)),
            budgetTotal: BigInt(s.budget_total ?? 0),
            spendingLimit: BigInt(s.spending_limit ?? 0),
            allowedTargets: (s.allowed_targets ?? []).map((t: number[]) => base58Encode(Uint8Array.from(t))),
            allowedMethods: s.allowed_methods ?? [],
            expiresAt: s.expires_at ?? NEVER,
            restrictSubcalls: !!s.restrict_subcalls,
          };
        }),
      );
      const cs = await getChainStatus(network).catch(() => null);
      setHeight(cs?.height ?? null);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : String(e), kind: "err" });
    } finally {
      setLoading(false);
    }
  }, [activeAccount, network]);

  useEffect(() => { void load(); }, [load]);

  /** Sign + submit a SetAuth with the given full method list. */
  async function submitSetAuth(newMethods: unknown[]): Promise<void> {
    if (!activeAccount) throw new Error("no active account");
    const info = await getAccount(network, activeAccount.accountId);
    const senderBytes = Array.from(addressToBytes(activeAccount.accountId));
    const rustActions = [{ SetAuth: { auth_methods: newMethods } }];
    const sigMsg = buildSigningMessage(senderBytes, info.nonce, 100000, rustActions, chainId);
    const signature = await signMessage(activeAccount.secretKey, sigMsg);
    const rustOp = {
      sender: senderBytes,
      nonce: info.nonce,
      actions: rustActions,
      max_fee: 100000,
      signature: Array.from(hexToBytes(signature)),
    };
    await submitRustOperation(network, rustOp);
  }

  async function onGrant() {
    if (!activeAccount || !newKey) return;
    setBusy(true);
    setStatus(null);
    try {
      const session = {
        Session: {
          session_key: Array.from(hexToBytes(newKey.pub)),
          expires_at: expiryHeight ? parseInt(expiryHeight, 10) : NEVER,
          spending_limit: perOp ? Number(parseAmount(perOp)) : 0,
          budget_total: budget ? Number(parseAmount(budget)) : 0,
          allowed_targets: targets.split(",").map((t) => t.trim()).filter(Boolean)
            .map((t) => Array.from(addressToBytes(t))),
          allowed_methods: methods.split(",").map((m) => m.trim()).filter(Boolean),
          restrict_subcalls: lockdown,
        },
      };
      // Replace any existing session for the same key, then append.
      const kept = rawMethods.filter((m) => !(isSession(m)
        && bytesToHex(Uint8Array.from((m.Session as any).session_key)) === newKey.pub));
      await submitSetAuth([...kept, session]);
      setStatus({ msg: "Agent granted. It may take a few seconds to appear.", kind: "ok" });
      setNewKey(null); setBudget(""); setPerOp(""); setMethods(""); setTargets(""); setExpiryHeight(""); setLockdown(false);
      setTimeout(() => void load(), 2500);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : String(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(pubkeyHex: string) {
    if (!activeAccount) return;
    if (!window.confirm("Revoke this agent? It will no longer be able to transact.")) return;
    setBusy(true);
    setStatus(null);
    try {
      const kept = rawMethods.filter((m) => !(isSession(m)
        && bytesToHex(Uint8Array.from((m.Session as any).session_key)) === pubkeyHex));
      if (kept.length === 0) throw new Error("cannot remove the account's only auth method");
      await submitSetAuth(kept);
      setStatus({ msg: "Agent revoked.", kind: "ok" });
      setTimeout(() => void load(), 2500);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : String(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function mintKey() {
    const kp = await generateKeypair();
    setNewKey({ pub: kp.publicKey, seed: kp.secretKey.slice(0, 64) });
  }

  const short = (s: string) => (s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
  const solen = (n: bigint) => (n > 0n ? `${formatBalance(n.toString())} SOLEN` : "unlimited");

  if (!activeAccount) {
    return (
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <p className="text-gray-400 text-sm">Select an account to manage agents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Existing agents */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-100">Agents</h3>
          <button onClick={() => void load()} className="text-xs text-purple-400 hover:text-purple-300">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Scoped session keys on this account. Each can transact within its budget, targets, and
          methods — enforced by consensus. {height != null && <span>Current height: {height}.</span>}
        </p>

        {agents.length === 0 ? (
          <p className="text-sm text-gray-500">No agents granted on this account.</p>
        ) : (
          <div className="space-y-3">
            {agents.map((a) => (
              <div key={a.pubkeyHex} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-gray-300">{short(a.pubkeyHex)}</span>
                  <button
                    onClick={() => void onRevoke(a.pubkeyHex)}
                    disabled={busy}
                    className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Row k="Budget" v={solen(a.budgetTotal)} />
                  <Row k="Per-op cap" v={solen(a.spendingLimit)} />
                  <Row k="Methods" v={a.allowedMethods.length ? a.allowedMethods.join(", ") : "any"} />
                  <Row k="Targets" v={a.allowedTargets.length ? `${a.allowedTargets.length} allowed` : "any"} />
                  <Row k="Expires" v={a.expiresAt >= NEVER ? "never" : `height ${a.expiresAt}`} />
                  <Row k="Sub-call lockdown" v={a.restrictSubcalls ? "on" : "off"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grant a new agent */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Grant a new agent</h3>

        {!newKey ? (
          <button onClick={() => void mintKey()} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium">
            Generate agent key
          </button>
        ) : (
          <>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-300 font-medium mb-1">Agent secret key — shown once. Save it for your agent runtime.</p>
              <p className="font-mono text-[11px] text-amber-200 break-all select-all">{newKey.seed}</p>
              <p className="text-[11px] text-gray-400 mt-2">Public key (granted below): <span className="font-mono">{short(newKey.pub)}</span></p>
            </div>

            <div className="space-y-3">
              <Field label="Lifetime budget (SOLEN, blank = unlimited)">
                <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 10" className={inputCls} />
              </Field>
              <Field label="Per-operation cap (SOLEN, blank = none)">
                <input value={perOp} onChange={(e) => setPerOp(e.target.value)} placeholder="e.g. 1" className={inputCls} />
              </Field>
              <Field label="Allowed methods (comma-separated, blank = any)">
                <input value={methods} onChange={(e) => setMethods(e.target.value)} placeholder="e.g. transfer" className={inputCls} />
              </Field>
              <Field label="Allowed targets (comma-separated addresses, blank = any)">
                <input value={targets} onChange={(e) => setTargets(e.target.value)} placeholder="base58 / hex addresses" className={inputCls} />
              </Field>
              <Field label="Expire at block height (blank = never)">
                <input value={expiryHeight} onChange={(e) => setExpiryHeight(e.target.value)} placeholder={height != null ? `current: ${height}` : "block height"} className={inputCls} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={lockdown} onChange={(e) => setLockdown(e.target.checked)} className="accent-purple-500" />
                Sub-call lockdown (enforce targets/methods on contract sub-calls too)
              </label>

              <div className="flex gap-2 pt-1">
                <button onClick={() => void onGrant()} disabled={busy} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium">
                  {busy ? "Granting…" : "Grant agent"}
                </button>
                <button onClick={() => setNewKey(null)} disabled={busy} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}

        {status && (
          <p className={`mt-4 text-sm ${status.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{status.msg}</p>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-300 text-right truncate">{v}</span>
    </>
  );
}
