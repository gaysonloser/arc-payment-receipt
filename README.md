# Payment Receipt

<img src="assets/payment-receipt-logo.png" width="120" alt="Payment Receipt logo">

Payment Receipt is an independent DeFi prototype built on Arc Testnet. Its verified Solidity contract remains named `ArcPaymentReceipt`. A payment atomically settles native test USDC to an immutable merchant, stores an opaque order receipt, and emits a structured `PaymentReceived` event for reconciliation. Circle Contracts and Event Monitor are used for read-only contract and event operations.

**Live demo:** [arc-payment-receipt.onrender.com](https://arc-payment-receipt.onrender.com/)

The demo runs as a free Render web service. It may take 50 seconds or more to wake after a period of inactivity.

## Arc Lab Enterprise OS E1

This service is also the only planned public Arc runtime for **CATVERSE Twin-Ledger Enterprise Finance OS -- AOXPET Arc Lab**. The E1 upgrade adds a read-only enterprise shell inside the existing `arc-payment-receipt` Render service; it does not create a second Arc web service.

Payment Receipt is now positioned as the D09 treasury and payment component. It is not the umbrella for the enterprise portfolio. The Arc Lab namespace is `ARC-LAB-*`, target company is `AOXPET Arc Lab / AAL / USD`, and the public shell keeps Base runtime, ERP company, credentials, events, queues, and evidence isolated.

The Arc Lab hero is procurement and manufacturing settlement control: supplier milestones, quality hold/release, cost residual boundaries, inventory read-only verification, and close/report impact. The payment receipt contract remains useful because cash settlement is one component of that operating system.

E1 exposes only sanitized GET/HEAD routes:

- `GET /arc-lab`
- `GET /enterprise-os`
- `GET /healthz`
- `GET /api/arc-lab-portfolio`
- `GET /api/v1/topology`
- `GET /api/v1/evidence`
- `GET /api/v1/erp-interaction`
- `GET /api/v1/manufacturing-evidence`
- `GET /api/v1/manufacturing-progress`
- `GET /api/v1/wallet-capability`
- `GET /api/v1/w4-dual-source`
- `GET /api/v1/quality-release-evidence`
- `GET /api/v1/cross-system-manufacturing-reconciliation`
- `GET /api/v1/manufacturing-close-impact`
- `GET /api/v1/app-kit-boundary`
- `GET /api/v1/public-trace-trail`
- `GET /api/v1/circle-webhook-readiness`

E1 includes no ERP credential, ERP write, wallet connection, signer, database, chain transaction, webhook, or state-changing endpoint.

The sanitized ERP interaction route shows that the isolated AAL Company and dedicated draft-only identity have completed C0, while API credentials, master data, opening balances and business-document writes remain separately gated. It also exposes D09's read-only mapping across Payment Entry, Journal Entry, Bank Transaction, GL Entry and Payment Ledger Entry without publishing raw ERP payloads or identity values.

## Current Arc execution identity

The current wallet for future, explicitly confirmed Arc actions is **ARC** (`0x75F2c230F2bd6874306EA586f198a7D2f6CC7Cc6`) on Arc Testnet (`5042002`). It has been configured for the network and funded with 20 test USDC through the Circle faucet. This repository and the Render service remain read-only and never receive wallet credentials or signing authority.

Wallet migration does not rewrite chain history. `0x8aAa...8889` remains the historical Payment Receipt deployer and immutable merchant; `0x63cd...13DA` remains the historical P2 payer and Enterprise Evidence Registry deployer. ARC capability recovery is now independently verified through official Memo tx `0x5f89...0a18` and synthetic Payment Receipt canary tx `0xccb9...48cc`. The public route exposes only sanitized receipts and never exposes a signer or transaction executor.

## Enterprise OS overview

Arc Lab follows the CATVERSE Twin-Ledger standard:

```text
Arc / Circle evidence
  -> AAL Enterprise OS read-only control shell
  -> ERPNext authoritative Company, ledgers, close, reports and FP&A
```

GitHub is the engineering proof and technical source of truth. Render is the running proof for reviewers. ERPNext is the business proof, but only after a separately approved isolated AAL Company exists. This repository must not publish ERP credentials, raw ERP payloads, wallet material, local absolute paths, or unsanitized logs.

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
- A grouped Enterprise Event Envelope audit for identity, business reference, evidence, workflow, accounting, and control ownership.
- A deterministic, unsigned Settlement Evidence Manifest with offline content-integrity verification.
- A four-source freshness control for Arc RPC, Circle, dual-source, and enterprise snapshots.
- A fail-closed Settlement Readiness Gate that separates technical settlement evidence from ERP draft handoff and accounting posting authority.
- A bounded Settlement Review Packet that combines evidence integrity, freshness, accounting totals, unresolved owner decisions, and a reviewer checklist without exposing raw ERP payloads.
- A SettlementEvent handoff-contract validator that verifies Arc identity, amount/fee candidate preservation, finality, non-posting controls, and schema-owner gaps.
- A read-only AOXPET Arc Lab Enterprise OS shell that frames the payment component inside 14-domain procurement, manufacturing, inventory, assets, projects, treasury, financing, accounting, close, FP&A, and human-gate controls.
- A manufacturing evidence view that shows accepted quality inspection, submitted manufacture, `25 @ 20.00 USD` ERP valuation and five SLE facts, with the sequence `QUALITY_HOLD -> QUALITY_RELEASE -> MANUFACTURE_COMPLETED` anchored on Arc Testnet. ERP SLE, valuation, repost and GL remain the inventory-cost authority.
- A Close/FP&A impact view that derives `500.00 USD` finished-goods stock value, five SLE facts and same-stock-account `net GL entries = 0` from the reconciled manufacturing evidence. It is read-only evidence, not an ERP close, posting, payment or cost-calculation claim.
- A read-only wallet-capability view for the confirmed Arc Memo and Payment Receipt canary, with replay disabled and Circle freshness shown separately.
- A W4-specific Circle Event Monitor / Arc RPC alignment artifact with seven checks passed and no unmatched event; this does not claim a new full-history RPC rescan.
- A source-separated public delivery trail that distinguishes Arc evidence controls, ERP readback, Circle/RPC overlap, Git source and Render runtime. It excludes local checks, unsigned actions, duplicated facts and activity-only records.

## Verified evidence

- Contract: [`0x05fd...E1Df`](https://testnet.arcscan.app/address/0x05fd366E0F1Af3C5DCDCdC88ED8824bbf175E1Df)
- Deployment: [`0xa880...fab1`](https://testnet.arcscan.app/tx/0xa8800b86a2d476aabc23d79cd2e7fa6b4a89ef425a594d072341304fa8c5fab1)
- P1 test payment: [`0x56b6...0fdbf`](https://testnet.arcscan.app/tx/0x56b64a6a56209b2a82b170c6b1ea6ca5c8114d122488957f91b13cd40c00fdbf)
- P2 segregated-payer payment: [`0x1837...8fe6`](https://testnet.arcscan.app/tx/0x18379c57f2499a1846ef56623286596bca5424b2b11f3d494afb335a0d868fe6)
- Circle contract state: `COMPLETE / VERIFIED`
- Circle monitor state: historical `PaymentReceived / Subscribed` evidence remains source-separated; the current `ArcEnterpriseEvidenceRegistryV2` import is `Complete` with no event subscription because Circle Console requires an active webhook.
- Manufacturing completion anchor: [`0xc9f5...2cfe`](https://testnet.arcscan.app/tx/0xc9f58ce2662d23dd08906bcceaadd4c90ba70914edee2da4a33668c666932cfe), registry `0x094f...a1e7`, zero value, state `MANUFACTURE_COMPLETED`.
- Arc RPC coverage: deployment block `52,159,957` through observed block `52,895,762`
- Current overlap state: `1 RPC / 1 Circle / aligned_in_overlap_window`
- Settlement Evidence Manifest SHA-256: `ca93a6e741a0ca55ea85cffda9e12b8e6f06f90c506a79f312c0171204c470e9`

## Architecture

1. The payer calls `pay(orderId, metadataHash)` with native Arc Testnet USDC.
2. The contract records payer, amount, metadata hash, and block number.
3. The same transaction forwards the full payment value to the merchant.
4. `PaymentReceived` becomes the common reconciliation event for Arc RPC and Circle Contracts.
5. The backend scans the full configured Arc RPC range, then separates pre-monitor history from the common Circle/RPC coverage window.
6. A synthetic ERP candidate maps the P2 event into a draft-only receipt and balanced journal preview.
7. The Enterprise Event Envelope makes unresolved enterprise-owner fields and control boundaries explicit.
8. The Settlement Evidence Manifest canonicalizes a bounded evidence payload and computes a reproducible SHA-256 content digest.
9. The freshness control classifies each evidence source as fresh, aging, stale, or invalid; dual-source age uses the older source snapshot, and timestamps beyond the clock-skew tolerance fail closed.
10. The Settlement Readiness Gate requires finalized settlement, source assurance, reconciliation, balanced accounting, fail-closed exceptions, fresh evidence, and a complete enterprise owner contract before allowing non-posting review.
11. The SettlementEvent validator checks the chain-owned handoff fields while keeping unresolved enterprise fields under the external schema owner's authority.
12. The Review Packet fails closed unless the Manifest, Readiness Gate, and handoff contract all permit non-posting human review.
13. The AAL shell frames the payment component inside 14-domain enterprise controls, with procurement, manufacturing, inventory, assets, projects, treasury, financing, accounting, close, FP&A, and human gates separated.
14. The backend serves generated evidence and exact receipt lookups; it accepts no writes.

See [Architecture](docs/ARCHITECTURE.md), [Security and privacy](SECURITY.md), and the [three-minute demo script](docs/DEMO_SCRIPT.md).
See [Interaction Trail](docs/INTERACTION_TRAIL.md) for how Arc House, Arc Testnet, Circle Console, Render, and ERPNext are kept separate but connected.

## 14-domain and C0-C7 status

Current Arc Lab status is truthful and partial:

- Implemented locally: D03 Order-to-Cash through D14 Governance and Human Gates, including D09's read-only ERP reconciliation mapping.
- In progress: D01 Company Configuration. The isolated `AOXPET Arc Lab / AAL / USD` Company and dedicated draft-only identity exist, while credentials and master data remain separately gated.
- Blocked with packet: D02 Opening Balances. No C1 opening balance or ERP business document has been written.

Existing ERPNext drafts `ACC-JV-2026-00006` and `ACC-PAY-2026-00002` are historical shared-sandbox draft-only evidence. They are not AAL Company proof and must not be migrated into Arc Lab claims.

## Claim matrix

| Claim | Status | Boundary |
| --- | --- | --- |
| Existing Payment Receipt contract and read-only evidence API | live | Arc Testnet and public Render component |
| AAL Enterprise OS shell | live candidate | E1 read-only only; no ERP credential or write |
| Procurement/manufacturing/cost-control domain model | local proof | fixtures and controls only |
| AAL ERPNext Company and dedicated draft-only identity | C0 complete | no public identity value, API credential, master data, opening balance or business document |
| AAL ledgers, close and reports | unverified | C1 and later stages remain separately gated |
| Wallet, chain transaction or contract deploy authority | not present | always action-time confirmation |
| Current execution identity | configured | ARC `0x75F2...7Cc6`; public metadata only, no signer |

## Cost, cold start and rollback

The intended public runtime is the existing Render Free service. Cold starts are expected after inactivity. Paid upgrades are not authorized by this repository.

Rollback options:

- Use Render previous deploy rollback for `arc-payment-receipt`.
- Revert the E1 release candidate and redeploy the previous healthy commit.
- Accept deployment only when both `/api/health` and `/healthz` return `200`.

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

Export or verify the unsigned evidence manifest offline:

```bash
node tools/arc_settlement_evidence_manifest.mjs
node tools/arc_settlement_evidence_manifest.mjs --verify outputs/ArcPaymentReceipt_settlement_evidence_manifest_latest.json
```

The Node suite covers event decoding, overlap-window reconciliation, missing-event alerts, the read-only API, fail-closed enterprise controls, payload minimization, journal balance, accounting precision rejection, manifest verification, SettlementEvent contract validation, and the bounded Review Packet. The Foundry suite covers payment settlement, receipt storage, duplicate protection, rollback, and Arc Testnet fork behavior.

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
- `GET /api/enterprise-envelope`
- `GET /api/evidence-manifest`
- `GET /api/evidence-freshness`
- `GET /api/settlement-readiness`
- `GET /api/settlement-review-packet`
- `GET /api/settlement-event-contract`
- `GET /api/receipts/:orderId`
- `GET /arc-lab`
- `GET /enterprise-os`
- `GET /healthz`
- `GET /api/arc-lab-portfolio`
- `GET /api/v1/topology`
- `GET /api/v1/evidence`
- `GET /api/v1/erp-interaction`
- `GET /api/v1/manufacturing-evidence`
- `GET /api/v1/manufacturing-progress`
- `GET /api/v1/quality-release-evidence`
- `GET /api/v1/cross-system-manufacturing-reconciliation`
- `GET /api/v1/manufacturing-close-impact`
- `GET /api/v1/wallet-capability`
- `GET /api/v1/w4-dual-source`
- `GET /api/v1/app-kit-boundary`
- `GET /api/v1/public-trace-trail`
- `GET /api/v1/circle-webhook-readiness`

All other paths or write methods return explicit errors. The service has no signer, wallet connection, API key, webhook receiver, database, or state-changing endpoint. The webhook-readiness route is a public, fail-closed boundary: it documents the exact Arc registry event and the missing durable-queue prerequisite, but it cannot receive a notification, create a Circle subscription, or write to ERP.

## Safety and limitations

- Testnet prototype, not independently audited and not for production funds.
- `verified` does not mean `audited`.
- P1 uses the merchant EOA as payer; P2 uses a separate self-controlled test payer. Neither proves independent customer adoption.
- `orderId` and `metadataHash` are public forever and must not contain personal or reversible customer data.
- ERP receipt and journal fields are synthetic dry-run candidates only. They are non-posting, require human review, and make no accounting-recognition claim.
- The manifest digest verifies only the integrity of its canonicalized content. It is unsigned and does not prove source truth, signer identity, attestation, or an accounting record.
- Evidence freshness measures snapshot age only. It does not verify source truth, authorize ERP handoff, or establish accounting recognition.
- Even a fully passing Settlement Readiness Gate can allow only human-reviewed, non-posting draft handoff. It never authorizes ERP API execution or accounting posting.
- The SettlementEvent validator is a read-only contract snapshot, not the canonical enterprise schema owner. Atomic amount and fee candidates remain unpromoted until the external owner resolves the serialization contract.
- The Review Packet is neither an attestation nor an accounting record and contains no raw ERP payload.
- The contract does not implement refunds, disputes, tax documents, identity, access control, or upgradeability.
- Circle history begins after the demonstrated P1 event; pre-monitor backfill is not claimed.
- No persistent Circle API key, Entity Secret, Circle Wallet, webhook, or autonomous signer is used.

## License

MIT. The local Solidity source declares SPDX `MIT`. Explorer license metadata is separate and is not represented here as corrected.
