import { useState } from "react";
import { useWallet } from "../lib/context";

export function AccountDetails() {
  const { activeAccount, removeAccount, network } = useWallet();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  if (!activeAccount) return null;

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyIcon = ({ label }: { label: string }) =>
    copied === label ? (
      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );

  return (
    <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-200">Account Details</h3>
        <button
          onClick={() => setShowPrintPreview(true)}
          title="Print / Save as PDF"
          className="flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Backup
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">Account ID</div>
          <div className="flex items-center gap-2">
            <code className="text-sm text-gray-300 font-mono break-all flex-1">
              {activeAccount.accountId}
            </code>
            <button
              onClick={() => copyToClipboard(activeAccount.accountId, "id")}
              className="text-gray-500 hover:text-gray-300 shrink-0"
            >
              <CopyIcon label="id" />
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Public Key</div>
          <div className="flex items-center gap-2">
            <code className="text-sm text-gray-300 font-mono break-all flex-1">
              {activeAccount.publicKey}
            </code>
            <button
              onClick={() => copyToClipboard(activeAccount.publicKey, "pub")}
              className="text-gray-500 hover:text-gray-300 shrink-0"
            >
              <CopyIcon label="pub" />
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">Secret Key</span>
            <button
              onClick={() => setShowKey(!showKey)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          {showKey && (
            <div className="flex items-center gap-2">
              <code className="text-sm text-red-400 font-mono break-all flex-1">
                {activeAccount.secretKey.slice(0, 64)}
              </code>
              <button
                onClick={() => copyToClipboard(activeAccount.secretKey.slice(0, 64), "sec")}
                className="text-gray-500 hover:text-gray-300 shrink-0"
              >
                <CopyIcon label="sec" />
              </button>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-gray-700/50">
          <button
            onClick={() => setShowRemoveConfirm(true)}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Remove Account
          </button>
        </div>
      </div>

      {showRemoveConfirm && (
        <RemoveAccountModal
          accountName={activeAccount.name}
          onConfirm={() => {
            setShowRemoveConfirm(false);
            removeAccount(activeAccount.accountId);
          }}
          onCancel={() => setShowRemoveConfirm(false)}
        />
      )}

      {showPrintPreview && (
        <PrintPreviewModal
          account={activeAccount}
          network={network}
          onClose={() => setShowPrintPreview(false)}
        />
      )}
    </div>
  );
}

function RemoveAccountModal({
  accountName,
  onConfirm,
  onCancel,
}: {
  accountName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-200">Remove Account</h3>
        </div>

        <p className="text-sm text-gray-400 mb-2">
          Are you sure you want to remove <span className="text-gray-200 font-medium">"{accountName}"</span>?
        </p>
        <p className="text-sm text-red-400 mb-6">
          This action cannot be undone. Make sure you have backed up your secret key before removing this account.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors"
          >
            Remove Account
          </button>
        </div>
      </div>
    </div>
  );
}

function PrintPreviewModal({
  account,
  network,
  onClose,
}: {
  account: { name: string; accountId: string; publicKey: string; secretKey: string };
  network: string;
  onClose: () => void;
}) {
  const now = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200">Account Backup</h3>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 p-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6">
          {/* Preview — also used as print content */}
          <div className="print-content bg-white text-gray-900 rounded-xl p-8 shadow-inner text-sm">
            <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-emerald-500">
              <div>
                <div className="text-xl font-bold">
                  <span className="text-emerald-600">Solen</span>
                  <span className="text-gray-400"> Wallet</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">Account Backup &middot; {now}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Account Name</div>
                <div className="font-mono text-xs bg-gray-100 px-3 py-2 rounded border border-gray-200">{account.name}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Network</div>
                <div className="font-mono text-xs bg-gray-100 px-3 py-2 rounded border border-gray-200 capitalize">{network}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Account ID</div>
                <div className="font-mono text-xs bg-gray-100 px-3 py-2 rounded border border-gray-200 break-all">{account.accountId}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Public Key</div>
                <div className="font-mono text-xs bg-gray-100 px-3 py-2 rounded border border-gray-200 break-all">{account.publicKey}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Secret Key (Private)</div>
                <div className="font-mono text-xs bg-red-50 px-3 py-2 rounded border border-red-200 text-red-700 break-all">{account.secretKey.slice(0, 64)}</div>
              </div>

              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-[11px] text-yellow-800">
                <strong>KEEP THIS DOCUMENT SAFE.</strong> Anyone with your secret key has full control of your account. Store securely and do not share.
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-gray-200 flex justify-between text-[10px] text-gray-400">
              <span>Solen Blockchain &middot; solenchain.io</span>
              <span>Solen Wallet v0.1.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildPrintHtml(
  account: { name: string; accountId: string; publicKey: string; secretKey: string },
  network: string,
  now: string,
): string {
  return `<!DOCTYPE html>
<html>
<head>
<title>Solen Wallet - ${account.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 48px; color: #1a1a2e; background: #fff; }
  .header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #10b981; }
  .logo { font-size: 24px; font-weight: 700; }
  .logo .g { color: #10b981; }
  .logo .w { color: #666; font-weight: 400; }
  .sub { font-size: 12px; color: #888; margin-top: 4px; }
  .s { margin-bottom: 24px; }
  .st { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
  .v { font-family: "SF Mono", "Fira Code", Consolas, monospace; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px 12px; border-radius: 6px; border: 1px solid #e0e0e0; }
  .sec { background: #fff5f5; border-color: #fecaca; color: #b91c1c; }
  .warn { margin-top: 32px; padding: 12px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 11px; color: #92400e; }
  .ft { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 10px; color: #aaa; display: flex; justify-content: space-between; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
  <div class="header"><div class="logo"><span class="g">Solen</span><span class="w"> Wallet</span></div><div class="sub">Account Backup &middot; ${now}</div></div>
  <div class="s"><div class="st">Account Name</div><div class="v">${account.name}</div></div>
  <div class="s"><div class="st">Network</div><div class="v">${network}</div></div>
  <div class="s"><div class="st">Account ID</div><div class="v">${account.accountId}</div></div>
  <div class="s"><div class="st">Public Key</div><div class="v">${account.publicKey}</div></div>
  <div class="s"><div class="st">Secret Key (Private)</div><div class="v sec">${account.secretKey.slice(0, 64)}</div></div>
  <div class="warn"><strong>KEEP THIS DOCUMENT SAFE.</strong> Anyone with your secret key has full control of your account. Store securely and do not share.</div>
  <div class="ft"><span>Solen Blockchain &middot; solenchain.io</span><span>Solen Wallet v0.1.0</span></div>
</body>
</html>`;
}
