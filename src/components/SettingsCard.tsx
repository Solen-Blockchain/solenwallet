import { useState } from "react";
import { useWallet } from "../lib/context";
import { LOCK_TIMEOUT_OPTIONS } from "../lib/context";

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

      {/* Network */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">Network</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-300">Current Network</div>
            <div className="text-xs text-gray-500">Switch using the selector in the header</div>
          </div>
          <div className="text-sm text-gray-300 capitalize">{network}</div>
        </div>
      </div>

      {/* About */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">About</h3>
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex justify-between">
            <span>Version</span>
            <span className="text-gray-300">0.1.0</span>
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
