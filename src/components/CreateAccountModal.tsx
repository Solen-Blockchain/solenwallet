import { useState } from "react";
import { useWallet } from "../lib/context";
import { createAccount, importAccount } from "../lib/wallet";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "create" | "import-phrase" | "import-key";
type CreateStep = "name" | "show" | "done";

export function CreateAccountModal({ open, onClose }: Props) {
  const {
    addAccount,
    createMnemonicAccount,
    importMnemonicAccount,
    addAccountFromMnemonic,
    mnemonics,
    hasPassword,
  } = useWallet();
  const [tab, setTab] = useState<Tab>("create");

  // Shared
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create flow
  const [createStep, setCreateStep] = useState<CreateStep>("name");
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string>("");
  const [backedUp, setBackedUp] = useState(false);
  // If a mnemonic already exists, the "create" tab can offer to derive
  // a new index from it instead of generating a fresh phrase.
  const [useExistingMnemonicId, setUseExistingMnemonicId] = useState<string>("");

  // Import phrase
  const [importPhrase, setImportPhrase] = useState("");

  // Import key
  const [secretKey, setSecretKey] = useState("");

  if (!open) return null;

  const reset = () => {
    setName("");
    setError(null);
    setBusy(false);
    setCreateStep("name");
    setGeneratedMnemonic("");
    setBackedUp(false);
    setUseExistingMnemonicId("");
    setImportPhrase("");
    setSecretKey("");
    setTab("create");
  };

  const close = () => {
    reset();
    onClose();
  };

  // ── Create flow ────────────────────────────────────────────

  const handleCreateGenerate = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }
    if (useExistingMnemonicId) {
      // Derive next index from existing mnemonic — no phrase to display.
      setBusy(true);
      try {
        await addAccountFromMnemonic(name.trim(), useExistingMnemonicId);
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to derive account");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!hasPassword) {
      setError("Set a password in Settings before creating a recovery phrase");
      return;
    }
    setBusy(true);
    try {
      const { mnemonic } = await createMnemonicAccount(name.trim());
      setGeneratedMnemonic(mnemonic);
      setCreateStep("show");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  };

  const handleShowContinue = () => {
    if (!backedUp) {
      setError("Confirm you've written down your recovery phrase");
      return;
    }
    close();
  };

  // ── Import phrase ──────────────────────────────────────────

  const handleImportPhrase = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }
    if (!hasPassword) {
      setError("Set a password in Settings before importing a recovery phrase");
      return;
    }
    setBusy(true);
    try {
      await importMnemonicAccount(name.trim(), importPhrase);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import recovery phrase");
    } finally {
      setBusy(false);
    }
  };

  // ── Import key (legacy) ────────────────────────────────────

  const handleImportKey = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }
    if (!secretKey.trim() || secretKey.trim().length < 64) {
      setError("Please enter a valid secret key (hex)");
      return;
    }
    setBusy(true);
    try {
      const acc = await importAccount(name.trim(), secretKey.trim());
      await addAccount(acc);
      close();
    } catch {
      setError("Invalid secret key");
    } finally {
      setBusy(false);
    }
  };

  const handleLegacyCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Please enter an account name");
      return;
    }
    setBusy(true);
    try {
      const acc = await createAccount(name.trim());
      await addAccount(acc);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  const Tabs = (
    <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-5">
      <button
        onClick={() => { setTab("create"); setError(null); }}
        className={`flex-1 py-2 text-xs rounded-md font-medium transition-colors ${
          tab === "create" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
        }`}
      >
        Create
      </button>
      <button
        onClick={() => { setTab("import-phrase"); setError(null); }}
        className={`flex-1 py-2 text-xs rounded-md font-medium transition-colors ${
          tab === "import-phrase" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
        }`}
      >
        Import Phrase
      </button>
      <button
        onClick={() => { setTab("import-key"); setError(null); }}
        className={`flex-1 py-2 text-xs rounded-md font-medium transition-colors ${
          tab === "import-key" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
        }`}
      >
        Import Key
      </button>
    </div>
  );

  const NameInput = (
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
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-200">
            {createStep === "show" ? "Recovery Phrase" : "Add Account"}
          </h2>
          <button
            onClick={close}
            className="text-gray-500 hover:text-gray-300"
            disabled={busy}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {createStep === "name" && Tabs}

        {/* ── Create tab: name step ────────────────────────────── */}
        {tab === "create" && createStep === "name" && (
          <div className="space-y-4">
            {NameInput}

            {mnemonics.length > 0 && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Source</label>
                <select
                  value={useExistingMnemonicId}
                  onChange={(e) => setUseExistingMnemonicId(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="">New recovery phrase</option>
                  {mnemonics.map((m) => (
                    <option key={m.id} value={m.id}>Next account from "{m.label}"</option>
                  ))}
                </select>
              </div>
            )}

            {!hasPassword && !useExistingMnemonicId && (
              <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
                A wallet password is required to create a recovery phrase. Set one in Settings, or use "Import Key" to import an existing private key without a password.
              </div>
            )}

            {error && <div className="text-sm text-red-400">{error}</div>}

            <button
              onClick={handleCreateGenerate}
              disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {busy ? "Working…" :
                useExistingMnemonicId ? "Derive Next Account" : "Generate Recovery Phrase"}
            </button>

            {!useExistingMnemonicId && (
              <button
                onClick={handleLegacyCreate}
                disabled={busy}
                className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Or create a one-off random account (no recovery phrase)
              </button>
            )}
          </div>
        )}

        {/* ── Create tab: show mnemonic step ────────────────── */}
        {tab === "create" && createStep === "show" && (
          <div className="space-y-4">
            <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
              Write these 24 words down on paper, in order. Anyone with this phrase can spend your funds — it cannot be recovered if lost.
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 grid grid-cols-3 gap-2 text-sm font-mono">
              {generatedMnemonic.split(" ").map((word, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span className="text-gray-600 text-xs w-6 text-right">{i + 1}.</span>
                  <span className="text-gray-200">{word}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigator.clipboard.writeText(generatedMnemonic)}
              className="w-full text-xs text-gray-400 hover:text-gray-200 transition-colors py-1"
            >
              Copy to clipboard (use only on a trusted device)
            </button>

            <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={backedUp}
                onChange={(e) => { setBackedUp(e.target.checked); setError(null); }}
                className="mt-0.5"
              />
              <span>I've written down my recovery phrase and stored it safely.</span>
            </label>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <button
              onClick={handleShowContinue}
              disabled={!backedUp}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Import Phrase tab ────────────────────────────────── */}
        {tab === "import-phrase" && createStep === "name" && (
          <div className="space-y-4">
            {NameInput}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Recovery Phrase</label>
              <textarea
                value={importPhrase}
                onChange={(e) => { setImportPhrase(e.target.value); setError(null); }}
                placeholder="Paste your 12 or 24 word recovery phrase, separated by spaces"
                rows={4}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 font-mono resize-none"
              />
            </div>

            {!hasPassword && (
              <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
                A wallet password is required to import a recovery phrase. Set one in Settings first.
              </div>
            )}

            {error && <div className="text-sm text-red-400">{error}</div>}

            <button
              onClick={handleImportPhrase}
              disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {busy ? "Importing…" : "Import Account"}
            </button>
          </div>
        )}

        {/* ── Import Key tab (legacy) ───────────────────────── */}
        {tab === "import-key" && createStep === "name" && (
          <div className="space-y-4">
            {NameInput}

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

            <div className="text-xs text-gray-500">
              Imported private keys can't be recovered from a phrase. Consider creating a recovery phrase and transferring funds.
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <button
              onClick={handleImportKey}
              disabled={busy}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {busy ? "Importing…" : "Import Account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
