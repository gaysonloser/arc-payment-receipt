# Verified Milestone Close · Architecture

```text
Supplier payable / customer receipt-refund
  | canonical case + source voucher + policy identity
  v
PolicySettlementV1 / programmable money boundary
  | policy + attestation + unsigned review (no signer/broadcast)
  v
Receipt-first matcher
  | SettlementExecuted + ERC-20 Transfer + Arc system Transfer
  | finality / TTL / replay / reorg / amount / party checks
  v
Typed ERP truth boundary
  | Invoice -> Payment Entry -> Bank Transaction -> GL/PLED -> close readbacks
  | proposals are local/docstatus=0; no direct posting or business close
  v
Render `/current-mvp/` read-only workbench

Historical/support lineage (not current product):
  ArcPaymentReceipt / PaymentReceived and the Arc Lab E1 shell
```

## Reconciliation model

The current matcher consumes a receipt only after the three independent records
are correlated and the case/source/party/registry identities agree. Missing,
stale, replayed, replaced or reorged evidence stays OPEN with zero consequence.
The historical ArcPaymentReceipt monitor still decodes `PaymentReceived`; that
lineage is kept separate and cannot satisfy a current PolicySettlementV1 gate.

The public Circle fixture is intentionally sanitized. It preserves the network, contract, event signature, subscription state, creation time, event history, and webhook boundary while omitting account-scoped Circle resource identifiers.

## Enterprise OS boundary

The historical Arc Lab shell does not make Arc House, Circle Console, Render, or ERPNext interchangeable:

- Arc House is community and review context.
- Arc Testnet is the chain fact layer.
- Circle Console is source assurance for contract events.
- Render is a read-only presentation layer.
- ERPNext is the business-proof authority for typed readbacks, while the current workbench remains read-only.

E1 contains no ERP credential, ERP write, wallet connection, signer, database, chain transaction, enabled webhook, or Circle subscription. A disabled ingress route exists only to fail closed until a separately provisioned signature key, durable queue, idempotency store, and Circle subscription are available.

## Failure semantics

- Zero-value payments revert.
- Reused order IDs revert.
- Merchant settlement failure reverts the entire transaction, including receipt storage and event emission.
- The current API rejects write methods and does not initiate chain activity; the two POST routes are explicitly fail-closed and never persist or post.
