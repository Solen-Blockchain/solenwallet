import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../lib/context";
import { getAccount, submitRustOperation, getChainStatus } from "../lib/rpc";
import { signMessage, buildSigningMessage, addressToBytes } from "../lib/wallet";
import { hybridFromMnemonic, hybridAuthMethod } from "../lib/pq";
import { networks } from "../lib/networks";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";

/** u64::MAX — the "post-quantum auth not activated" sentinel from the node. */
const U64_MAX = "18446744073709551615";

type OnChainScheme = "classical" | "hybrid" | "ml-dsa" | "unknown";

function schemeOf(methods: Array<Record<string, unknown>>): OnChainScheme {
  if (methods.some((m) => "Hybrid" in m)) return "hybrid";
  if (methods.some((m) => "MlDsa" in m)) return "ml-dsa";
  if (methods.some((m) => "Ed25519" in m)) return "classical";
  return "unknown";
}

export function SecurityCard() {
  const { activeAccount, network, revealMnemonic, upgradeAccountScheme } = useWallet();
  const chainId = networks[network].chainId;

  const [rawMethods, setRawMethods] = useState<Array<Record<string, unknown>>>([]);
  const [onChain, setOnChain] = useState<OnChainScheme>("unknown");
  const [height, setHeight] = useState<number | null>(null);
  const [pqHeight, setPqHeight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);
    try {
      const [info, cs] = await Promise.all([
        getAccount(network, activeAccount.accountId),
        getChainStatus(network).catch(() => null),
      ]);
      const methods = info.auth_methods ?? [];
      setRawMethods(methods);
      setOnChain(schemeOf(methods));
      setHeight(cs?.height ?? null);
      setPqHeight(cs?.config?.pq_auth_height ?? null);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : String(e), kind: "err" });
    } finally {
      setLoading(false);
    }
  }, [activeAccount, network]);

  useEffect(() => { void load(); }, [load]);

  // PQ activation state on the connected network.
  const pqDormant = pqHeight == null || pqHeight === "" || pqHeight === U64_MAX;
  const pqActive = !pqDormant && height != null && Number(pqHeight) <= height;
  const isQuantumSafe = onChain === "hybrid" || onChain === "ml-dsa";
  const isHd = !!activeAccount?.hd;
  const canUpgrade = pqActive && !isQuantumSafe && isHd;

  async function onUpgrade() {
    if (!activeAccount?.hd) return;
    setBusy(true);
    setStatus(null);
    try {
      // Phrase-preserving: re-derive both keys from the SAME mnemonic. Password
      // re-entry confirms intent and unlocks the words.
      const mnemonic = await revealMnemonic(password, activeAccount.hd.mnemonicId);
      if (!mnemonic) throw new Error("incorrect password");
      const keys = await hybridFromMnemonic(mnemonic, activeAccount.hd.derivationIndex);

      // Safety: the derived Ed25519 key must match this account, or we'd be
      // registering auth this wallet can't sign with.
      if (bytesToHex(keys.edPublicKey) !== activeAccount.publicKey) {
        throw new Error("derived key does not match this account — aborting");
      }

      // Replace the standalone Ed25519 method with a Hybrid method (which
      // requires BOTH signatures); keep any agent (Session) methods intact.
      const info = await getAccount(network, activeAccount.accountId);
      const current = info.auth_methods ?? [];
      const kept = current.filter((m) => !("Ed25519" in m));
      const newMethods = [hybridAuthMethod(keys.edPublicKey, keys.mlPublicKey), ...kept];

      const senderBytes = Array.from(addressToBytes(activeAccount.accountId));
      const rustActions = [{ SetAuth: { auth_methods: newMethods } }];
      const sigMsg = buildSigningMessage(senderBytes, info.nonce, 100000, rustActions, chainId);
      // Signed with the CURRENT (classical) key — the account is still Ed25519
      // at this instant; the Hybrid requirement takes effect on the next op.
      const signature = await signMessage(activeAccount.secretKey, sigMsg);
      await submitRustOperation(network, {
        sender: senderBytes,
        nonce: info.nonce,
        actions: rustActions,
        max_fee: 100000,
        signature: Array.from(hexToBytes(signature)),
      });

      await upgradeAccountScheme(activeAccount.accountId, "hybrid");
      setStatus({ msg: "Upgraded to quantum-safe hybrid auth. Same address, same recovery phrase.", kind: "ok" });
      setShowUpgrade(false);
      setPassword("");
      setTimeout(() => void load(), 2500);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : String(e), kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  if (!activeAccount) {
    return (
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <p className="text-gray-400 text-sm">Select an account to view its security.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview / education */}
      <div className="bg-gradient-to-br from-solen-orange/10 to-gray-800/50 rounded-2xl p-6 border border-solen-orange/20">
        <div className="flex items-start gap-3">
          <ShieldIcon className="w-8 h-8 text-solen-orange shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-gray-100">Post-Quantum Security</h3>
            <p className="text-sm text-gray-400 mt-1">
              A future quantum computer could break the Ed25519 signatures that secure classical
              accounts — and adversaries can <span className="text-gray-300">harvest signatures now to
              forge them later</span>. Solen accounts can upgrade to <span className="text-solen-orange">ML-DSA-65
              (FIPS&nbsp;204)</span> hybrid auth: every transaction is signed with your Ed25519 key
              <span className="text-gray-300"> and</span> a lattice-based post-quantum key.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              The upgrade is <span className="text-gray-300">phrase-preserving</span> — the quantum key
              derives from your existing recovery phrase, so your address and your 24 words never change.
            </p>
          </div>
        </div>
      </div>

      {/* This account's status */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-100">This account</h3>
          <button onClick={() => void load()} className="text-xs text-solen-orange hover:text-solen-orange-light">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <SchemeBadge scheme={onChain} />
          <span className="text-sm text-gray-400">
            {isQuantumSafe
              ? "Protected against quantum forgery."
              : "Secured by classical Ed25519 signatures."}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs border-t border-gray-700/40 pt-3">
          <Row k="Account" v={short(activeAccount.accountId)} />
          <Row k="Recovery phrase" v={isHd ? "backs this account" : "none (raw key import)"} />
          <Row k="Network PQ auth" v={pqDormant ? "not yet activated" : pqActive ? `active @ height ${pqHeight}` : `activates @ height ${pqHeight}`} />
          <Row k="Current height" v={height != null ? String(height) : "—"} />
        </div>
      </div>

      {/* Upgrade action */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold text-gray-100 mb-3">Upgrade to quantum-safe</h3>

        {isQuantumSafe ? (
          <p className="text-sm text-emerald-400">✓ This account already uses post-quantum hybrid auth.</p>
        ) : !isHd ? (
          <p className="text-sm text-gray-400">
            This account was imported from a raw private key and has no recovery phrase, so it can't be
            upgraded in place. Move funds to a recovery-phrase account to gain quantum protection.
          </p>
        ) : pqDormant ? (
          <div>
            <p className="text-sm text-gray-400">
              Post-quantum auth is <span className="text-amber-400">not yet active</span> on {networks[network].name}.
              Upgrading an account before the network honors post-quantum signatures would freeze it, so the
              upgrade unlocks automatically on the activation flag-day.
            </p>
            <button disabled className="mt-4 px-4 py-2 rounded-lg bg-gray-700 text-gray-500 text-sm font-medium cursor-not-allowed">
              Upgrade to hybrid (awaiting network activation)
            </button>
          </div>
        ) : !showUpgrade ? (
          <div>
            <p className="text-sm text-gray-400 mb-4">
              Registers an ML-DSA-65 key derived from your recovery phrase and switches this account to
              hybrid auth. Your address and recovery phrase stay the same. Requires your password.
            </p>
            <button
              onClick={() => setShowUpgrade(true)}
              disabled={!canUpgrade}
              className="px-4 py-2 rounded-lg bg-solen-orange hover:bg-solen-orange-light text-gray-900 text-sm font-semibold disabled:opacity-50"
            >
              Upgrade to quantum-safe (hybrid)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              Enter your wallet password to derive the post-quantum key and sign the upgrade.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Wallet password"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-solen-orange/50"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void onUpgrade()}
                disabled={busy || !password}
                className="px-4 py-2 rounded-lg bg-solen-orange hover:bg-solen-orange-light text-gray-900 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Upgrading…" : "Confirm upgrade"}
              </button>
              <button
                onClick={() => { setShowUpgrade(false); setPassword(""); }}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {status && (
          <p className={`mt-4 text-sm ${status.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{status.msg}</p>
        )}
      </div>
    </div>
  );
}

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);

function SchemeBadge({ scheme }: { scheme: OnChainScheme }) {
  const map: Record<OnChainScheme, { label: string; cls: string }> = {
    hybrid: { label: "Quantum-safe · Hybrid", cls: "bg-solen-orange/15 text-solen-orange border-solen-orange/30" },
    "ml-dsa": { label: "Quantum-safe · ML-DSA", cls: "bg-solen-orange/15 text-solen-orange border-solen-orange/30" },
    classical: { label: "Classical · Ed25519", cls: "bg-gray-700/50 text-gray-300 border-gray-600/50" },
    unknown: { label: "Unknown", cls: "bg-gray-700/50 text-gray-400 border-gray-600/50" },
  };
  const { label, cls } = map[scheme];
  return <span className={`text-xs font-medium px-3 py-1 rounded-full border ${cls}`}>{label}</span>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-300 text-right truncate font-mono">{v}</span>
    </>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.2 12.2l1.9 1.9 3.7-3.9" />
    </svg>
  );
}
