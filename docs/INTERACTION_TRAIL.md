# Verified Milestone Close · Interaction Trail

This project keeps the current Verified Milestone Close journey separate from
historical/support components and from owner-gated external surfaces. The
presentation alias is **Arc Enterprise Settlement Control**.

## Lane 1: Arc House and developer community

Arc House is the community and review surface. It is useful for developer identity, Architect readiness, hackathon context, official content learning, event participation, and contribution history.

Arc House is not a runtime dependency for the Enterprise OS. The service does not call Arc House APIs, automate posts, claim points, or depend on private community state. Community actions are recorded separately from engineering evidence.

Arc House membership, points, event registrations, and contribution history are account-bound rather than wallet-address fields. Moving future Arc execution to `ARC / 0x75F2...7Cc6` therefore does not reset or rewrite the community ledger. Public project links can point to the latest GitHub and Render evidence after the corresponding release is live.

## Lane 2: Arc Testnet and receipt-first settlement

Arc Testnet is the settlement fact layer. The current product binds
PolicySettlementV1 policy/attestation data to three correlated, independently decoded log records from one canonical receipt
and finality/replay/reorg controls. The older `ArcPaymentReceipt` contract and
`PaymentReceived` monitor remain historical lineage, not current-release proof.

The current wallet for future confirmed actions is `ARC / 0x75F2...7Cc6`. Existing contract deployment, merchant, payment, and registry-owner facts remain attributed to the original historical addresses; wallet migration never changes transaction provenance.

The project does not repeat payments to manufacture logs. Additional wallet signatures, transfers, approvals, deployments, claims, or bridge actions require explicit action-time approval.

## Lane 3: Circle Console and source assurance

Circle Console is a source-assurance lane. The Smart Contract Platform import and Event Monitor subscription provide an independent way to inspect whether `PaymentReceived` events are visible through Circle tooling.

Circle evidence is compared with the local Arc RPC monitor in an overlap window. Historical gaps are reported with their boundary instead of being hidden or backfilled. Stale snapshots remain historical evidence, not a fresh green signal.

## Lane 4: Render and current workbench presentation

Render is the running proof layer for the read-only `/current-mvp/` workbench. It
shows supplier payable and customer receipt/refund journeys, typed ERP
readbacks, and fail-closed lifecycle states.

Render does not replace Circle Console or ERPNext. It only presents sanitized
evidence and product controls. The historical Arc Lab E1 shell is a support
component; it includes no ERP credential, ERP write, wallet connection, signer,
database, chain transaction, enabled webhook, or Circle subscription. Both POST
routes are fail-closed, and neither route creates a posting or authorizes a
chain action.

## Lane 5: ERPNext accounting truth

ERPNext is the business-proof layer for future AOXPET Arc Lab work. It owns Company setup, master data, operating documents, Journal Entry and Payment Entry drafts, GL/Payment/SLE reconciliation, close, reports, and FP&A.

The current workbench accepts only typed ERP readbacks and keeps them separate
from chain facts. Local fixtures and historical shared-sandbox drafts are
explicitly non-live and cannot prove posting or business close.

## Review rule

The correct flow is:

```text
Verified Milestone Close case and supplier/customer journey
  + PolicySettlementV1 + three-record Arc receipt
  + Render `/current-mvp/` read-only workbench
  + ERPNext typed readbacks when separately authorized
  + Circle Console / Encode / Final only through separate owner gates
```

No lane is allowed to impersonate another lane. A Render page is not Circle
Console, a chain receipt is not an ERP ledger, and a local or draft ERP record
is not a submitted accounting entry. ArcPaymentReceipt and Arc Lab references
must remain explicitly historical/support labels.
