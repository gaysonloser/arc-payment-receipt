# Verified Milestone Close · Three-Minute Demo Script

## 0:00-0:25 - Current product and problem

Open `/current-mvp/` and introduce **Verified Milestone Close** (presentation name: **Arc Enterprise Settlement Control**). The current operator journey starts with a supplier payable and also supports the customer-receipt/refund entry. It keeps Arc/USDC receipt facts, programmable `PolicySettlementV1`, and ERPNext accounting truth in separate typed layers.

## 0:25-0:55 - Programmable-money boundary

Show the PolicySettlementV1 policy/unsigned-instruction view. Explain that policy, attestation and wallet review are distinct gates; the workbench never signs or broadcasts. If the reviewer opens the historical Payment Receipt component, label it as support lineage rather than the current product.

## 0:55-1:25 - Receipt-first settlement

Show the three correlated records: PolicySettlementV1/SettlementExecuted, ERC-20 Transfer and Arc system Transfer. Demonstrate finality, TTL, replay and reorg checks. A missing, stale or mismatched record stays OPEN and produces no ERP/GL/PLED/close consequence.

## 1:25-2:05 - ERP accounting truth

Open the ERP inspector and show the independent Invoice, Payment Entry, Bank Transaction, GL, Payment Ledger and close readbacks. Keep chain success, ERP posting and business close visibly separate; local fixtures are labeled local-only and the backend remains read-only.

## 2:05-2:40 - Fail-closed and lifecycle paths

Switch between supplier payable and customer receipt/refund. Show TTL expiry, replay, revoke and reversal as explicit states. Refunds preserve the original source and ceiling; an over-ceiling or duplicate request is rejected, never silently posted.

## 2:40-3:00 - Evidence boundary

State that Arc Testnet is the chain fact layer, Render is read-only presentation, and ERPNext is the business authority. Circle Console, Encode and Final remain separate owner gates. The older Arc Lab/Payment Receipt screens are historical/support components only. Close with the explicit boundary: no signer, wallet transaction, ERP posting or business close is claimed by this release.
