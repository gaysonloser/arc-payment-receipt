# Payment Receipt

<img src="assets/payment-receipt-logo.png" width="120" alt="Payment Receipt logo">

Payment Receipt is an independent DeFi prototype built on Arc Testnet. Its verified Solidity contract remains named `ArcPaymentReceipt`. A payment atomically settles native test USDC to an immutable merchant, stores an opaque order receipt, and emits a structured `PaymentReceived` event for reconciliation. Circle Contracts and Event Monitor are used for read-only contract and event operations.

**Live demo:** [arc-payment-receipt.onrender.com](https://arc-payment-receipt.onrender.com/)

The demo runs as a free Render web service. It may take 50 seconds or more to wake after a period of inactivity.

## Why it exists

Stablecoin settlement alone does not give an application a privacy-aware order reference, a durable receipt record, or a clean reconciliation surface. This prototype keeps custody out of the contract while making settlement evidence independently verifiable.

## What is implemented

- Native Arc Testnet USDC payment with no ERC-20 approval.
- Immediate settlement to an immutable merchant; contract balance returns to zero.
- Opaque `orderId` and `metadataHash` receipt storage.
- Duplicate-order protection and full transaction rollback on settlement failure.
- Verified source code and ABI on Arcscan.
- Read-only RPC monitor that reconciles events with receipt storage.
- Read-only frontend and backend receipt query.
- Circle Contracts import of the verified Arc contract.
- Circle `PaymentReceived` Event Monitor and overlap-window comparison with Arc RPC.
- A two-receipt settlement ledger that distinguishes P1 pre-monitor history from the P2 Circle/RPC overlap window.
- A synthetic, non-posting ERP reconciliation candidate with fail-closed exception controls.
- A read-only accounting preview with independently recomputed debit/credit balance and unresolved schema fields.

## Verified evidence

- Contract: [`0x05fd...E1Df`](https://testnet.arcscan.app/address/0x05fd366E0F1Af3C5DCDCdC88ED8824bbf175E1Df)
- Deployment: [`0xa880...fab1`](https://testnet.arcscan.app/tx/0xa8800b86a2d476aabc23d79cd2e7fa6b4a89ef425a594d072341304fa8c5fab1)
- P1 test payment: [`0x56b6...0fdbf`](https://testnet.arcscan.app/tx/0x56b64a6a56209b2a82b170c6b1ea6ca5c8114d122488957f91b13cd40c00fdbf)
- P2 segregated-payer payment: [`0x1837...8fe6`](https://testnet.arcscan.app/tx/0x18379c57f2499a1846ef56623286596bca5424b2b11f3d494afb335a0d868fe6)
- Circle contract state: `COMPLETE / VERIFIED`
- Circle monitor state: `PaymentReceived / Subscribed`
- Current overlap state: `1 RPC / 1 Circle / aligned_in_overlap_window`

## Architecture

1. The payer calls `pay(orderId, metadataHash)` with native Arc Testnet USDC.
2. The contract records payer, amount, metadata hash, and block number.
3. The same transaction forwards the full payment value to the merchant.
4. `PaymentReceived` becomes the common reconciliation event for Arc RPC and Circle Contracts.
5. The backend separates pre-monitor history from the common Circle/RPC coverage window.
6. A synthetic ERP candidate maps the P2 event into a draft-only receipt and balanced journal preview.
7. The backend serves generated evidence and exact receipt lookups; it accepts no writes.

See [Architecture](docs/ARCHITECTURE.md), [Security and privacy](SECURITY.md), and the [three-minute demo script](docs/DEMO_SCRIPT.md).

## Run locally

Requires Node.js 22 or later. No package installation, wallet, API key, or environment secret is required.

```bash
npm start
```

Open `http://127.0.0.1:8774/`. The server defaults to local-only binding. Hosted environments can provide `HOST=0.0.0.0` and their assigned `PORT`.

## Test

```bash
npm test
forge test -vv
```

The Node suite covers event decoding, overlap-window reconciliation, missing-event alerts, the read-only API, fail-closed enterprise controls, payload minimization, journal balance, and accounting precision rejection. The Foundry suite covers payment settlement, receipt storage, duplicate protection, rollback, and Arc Testnet fork behavior.

## Read-only API

- `GET /api/health`
- `GET /api/evidence`
- `GET /api/dual-source`
- `GET /api/circle-monitor`
- `GET /api/enterprise-settlement`
- `GET /api/enterprise-settlements/:orderId`
- `GET /api/enterprise-controls`
- `GET /api/settlement-ledger`
- `GET /api/accounting-preview`
- `GET /api/receipts/:orderId`

All other paths or write methods return explicit errors. The service has no signer, wallet connection, API key, webhook, database, or state-changing endpoint.

## Safety and limitations

- Testnet prototype, not independently audited and not for production funds.
- `verified` does not mean `audited`.
- P1 uses the merchant EOA as payer; P2 uses a separate self-controlled test payer. Neither proves independent customer adoption.
- `orderId` and `metadataHash` are public forever and must not contain personal or reversible customer data.
- ERP receipt and journal fields are synthetic dry-run candidates only. They are non-posting, require human review, and make no accounting-recognition claim.
- The contract does not implement refunds, disputes, tax documents, identity, access control, or upgradeability.
- Circle history begins after the demonstrated P1 event; pre-monitor backfill is not claimed.
- No persistent Circle API key, Entity Secret, Circle Wallet, webhook, or autonomous signer is used.

## License

MIT. The local Solidity source declares SPDX `MIT`. Explorer license metadata is separate and is not represented here as corrected.
