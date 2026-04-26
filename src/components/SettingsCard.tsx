import { useState } from "react";
import { useWallet } from "../lib/context";
import { LOCK_TIMEOUT_OPTIONS } from "../lib/context";
import {
  networks,
  getNetworkConfig,
  loadNetworkOverrides,
  saveNetworkOverrides,
  type NetworkId,
  type NetworkOverrides,
} from "../lib/networks";

export function SettingsCard() {
  const {
    hasPassword, lockTimeoutMs, setLockTimeout,
    setPassword, changePassword, removePassword, network,
  } = useWallet();

  // Change password
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Set password (first time)
  const [showSetPw, setShowSetPw] = useState(false);
  const [setPwVal, setSetPwVal] = useState("");
  const [setPwConfirm, setSetPwConfirm] = useState("");

  // Remove password
  const [showRemovePw, setShowRemovePw] = useState(false);
  const [removePwVal, setRemovePwVal] = useState("");

  const resetPwForms = () => {
    setShowChangePw(false);
    setShowSetPw(false);
    setShowRemovePw(false);
    setOldPw("");
    setNewPw("");
    setConfirmPw("");
    setSetPwVal("");
    setSetPwConfirm("");
    setRemovePwVal("");
    setPwError("");
    setPwSuccess("");
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (setPwVal.length < 6) { setPwError("Password must be at least 6 characters"); return; }
    if (setPwVal !== setPwConfirm) { setPwError("Passwords don't match"); return; }
    await setPassword(setPwVal);
    resetPwForms();
    setPwSuccess("Password set");
    setTimeout(() => setPwSuccess(""), 3000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (newPw.length < 6) { setPwError("New password must be at least 6 characters"); return; }
    if (newPw !== confirmPw) { setPwError("New passwords don't match"); return; }
    const ok = await changePassword(oldPw, newPw);
    if (!ok) { setPwError("Current password is incorrect"); return; }
    resetPwForms();
    setPwSuccess("Password changed");
    setTimeout(() => setPwSuccess(""), 3000);
  };

  const handleRemovePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    const ok = await removePassword(removePwVal);
    if (!ok) { setPwError("Incorrect password"); return; }
    resetPwForms();
    setPwSuccess("Password removed");
    setTimeout(() => setPwSuccess(""), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Security */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">Security</h3>

        <div className="space-y-4">
          {/* Password status */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-300">Wallet Password</div>
              <div className="text-xs text-gray-500">
                {hasPassword ? "Password is set — wallet locks automatically" : "No password set — keys stored unencrypted"}
              </div>
            </div>
            <div className="flex gap-2">
              {hasPassword ? (
                <>
                  <button
                    onClick={() => { resetPwForms(); setShowChangePw(true); }}
                    className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Change
                  </button>
                  <button
                    onClick={() => { resetPwForms(); setShowRemovePw(true); }}
                    className="text-sm bg-gray-700 hover:bg-gray-600 text-red-400 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { resetPwForms(); setShowSetPw(true); }}
                  className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  Set Password
                </button>
              )}
            </div>
          </div>

          {pwSuccess && (
            <div className="text-sm text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">{pwSuccess}</div>
          )}

          {/* Set password form */}
          {showSetPw && (
            <form onSubmit={handleSetPassword} className="bg-gray-900 rounded-xl p-4 space-y-3">
              <div className="text-sm text-gray-400 mb-1">Set a new password</div>
              <input
                type="password"
                value={setPwVal}
                onChange={(e) => setSetPwVal(e.target.value)}
                placeholder="New password (min 6 chars)"
                autoFocus
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
              <input
                type="password"
                value={setPwConfirm}
                onChange={(e) => setSetPwConfirm(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
              {pwError && <div className="text-sm text-red-400">{pwError}</div>}
              <div className="flex gap-2">
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Set Password</button>
                <button type="button" onClick={resetPwForms} className="text-gray-400 text-sm px-4 py-2">Cancel</button>
              </div>
            </form>
          )}

          {/* Change password form */}
          {showChangePw && (
            <form onSubmit={handleChangePassword} className="bg-gray-900 rounded-xl p-4 space-y-3">
              <div className="text-sm text-gray-400 mb-1">Change your password</div>
              <input
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                placeholder="Current password"
                autoFocus
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password (min 6 chars)"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
              {pwError && <div className="text-sm text-red-400">{pwError}</div>}
              <div className="flex gap-2">
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Change Password</button>
                <button type="button" onClick={resetPwForms} className="text-gray-400 text-sm px-4 py-2">Cancel</button>
              </div>
            </form>
          )}

          {/* Remove password form */}
          {showRemovePw && (
            <form onSubmit={handleRemovePassword} className="bg-gray-900 rounded-xl p-4 space-y-3">
              <div className="text-sm text-gray-400 mb-1">Enter your password to remove it</div>
              <div className="text-xs text-yellow-500 mb-2">Warning: Your keys will be stored unencrypted.</div>
              <input
                type="password"
                value={removePwVal}
                onChange={(e) => setRemovePwVal(e.target.value)}
                placeholder="Current password"
                autoFocus
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              />
              {pwError && <div className="text-sm text-red-400">{pwError}</div>}
              <div className="flex gap-2">
                <button type="submit" className="bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Remove Password</button>
                <button type="button" onClick={resetPwForms} className="text-gray-400 text-sm px-4 py-2">Cancel</button>
              </div>
            </form>
          )}

          {/* Lock timeout */}
          {hasPassword && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-700/50">
              <div>
                <div className="text-sm text-gray-300">Auto-Lock Timeout</div>
                <div className="text-xs text-gray-500">Lock wallet after inactivity</div>
              </div>
              <select
                value={lockTimeoutMs}
                onChange={(e) => setLockTimeout(Number(e.target.value))}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50"
              >
                {LOCK_TIMEOUT_OPTIONS.map((opt) => (
                  <option key={opt.ms} value={opt.ms}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Recovery phrases */}
      <RecoveryPhrasesPanel />

      {/* Network */}
      <NetworkSettings currentNetwork={network} />

      {/* About — moved below NetworkSettings */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">About</h3>
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex justify-between">
            <span>Version</span>
            <span className="text-gray-300">{__APP_VERSION__}</span>
          </div>
          <div className="flex justify-between">
            <span>Storage</span>
            <span className="text-gray-300">Local (browser)</span>
          </div>
          <div className="flex justify-between">
            <span>Encryption</span>
            <span className="text-gray-300">{hasPassword ? "AES-256-GCM + PBKDF2" : "None"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecoveryPhrasesPanel() {
  const { mnemonics, revealMnemonic } = useWallet();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; words: string } | null>(null);
  const [error, setError] = useState("");

  if (mnemonics.length === 0) return null;

  const startReveal = (id: string) => {
    setActiveId(id);
    setRevealed(null);
    setPw("");
    setError("");
  };

  const cancel = () => {
    setActiveId(null);
    setRevealed(null);
    setPw("");
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId) return;
    setError("");
    const words = await revealMnemonic(pw, activeId);
    if (!words) {
      setError("Incorrect password");
      return;
    }
    setRevealed({ id: activeId, words });
    setPw("");
  };

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Recovery Phrases</h3>
      <div className="text-xs text-gray-500 mb-4">
        Backups for HD accounts. Anyone with a phrase can spend the funds it secures.
      </div>

      <div className="space-y-2">
        {mnemonics.map((m) => {
          const isActive = activeId === m.id;
          const showRevealed = revealed?.id === m.id;
          return (
            <div key={m.id} className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-200">{m.label}</div>
                  <div className="text-xs text-gray-500 font-mono">{m.id.slice(0, 8)}…</div>
                </div>
                {!isActive && (
                  <button
                    onClick={() => startReveal(m.id)}
                    className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Reveal
                  </button>
                )}
                {isActive && !showRevealed && (
                  <button
                    onClick={cancel}
                    className="text-sm text-gray-500 hover:text-gray-300 px-3 py-1.5"
                  >
                    Cancel
                  </button>
                )}
                {isActive && showRevealed && (
                  <button
                    onClick={cancel}
                    className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Hide
                  </button>
                )}
              </div>

              {isActive && !showRevealed && (
                <form onSubmit={submit} className="mt-3 space-y-2">
                  <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Re-enter wallet password"
                    autoFocus
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                  />
                  {error && <div className="text-sm text-red-400">{error}</div>}
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Show Recovery Phrase
                  </button>
                </form>
              )}

              {isActive && showRevealed && (
                <div className="mt-3 space-y-3">
                  <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
                    Don't screenshot, share, or paste this phrase anywhere online.
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 grid grid-cols-3 gap-2 text-sm font-mono">
                    {revealed.words.split(" ").map((word, i) => (
                      <div key={i} className="flex items-baseline gap-1.5">
                        <span className="text-gray-600 text-xs w-6 text-right">{i + 1}.</span>
                        <span className="text-gray-200">{word}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(revealed.words)}
                    className="w-full text-xs text-gray-400 hover:text-gray-200 transition-colors py-1"
                  >
                    Copy to clipboard (use only on a trusted device)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const URL_FIELDS: { key: keyof NetworkOverrides; label: string }[] = [
  { key: "rpcUrl", label: "RPC URL" },
  { key: "explorerApiUrl", label: "Explorer API URL" },
  { key: "explorerUrl", label: "Explorer URL" },
  { key: "faucetUrl", label: "Faucet URL" },
];

function NetworkSettings({ currentNetwork }: { currentNetwork: NetworkId }) {
  const [editingNetwork, setEditingNetwork] = useState<NetworkId | null>(null);
  const [draft, setDraft] = useState<NetworkOverrides>({});
  const [saved, setSaved] = useState("");

  const startEditing = (id: NetworkId) => {
    const overrides = loadNetworkOverrides()[id] || {};
    setDraft(overrides);
    setEditingNetwork(id);
    setSaved("");
  };

  const handleSave = () => {
    if (!editingNetwork) return;
    const all = loadNetworkOverrides();
    // Remove empty strings so defaults are used
    const clean: NetworkOverrides = {};
    for (const f of URL_FIELDS) {
      const val = (draft[f.key] || "").trim();
      if (val) clean[f.key] = val;
    }
    if (Object.keys(clean).length > 0) {
      all[editingNetwork] = clean;
    } else {
      delete all[editingNetwork];
    }
    saveNetworkOverrides(all);
    setEditingNetwork(null);
    setSaved("Settings saved — takes effect on next request");
    setTimeout(() => setSaved(""), 3000);
  };

  const handleReset = () => {
    if (!editingNetwork) return;
    const all = loadNetworkOverrides();
    delete all[editingNetwork];
    saveNetworkOverrides(all);
    setEditingNetwork(null);
    setSaved("Reset to defaults");
    setTimeout(() => setSaved(""), 3000);
  };

  const allNetworks: NetworkId[] = ["mainnet", "testnet", "devnet"];

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Network Configuration</h3>

      {saved && (
        <div className="text-sm text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2 mb-4">{saved}</div>
      )}

      <div className="space-y-2">
        {allNetworks.map((id) => {
          const cfg = getNetworkConfig(id);
          const hasOverrides = !!loadNetworkOverrides()[id];
          const isActive = id === currentNetwork;
          const isEditing = editingNetwork === id;

          return (
            <div key={id}>
              <button
                type="button"
                onClick={() => isEditing ? setEditingNetwork(null) : startEditing(id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors ${
                  isEditing
                    ? "bg-gray-700 border border-gray-600"
                    : "bg-gray-900/50 border border-gray-700/50 hover:border-gray-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: networks[id].color }}
                  />
                  <span className="text-sm font-medium text-gray-200">{networks[id].name}</span>
                  {isActive && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Active</span>
                  )}
                  {hasOverrides && (
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Custom</span>
                  )}
                </div>
                <svg className={`w-4 h-4 text-gray-500 transition-transform ${isEditing ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isEditing && (
                <div className="mt-2 bg-gray-900 rounded-xl p-4 space-y-3">
                  {URL_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                      <input
                        type="text"
                        value={draft[f.key] ?? ""}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        placeholder={networks[id][f.key as keyof typeof cfg] as string || "Not set"}
                        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 font-mono focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  ))}
                  <div className="text-[10px] text-gray-600">Leave blank to use default</div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSave}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
                    >
                      Save
                    </button>
                    {hasOverrides && (
                      <button
                        onClick={handleReset}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-1.5 rounded-lg transition-colors"
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      onClick={() => setEditingNetwork(null)}
                      className="text-gray-500 text-sm px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
