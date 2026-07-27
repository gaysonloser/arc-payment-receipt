# Interaction Trail

This project keeps four interaction lanes separate so reviewers can verify the work without confusing community activity, chain evidence, console evidence, and product presentation.

## Lane 1: Arc House and developer community

Arc House is the community and review surface. It is useful for developer identity, Architect readiness, hackathon context, official content learning, event participation, and contribution history.

Arc House is not a runtime dependency for the Enterprise OS. The service does not call Arc House APIs, automate posts, claim points, or depend on private community state. Community actions are recorded separately from engineering evidence.

Arc House membership, points, event registrations, and contribution history are account-bound rather than wallet-address fields. Moving future Arc execution to `ARC / 0x75F2...7Cc6` therefore does not reset or rewrite the community ledger. Public project links can point to the latest GitHub and Render evidence after the corresponding release is live.

## Lane 2: Arc Testnet and on-chain settlement

Arc Testnet is the settlement fact layer. The deployed `ArcPaymentReceipt` contract accepts native test USDC through `pay(bytes32,bytes32)`, records an immutable receipt index, forwards value to the merchant in the same transaction, and emits `PaymentReceived`.

The current wallet for future confirmed actions is `ARC / 0x75F2...7Cc6`. Existing contract deployment, merchant, payment, and registry-owner facts remain attributed to the original historical addresses; wallet migration never changes transaction provenance.

The project does not repeat payments to manufacture logs. Additional wallet signatures, transfers, approvals, deployments, claims, or bridge actions require explicit action-time approval.

## Lane 3: Circle Console and source assurance

Circle Console is a source-assurance lane. The Smart Contract Platform import and Event Monitor subscription provide an independent way to inspect whether `PaymentReceived` events are visible through Circle tooling.

Circle evidence is compared with the local Arc RPC monitor in an overlap window. Historical gaps are reported with their boundary instead of being hidden or backfilled. Stale snapshots remain historical evidence, not a fresh green signal.

## Lane 4: Render and Enterprise OS presentation

Render is the running proof layer. It provides a public, read-only surface for the receipt viewer, source evidence, health checks, and the AOXPET Arc Lab Enterprise OS shell.

Render does not replace Circle Console or ERPNext. It only presents sanitized evidence and product controls. E1 includes no ERP credential, ERP write, wallet connection, signer, database, chain transaction, enabled webhook, or Circle subscription. The webhook ingress is shipped disabled and cannot accept events until its separate durable queue, verification key, idempotency store, and Circle subscription controls are provisioned.

## Lane 5: ERPNext business proof

ERPNext is the business-proof layer for future AOXPET Arc Lab work. It owns Company setup, master data, operating documents, Journal Entry and Payment Entry drafts, GL/Payment/SLE reconciliation, close, reports, and FP&A.

The existing shared-sandbox drafts are historical draft-only evidence. They are not AOXPET Arc Lab Company proof and are not migrated into Arc Lab claims.

## Review rule

The correct flow is:

```text
Arc House learning and contribution context
  + Arc Testnet transaction and contract event
  + Circle Console / RPC source assurance
  + Render read-only Enterprise OS
  + ERPNext business proof when separately authorized
```

No lane is allowed to impersonate another lane. A community point is not a chain fact, a Render page is not Circle Console, a Circle event is not an ERP ledger, and a draft ERP record is not a submitted accounting entry.
