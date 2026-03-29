import { useState } from "react";
import { WalletProvider, useWallet } from "./lib/context";
import { Header } from "./components/Header";
import { BalanceCard } from "./components/BalanceCard";
import { SendForm } from "./components/SendForm";
import { FaucetCard } from "./components/FaucetCard";
import { TransactionHistory } from "./components/TransactionHistory";
import { AccountDetails } from "./components/AccountDetails";
import { CreateAccountModal } from "./components/CreateAccountModal";

function WalletDashboard() {
  const { activeAccount, accounts } = useWallet();
  const [showCreate, setShowCreate] = useState(false);

  if (accounts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-200 mb-2">Welcome to Solen Wallet</h2>
          <p className="text-gray-400 mb-6">
            Create a new account or import an existing one to get started.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Get Started
          </button>
          <CreateAccountModal open={showCreate} onClose={() => setShowCreate(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-200">
          {activeAccount?.name || "Dashboard"}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          + Add Account
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <BalanceCard />
          <SendForm />
        </div>
        <div className="space-y-6">
          <FaucetCard />
          <AccountDetails />
        </div>
      </div>

      <TransactionHistory />

      <CreateAccountModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-gray-950">
        <Header />
        <WalletDashboard />
      </div>
    </WalletProvider>
  );
}
