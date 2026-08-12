# Security and Privacy

Verified Milestone Close is an independent, unaudited prototype built for Arc Testnet. Do not use it with production funds.

## Current product boundary

The current product is the `PolicySettlementV1` programmable-settlement reference implementation plus the receipt-first Verified Milestone Close workbench. A policy binds payer, recipient, reviewer, cap, milestone, version, expiry and attestation TTL. Approval and settlement are fail-closed on policy, signature, nonce, allowance, cap and expiry checks. A successful chain receipt is necessary for downstream accounting consideration, but never proves ERP posting or business close.

The public workbench embeds privacy-safe, read-only ERP evidence for one verified supplier-payable example: Purchase Invoice, submitted Payment Entry, reconciled Bank Transaction and balanced GL readback. Payment Ledger, Accounting Period, Period Closing Voucher and business close remain explicitly unproven. The workbench has no ERP credentials and performs no ERP mutation.

Supplier/customer refund, late-entry, replacement, revoke and reversal behavior in the workbench is a deterministic local accounting/control projection. It preserves prior observations, rejects conflicting retries and invalidates downstream consequences when required. It is not an autonomous on-chain refund implementation and does not sign, broadcast or move funds.

## Historical support contract

The earlier deployed Solidity demonstration remains named `ArcPaymentReceipt`. The immutable-merchant and no-refund statements below apply only to that historical support contract, not to the current `PolicySettlementV1` product boundary.

## Public data

`orderId`, `metadataHash`, payer, merchant, amount, block number, and the emitted event are public forever. Use opaque random order identifiers. Hash only non-sensitive canonical metadata. Do not encode customer names, email addresses, shipping addresses, invoice text, account identifiers, or reversible personal data.

## Historical `ArcPaymentReceipt` contract boundary

The contract immediately forwards the full value to an immutable merchant. It has no owner, withdrawal function, upgrade path, refund flow, dispute resolution, or retained balance by design. A failed settlement reverts the whole transaction.

## Service boundary

The included service is read-only by default. It exposes generated evidence and exact receipt lookups, rejects non-GET methods except two explicitly bounded POST routes, and contains no signer, wallet, API key, enabled webhook, database, or ERP state-changing route. The Circle webhook is deliberately disabled by default; the opening-balance fixture validator is ephemeral and never persists or posts.

`POST /api/v1/circle-webhook` returns `503` unless a separately supplied Circle ECDSA verification key, durable queue, durable idempotency store, and explicit Circle subscription are all present. It verifies `X-Circle-Signature` before accepting an exact Arc registry event, uses the notification ID for idempotency, and never signs, broadcasts, creates an ERP document, or self-enables a Circle resource.

`POST /api/v1/opening-balance-fixture-validate` accepts only an in-memory fixture for fail-closed validation. It never persists a fixture, writes ERP, signs or broadcasts a transaction, or represents a live opening-balance posting.

## Known limitations

- Source verification is not an independent audit.
- The demonstration uses the same EOA as payer and merchant.
- Circle monitoring started after the demonstrated payment, so historical backfill is not claimed.
- Production use requires an independent audit, separate payer/merchant testing, operational monitoring, privacy review, and explicit refund/dispute design.
