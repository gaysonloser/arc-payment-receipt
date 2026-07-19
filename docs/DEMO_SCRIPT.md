# Three-Minute Demo Script

## 0:00-0:25 - Problem

Arc uses USDC as its native value and gas token, but a merchant application still needs a durable order reference and a reconciliation trail. Payment Receipt provides that without retaining customer funds; its deployed Solidity contract remains named `ArcPaymentReceipt`.

## 0:25-0:55 - Contract

Show the verified Arcscan contract. Highlight the immutable merchant, `pay`, `receipts`, duplicate-order protection, and the `PaymentReceived` event. State clearly that this is a Testnet prototype and is not audited.

## 0:55-1:25 - Settlement

Open the P1 transaction. Show the `0.01 test USDC` call, successful status, receipt event, and zero contract balance. Explain that the value reaches the merchant in the same transaction.

## 1:25-2:05 - Receipt viewer

Query the opaque P1 order ID. Show payer, merchant, amount, metadata hash, block, gas, and the four passing integrity checks. Explain that the backend is read-only and rejects non-GET requests.

## 2:05-2:40 - Circle integration

Show that Circle imported the contract as verified and subscribed to `PaymentReceived`. Then show the dual-source panel: RPC history has one P1 event, but it occurred before the Circle monitor was created; the overlap window is `0 / 0` and aligned.

## 2:40-3:00 - Boundaries

State that no payment was repeated to manufacture a Circle log, no webhook or persistent API key remains, and no personal data belongs in order IDs or metadata hashes. Close with the production path: independent audit, real payer/merchant separation, refunds/disputes, and operational monitoring.
