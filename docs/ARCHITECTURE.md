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
```

## Reconciliation model

The RPC monitor scans from the deployment block, decodes `PaymentReceived`, verifies transaction success, reads receipt storage, enforces unique order IDs, and confirms zero contract balance. The Circle comparison starts at the Circle monitor creation time; events before that boundary are reported separately instead of treated as missing.

The public Circle fixture is intentionally sanitized. It preserves the network, contract, event signature, subscription state, creation time, event history, and webhook boundary while omitting account-scoped Circle resource identifiers.

## Failure semantics

- Zero-value payments revert.
- Reused order IDs revert.
- Merchant settlement failure reverts the entire transaction, including receipt storage and event emission.
- The API rejects write methods and does not initiate chain activity.

