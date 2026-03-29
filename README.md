# Solen Wallet

Cross-platform desktop wallet for the [Solen](../solen/) blockchain. Built with Tauri, React, and TypeScript — runs on Linux, macOS, and Windows from a single codebase.

## Features

- **Network switching** — Mainnet, Testnet, and Devnet with one click
- **Account management** — Create new Ed25519 keypairs or import existing ones
- **Balance display** — Auto-refreshes via `solen_getBalance` RPC
- **Send tokens** — Build, sign, and submit SOLEN transfer operations
- **Faucet** — Claim free tokens on Testnet/Devnet
- **Transaction history** — View past transactions from the explorer API
- **Account details** — View/copy public key, account ID, and secret key

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.78+ (for Tauri desktop builds)

### Linux (Ubuntu/Debian)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev
```

### macOS

Xcode Command Line Tools:

```bash
xcode-select --install
```

### Windows

[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (included in Windows 11).

## Getting Started

```bash
npm install
```

### Web Development

Run the frontend in the browser (no Tauri/Rust required):

```bash
npm run dev
```

Open http://localhost:1420

### Desktop App

```bash
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

Outputs platform-specific installers in `src-tauri/target/release/bundle/`.

## Network Configuration

| Network | RPC Port | Explorer API | Faucet Port |
|---------|----------|--------------|-------------|
| Mainnet | 9944     | 9955         | —           |
| Testnet | 19944    | 19955        | 19966       |
| Devnet  | 29944    | 29955        | 29966       |

All endpoints default to `127.0.0.1`. Update `src/lib/networks.ts` to point at remote nodes.

## Project Structure

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Dashboard layout
├── index.css                   # Tailwind styles
├── lib/
│   ├── networks.ts             # Network configs
│   ├── rpc.ts                  # JSON-RPC client
│   ├── wallet.ts               # Ed25519 key management
│   ├── faucet.ts               # Faucet API client
│   └── context.tsx             # React context for app state
└── components/
    ├── Header.tsx              # Top bar + network selector
    ├── NetworkSelector.tsx     # Mainnet/Testnet/Devnet tabs
    ├── AccountSelector.tsx     # Account dropdown
    ├── BalanceCard.tsx         # Balance display
    ├── SendForm.tsx            # Send SOLEN form
    ├── FaucetCard.tsx          # Faucet claim (Testnet/Devnet only)
    ├── TransactionHistory.tsx  # Transaction list
    ├── AccountDetails.tsx      # Key details + copy/remove
    └── CreateAccountModal.tsx  # Create/import account modal

src-tauri/                      # Tauri Rust backend
├── Cargo.toml
├── tauri.conf.json
└── src/
    ├── main.rs
    └── lib.rs
```

## Related Projects

- [solen](../solen/) — Solen blockchain node
- [solenscan](../solenscan/) — Block explorer

## License

ISC
