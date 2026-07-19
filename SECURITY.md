# Security and Privacy

Payment Receipt is an independent, unaudited prototype built on Arc Testnet. The deployed Solidity contract remains named `ArcPaymentReceipt`. Do not use it with production funds.

## Public data

`orderId`, `metadataHash`, payer, merchant, amount, block number, and the emitted event are public forever. Use opaque random order identifiers. Hash only non-sensitive canonical metadata. Do not encode customer names, email addresses, shipping addresses, invoice text, account identifiers, or reversible personal data.

## Contract boundary

The contract immediately forwards the full value to an immutable merchant. It has no owner, withdrawal function, upgrade path, refund flow, dispute resolution, or retained balance by design. A failed settlement reverts the whole transaction.

## Service boundary

The included service is read-only. It exposes generated evidence and exact receipt lookups, rejects non-GET methods, and contains no signer, wallet, API key, webhook, database, or state-changing route.

## Known limitations

- Source verification is not an independent audit.
- The demonstration uses the same EOA as payer and merchant.
- Circle monitoring started after the demonstrated payment, so historical backfill is not claimed.
- Production use requires an independent audit, separate payer/merchant testing, operational monitoring, privacy review, and explicit refund/dispute design.
