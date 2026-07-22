# Architecture

```text
Payer
  | pay(orderId, metadataHash) + native test USDC
  v
ArcPaymentReceipt
  |-- store immutable receipt index
  |-- forward full value in the same transaction
  |-- emit PaymentReceived
  v
Merchant

PaymentReceived
  |-- Arc RPC monitor -> event/storage/receipt checks
  |-- Circle Event Monitor -> overlap-window comparison
  v
Read-only evidence API and viewer

AOXPET Arc Lab E1 shell
  |-- Render read-only Enterprise OS -> sanitized topology/evidence
  |-- ERPNext business proof -> future isolated AAL Company, drafts, ledgers, close and FP&A
  |-- Arc House / Hackathon -> community, review and contribution context
```

## Reconciliation model

The RPC monitor scans from the deployment block, decodes `PaymentReceived`, verifies transaction success, reads receipt storage, enforces unique order IDs, and confirms zero contract balance. The Circle comparison starts at the Circle monitor creation time; events before that boundary are reported separately instead of treated as missing.

The public Circle fixture is intentionally sanitized. It preserves the network, contract, event signature, subscription state, creation time, event history, and webhook boundary while omitting account-scoped Circle resource identifiers.

## Enterprise OS boundary

The AOXPET Arc Lab shell adds a portfolio view around the payment component. It does not make Arc House, Circle Console, Render, or ERPNext interchangeable:

- Arc House is community and review context.
- Arc Testnet is the chain fact layer.
- Circle Console is source assurance for contract events.
- Render is a read-only presentation layer.
- ERPNext is the future business-proof authority for the isolated AAL Company.

E1 contains no ERP credential, ERP write, wallet connection, signer, database, chain transaction, webhook, or state-changing endpoint.

## Failure semantics

- Zero-value payments revert.
- Reused order IDs revert.
- Merchant settlement failure reverts the entire transaction, including receipt storage and event emission.
- The API rejects write methods and does not initiate chain activity.
