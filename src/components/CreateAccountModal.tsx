import { useState } from "react";
import { useWallet } from "../lib/context";
import { createAccount, importAccount } from "../lib/wallet";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateAccountModal({ open, onClose }: Props) {
  const { addAccount } = useWallet();
  const [tab, setTab] = useState<"create" | "import">("create");
  const [name, setName] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }
    const acc = createAccount(name.trim());
    addAccount(acc);
    reset();
    onClose();
  };

  const handleImport = () => {
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }
    if (!secretKey.trim() || secretKey.trim().length < 64) {
      setError("Please enter a valid secret key (hex)");
      return;
    }
    try {
      const acc = importAccount(name.trim(), secretKey.trim());
      addAccount(acc);
      reset();
      onClose();
    } catch {
      setError("Invalid secret key");
    }
  };

  const reset = () => {
    setName("");
    setSecretKey("");
    setError(null);
    setTab("create");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-200">Add Account</h2>
          <button
            onClick={() => { reset(); onClose(); }}
            className="text-gray-500 hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-5">
          <button
            onClick={() => setTab("create")}
            className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
              tab === "create"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Create New
          </button>
          <button
            onClick={() => setTab("import")}
            className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
              tab === "import"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Import
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Main Account"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              autoFocus
            />
          </div>

          {tab === "import" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Secret Key (hex)</label>
              <textarea
                value={secretKey}
                onChange={(e) => { setSecretKey(e.target.value); setError(null); }}
                placeholder="Enter your 64-character hex secret key"
                rows={3}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 font-mono resize-none"
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400">{error}</div>
          )}

          <button
            onClick={tab === "create" ? handleCreate : handleImport}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {tab === "create" ? "Create Account" : "Import Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
