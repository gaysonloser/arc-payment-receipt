/* Generated from the accepted read-only C15 execution contract. Do not hand-edit the matrix. */
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export const A12_C15_ACCEPTED_SCENARIO_PROJECTION_MATRIX = deepFreeze({
  "field_contract": [
    "field_id",
    "type",
    "source",
    "editability",
    "requiredness",
    "validator",
    "reset_dependencies"
  ],
  "dapp_object_contract": {
    "applicability_enum": [
      "required",
      "optional",
      "not_applicable"
    ],
    "runtime_state_enum": [
      "not_applicable",
      "missing",
      "loading",
      "ready",
      "observed",
      "projected",
      "matched",
      "stale",
      "mismatch",
      "reorged",
      "unavailable"
    ]
  },
  "supplier_payable": {
    "fields": [
      {
        "field_id": "supplier",
        "type": "party_ref",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "submitted_purchase_invoice_party",
        "reset_dependencies": [
          "source_document"
        ]
      },
      {
        "field_id": "source_purchase_invoice",
        "type": "voucher_ref",
        "source": "erpnext",
        "editability": "select",
        "requiredness": "required",
        "validator": "docstatus_1_company_party_currency",
        "reset_dependencies": [
          "company",
          "profile"
        ]
      },
      {
        "field_id": "due_date",
        "type": "date",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "valid_invoice_due_date",
        "reset_dependencies": [
          "source_purchase_invoice"
        ]
      },
      {
        "field_id": "outstanding_before_amount6",
        "type": "amount6",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "positive_invoice_outstanding",
        "reset_dependencies": [
          "source_purchase_invoice"
        ]
      },
      {
        "field_id": "payment_terms",
        "type": "terms_ref",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "invoice_payment_terms",
        "reset_dependencies": [
          "source_purchase_invoice"
        ]
      },
      {
        "field_id": "allocation_amount6",
        "type": "amount6",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "positive_lte_outstanding",
        "reset_dependencies": [
          "source_purchase_invoice"
        ]
      },
      {
        "field_id": "treasury_wallet",
        "type": "address",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "company_effective_interval",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "recipient_registry",
        "type": "registry_ref",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "company_party_effective_interval",
        "reset_dependencies": [
          "supplier"
        ]
      },
      {
        "field_id": "recipient_wallet",
        "type": "address",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "company_party_effective_interval",
        "reset_dependencies": [
          "supplier"
        ]
      },
      {
        "field_id": "policy_cap_amount6",
        "type": "amount6",
        "source": "policy_getter",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "gte_allocation_unexpired",
        "reset_dependencies": [
          "recipient_wallet"
        ]
      },
      {
        "field_id": "policy_version",
        "type": "uint",
        "source": "policy_getter",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "accepted_policy_version",
        "reset_dependencies": [
          "recipient_wallet"
        ]
      },
      {
        "field_id": "policy_expiry",
        "type": "timestamp",
        "source": "policy_getter",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "future_at_preflight",
        "reset_dependencies": [
          "recipient_wallet"
        ]
      },
      {
        "field_id": "allowance_amount6",
        "type": "amount6",
        "source": "arc_readback",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "gte_allocation_fresh",
        "reset_dependencies": [
          "treasury_wallet",
          "recipient_wallet"
        ]
      },
      {
        "field_id": "outstanding_after_amount6",
        "type": "amount6",
        "source": "erp_projection",
        "editability": "computed",
        "requiredness": "required",
        "validator": "before_minus_allocation",
        "reset_dependencies": [
          "allocation_amount6"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "unsigned_command": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "wallet_review": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "accounting_consequence": {
        "applicability": "required",
        "runtime_state": "projected"
      }
    },
    "primary_action": "review_supplier_payment"
  },
  "supplier_advance": {
    "fields": [
      {
        "field_id": "supplier",
        "type": "party_ref",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "active_supplier",
        "reset_dependencies": [
          "profile"
        ]
      },
      {
        "field_id": "purchase_order_or_request",
        "type": "voucher_ref",
        "source": "erpnext",
        "editability": "select",
        "requiredness": "required",
        "validator": "company_party_currency",
        "reset_dependencies": [
          "supplier"
        ]
      },
      {
        "field_id": "advance_purpose",
        "type": "text",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "nonempty_240",
        "reset_dependencies": [
          "purchase_order_or_request"
        ]
      },
      {
        "field_id": "advance_amount6",
        "type": "amount6",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "positive_within_policy",
        "reset_dependencies": [
          "purchase_order_or_request"
        ]
      },
      {
        "field_id": "unallocated_amount6",
        "type": "amount6",
        "source": "erp_projection",
        "editability": "computed",
        "requiredness": "required",
        "validator": "equals_advance_amount_until_invoice_allocation",
        "reset_dependencies": [
          "advance_amount6"
        ]
      },
      {
        "field_id": "advance_account",
        "type": "account_ref",
        "source": "erpnext_metadata",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "supplier_advance_company_currency",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "recipient_wallet",
        "type": "address",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "company_party_effective_interval",
        "reset_dependencies": [
          "supplier"
        ]
      },
      {
        "field_id": "policy_cap_amount6",
        "type": "amount6",
        "source": "policy_getter",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "gte_advance_unexpired",
        "reset_dependencies": [
          "recipient_wallet"
        ]
      },
      {
        "field_id": "allowance_amount6",
        "type": "amount6",
        "source": "arc_readback",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "gte_advance_fresh",
        "reset_dependencies": [
          "recipient_wallet"
        ]
      },
      {
        "field_id": "invoice_close_prohibited_ack",
        "type": "boolean",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "must_be_true",
        "reset_dependencies": [
          "profile",
          "purchase_order_or_request"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "unsigned_command": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "wallet_review": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "accounting_consequence": {
        "applicability": "required",
        "runtime_state": "projected"
      }
    },
    "primary_action": "review_supplier_advance"
  },
  "employee_payable": {
    "fields": [
      {
        "field_id": "employee",
        "type": "party_ref",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "submitted_expense_claim_employee",
        "reset_dependencies": [
          "source_expense_claim"
        ]
      },
      {
        "field_id": "source_expense_claim",
        "type": "voucher_ref",
        "source": "erpnext",
        "editability": "select",
        "requiredness": "required",
        "validator": "docstatus_1_company_employee_currency",
        "reset_dependencies": [
          "company",
          "profile"
        ]
      },
      {
        "field_id": "reimbursement_category",
        "type": "enum",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "allowed_expense_category",
        "reset_dependencies": [
          "source_expense_claim"
        ]
      },
      {
        "field_id": "reimbursement_amount6",
        "type": "amount6",
        "source": "erpnext",
        "editability": "computed",
        "requiredness": "required",
        "validator": "positive_lte_claim_outstanding",
        "reset_dependencies": [
          "source_expense_claim"
        ]
      },
      {
        "field_id": "employee_wallet",
        "type": "address",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "employee_effective_interval",
        "reset_dependencies": [
          "employee"
        ]
      },
      {
        "field_id": "employee_wallet_registry_interval",
        "type": "effective_interval",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "contains_observation_or_preflight_time",
        "reset_dependencies": [
          "employee"
        ]
      },
      {
        "field_id": "policy_cap_amount6",
        "type": "amount6",
        "source": "policy_getter",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "gte_reimbursement_unexpired",
        "reset_dependencies": [
          "employee_wallet"
        ]
      },
      {
        "field_id": "allowance_amount6",
        "type": "amount6",
        "source": "arc_readback",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "gte_reimbursement_fresh",
        "reset_dependencies": [
          "employee_wallet"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "unsigned_command": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "wallet_review": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "accounting_consequence": {
        "applicability": "required",
        "runtime_state": "projected"
      }
    },
    "primary_action": "review_reimbursement"
  },
  "customer_invoice_receipt": {
    "fields": [
      {
        "field_id": "observed_arc_receipt",
        "type": "chain_event_ref",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "final_status1_usdc_to_treasury",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "customer",
        "type": "party_ref",
        "source": "candidate_matcher",
        "editability": "confirm",
        "requiredness": "required",
        "validator": "single_effective_payer_registry",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "payer_registry",
        "type": "registry_ref",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "customer_wallet_effective_interval",
        "reset_dependencies": [
          "customer"
        ]
      },
      {
        "field_id": "source_sales_invoice",
        "type": "voucher_ref",
        "source": "erpnext",
        "editability": "select",
        "requiredness": "required",
        "validator": "docstatus_1_company_party_currency",
        "reset_dependencies": [
          "customer"
        ]
      },
      {
        "field_id": "amount_received6",
        "type": "amount6",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "equals_transfer_principal",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "observed_sender",
        "type": "address",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "equals_effective_payer_registry",
        "reset_dependencies": [
          "observed_arc_receipt",
          "payer_registry"
        ]
      },
      {
        "field_id": "treasury_recipient",
        "type": "address",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "equals_company_treasury",
        "reset_dependencies": [
          "observed_arc_receipt",
          "company"
        ]
      },
      {
        "field_id": "receipt_finality_state",
        "type": "finality",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "status1_threshold_met_not_reorged",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "outstanding_before_amount6",
        "type": "amount6",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "positive_invoice_outstanding",
        "reset_dependencies": [
          "source_sales_invoice"
        ]
      },
      {
        "field_id": "allocation_amount6",
        "type": "amount6",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "positive_lte_receipt_and_outstanding",
        "reset_dependencies": [
          "source_sales_invoice",
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "canonical_event_key",
        "type": "event_key",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "chain_tx_log_unique",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "unsigned_command": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "wallet_review": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "observed"
      },
      "accounting_consequence": {
        "applicability": "required",
        "runtime_state": "projected"
      }
    },
    "primary_action": "match_customer_receipt"
  },
  "customer_advance": {
    "fields": [
      {
        "field_id": "observed_arc_receipt",
        "type": "chain_event_ref",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "final_status1_usdc_to_treasury",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "customer",
        "type": "party_ref",
        "source": "candidate_matcher",
        "editability": "confirm",
        "requiredness": "required",
        "validator": "single_effective_payer_registry",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "payer_registry",
        "type": "registry_ref",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "customer_wallet_effective_interval",
        "reset_dependencies": [
          "customer"
        ]
      },
      {
        "field_id": "amount_received6",
        "type": "amount6",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "equals_transfer_principal",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "observed_sender",
        "type": "address",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "equals_effective_payer_registry",
        "reset_dependencies": [
          "observed_arc_receipt",
          "payer_registry"
        ]
      },
      {
        "field_id": "canonical_event_key",
        "type": "event_key",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "chain_tx_log_unique",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "receipt_finality_state",
        "type": "finality",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "status1_threshold_met_not_reorged",
        "reset_dependencies": [
          "observed_arc_receipt"
        ]
      },
      {
        "field_id": "sales_order_or_reference",
        "type": "voucher_ref",
        "source": "erpnext",
        "editability": "select",
        "requiredness": "optional",
        "validator": "company_party_currency",
        "reset_dependencies": [
          "customer"
        ]
      },
      {
        "field_id": "advance_purpose",
        "type": "text",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "nonempty_240",
        "reset_dependencies": [
          "customer"
        ]
      },
      {
        "field_id": "liability_account",
        "type": "account_ref",
        "source": "erpnext_metadata",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "customer_advance_company_currency",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "unallocated_amount6",
        "type": "amount6",
        "source": "erp_projection",
        "editability": "computed",
        "requiredness": "required",
        "validator": "equals_amount_received_until_invoice_allocation",
        "reset_dependencies": [
          "amount_received6"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "unsigned_command": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "wallet_review": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "observed"
      },
      "accounting_consequence": {
        "applicability": "required",
        "runtime_state": "projected"
      }
    },
    "primary_action": "classify_customer_advance"
  },
  "payment_refund_incoming": {
    "fields": [
      {
        "field_id": "original_outgoing_transaction",
        "type": "chain_event_ref",
        "source": "arc_receipt",
        "editability": "select",
        "requiredness": "required",
        "validator": "final_original_outgoing",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "original_payee_current_sender",
        "type": "party_wallet_pair",
        "source": "original_receipt_and_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "refund_sender_equals_original_payee",
        "reset_dependencies": [
          "original_outgoing_transaction"
        ]
      },
      {
        "field_id": "original_voucher",
        "type": "voucher_ref",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "bound_to_original_transaction",
        "reset_dependencies": [
          "original_outgoing_transaction"
        ]
      },
      {
        "field_id": "original_principal_amount6",
        "type": "amount6",
        "source": "original_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "positive_original_principal",
        "reset_dependencies": [
          "original_outgoing_transaction"
        ]
      },
      {
        "field_id": "original_event_key",
        "type": "event_key",
        "source": "original_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "chain_tx_log_unique",
        "reset_dependencies": [
          "original_outgoing_transaction"
        ]
      },
      {
        "field_id": "refunded_to_date_amount6",
        "type": "amount6",
        "source": "erp_projection",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "sum_prior_bound_refunds",
        "reset_dependencies": [
          "original_voucher"
        ]
      },
      {
        "field_id": "incoming_refund_transaction",
        "type": "chain_event_ref",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "final_sender_equals_original_payee",
        "reset_dependencies": [
          "original_outgoing_transaction"
        ]
      },
      {
        "field_id": "refund_event_key",
        "type": "event_key",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "chain_tx_log_unique_distinct_from_original",
        "reset_dependencies": [
          "incoming_refund_transaction"
        ]
      },
      {
        "field_id": "sender_equality_state",
        "type": "comparison",
        "source": "projection_validator",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "current_sender_equals_original_payee",
        "reset_dependencies": [
          "incoming_refund_transaction",
          "original_outgoing_transaction"
        ]
      },
      {
        "field_id": "receipt_finality_state",
        "type": "finality",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "status1_threshold_met_not_reorged",
        "reset_dependencies": [
          "incoming_refund_transaction"
        ]
      },
      {
        "field_id": "refund_amount6",
        "type": "amount6",
        "source": "arc_receipt",
        "editability": "computed",
        "requiredness": "required",
        "validator": "positive_lte_remaining_ceiling",
        "reset_dependencies": [
          "incoming_refund_transaction"
        ]
      },
      {
        "field_id": "exchange_rate",
        "type": "decimal",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "positive_explicit_no_implicit_parity",
        "reset_dependencies": [
          "original_voucher",
          "refund_amount6"
        ]
      },
      {
        "field_id": "difference_amount6",
        "type": "signed_amount6",
        "source": "erp_projection",
        "editability": "computed",
        "requiredness": "required",
        "validator": "zero_or_named_company_difference_account",
        "reset_dependencies": [
          "exchange_rate",
          "refund_amount6"
        ]
      },
      {
        "field_id": "refund_posting_mode",
        "type": "enum",
        "source": "projection_resolver",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "supplier_payment_recovery_unique_accounts",
        "reset_dependencies": [
          "original_voucher"
        ]
      },
      {
        "field_id": "resolved_recovery_account",
        "type": "account_ref",
        "source": "projection_resolver",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "unique_company_party_currency_account",
        "reset_dependencies": [
          "refund_posting_mode",
          "original_voucher"
        ]
      },
      {
        "field_id": "remaining_refund_ceiling_amount6",
        "type": "amount6",
        "source": "erp_projection",
        "editability": "computed",
        "requiredness": "required",
        "validator": "original_minus_prior_refunds",
        "reset_dependencies": [
          "original_voucher"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "unsigned_command": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "wallet_review": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "observed"
      },
      "accounting_consequence": {
        "applicability": "required",
        "runtime_state": "projected"
      }
    },
    "primary_action": "verify_incoming_refund"
  },
  "receipt_refund_outgoing": {
    "fields": [
      {
        "field_id": "original_incoming_transaction",
        "type": "chain_event_ref",
        "source": "arc_receipt",
        "editability": "select",
        "requiredness": "required",
        "validator": "final_original_incoming",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "original_payer",
        "type": "party_wallet_pair",
        "source": "original_receipt_and_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "single_original_payer",
        "reset_dependencies": [
          "original_incoming_transaction"
        ]
      },
      {
        "field_id": "original_voucher",
        "type": "voucher_ref",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "bound_to_original_transaction",
        "reset_dependencies": [
          "original_incoming_transaction"
        ]
      },
      {
        "field_id": "original_principal_amount6",
        "type": "amount6",
        "source": "original_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "positive_original_principal",
        "reset_dependencies": [
          "original_incoming_transaction"
        ]
      },
      {
        "field_id": "original_event_key",
        "type": "event_key",
        "source": "original_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "chain_tx_log_unique",
        "reset_dependencies": [
          "original_incoming_transaction"
        ]
      },
      {
        "field_id": "refund_obligation_amount6",
        "type": "amount6",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "approved_lte_remaining_ceiling",
        "reset_dependencies": [
          "original_voucher"
        ]
      },
      {
        "field_id": "approved_refund_amount6",
        "type": "amount6",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "positive_lte_obligation_and_ceiling",
        "reset_dependencies": [
          "original_voucher"
        ]
      },
      {
        "field_id": "exchange_rate",
        "type": "decimal",
        "source": "erpnext",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "positive_explicit_no_implicit_parity",
        "reset_dependencies": [
          "original_voucher",
          "approved_refund_amount6"
        ]
      },
      {
        "field_id": "difference_amount6",
        "type": "signed_amount6",
        "source": "erp_projection",
        "editability": "computed",
        "requiredness": "required",
        "validator": "zero_or_named_company_difference_account",
        "reset_dependencies": [
          "exchange_rate",
          "approved_refund_amount6"
        ]
      },
      {
        "field_id": "refunded_to_date_amount6",
        "type": "amount6",
        "source": "erp_projection",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "sum_prior_bound_refunds",
        "reset_dependencies": [
          "original_voucher"
        ]
      },
      {
        "field_id": "exact_recipient_wallet",
        "type": "address",
        "source": "original_receipt_and_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "equals_original_payer_effective_registry",
        "reset_dependencies": [
          "original_incoming_transaction"
        ]
      },
      {
        "field_id": "recipient_equality_state",
        "type": "comparison",
        "source": "projection_validator",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "refund_recipient_equals_original_payer",
        "reset_dependencies": [
          "exact_recipient_wallet",
          "original_payer"
        ]
      },
      {
        "field_id": "policy_id",
        "type": "bytes32",
        "source": "policy_getter",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "bound_to_case_original_and_recipient",
        "reset_dependencies": [
          "original_voucher",
          "exact_recipient_wallet"
        ]
      },
      {
        "field_id": "allowance_amount6",
        "type": "amount6",
        "source": "arc_readback",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "gte_approved_refund_fresh",
        "reset_dependencies": [
          "exact_recipient_wallet",
          "approved_refund_amount6"
        ]
      },
      {
        "field_id": "refund_posting_mode",
        "type": "enum",
        "source": "projection_resolver",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "customer_receipt_return_unique_accounts",
        "reset_dependencies": [
          "original_voucher"
        ]
      },
      {
        "field_id": "resolved_refund_debit_account",
        "type": "account_ref",
        "source": "projection_resolver",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "unique_company_party_currency_account",
        "reset_dependencies": [
          "refund_posting_mode",
          "original_voucher"
        ]
      },
      {
        "field_id": "remaining_refund_ceiling_amount6",
        "type": "amount6",
        "source": "erp_projection",
        "editability": "computed",
        "requiredness": "required",
        "validator": "original_minus_prior_refunds",
        "reset_dependencies": [
          "original_voucher"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "unsigned_command": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "wallet_review": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "missing"
      },
      "accounting_consequence": {
        "applicability": "required",
        "runtime_state": "projected"
      }
    },
    "primary_action": "review_receipt_refund"
  },
  "unresolved_incoming_outgoing": {
    "fields": [
      {
        "field_id": "observed_transaction",
        "type": "chain_event_ref",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "structurally_valid_observation",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "observed_direction",
        "type": "enum",
        "source": "treasury_relative_classifier",
        "editability": "computed",
        "requiredness": "required",
        "validator": "incoming_or_outgoing",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "company_treasury_registry",
        "type": "registry_ref",
        "source": "treasury_registry",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "company_effective_interval",
        "reset_dependencies": [
          "company",
          "observed_transaction"
        ]
      },
      {
        "field_id": "canonical_event_key",
        "type": "event_key",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "chain_tx_log_unique",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "observed_from",
        "type": "address",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "valid_address",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "observed_to",
        "type": "address",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "valid_address",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "token_address",
        "type": "address",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "allowlisted_usdc_token",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "observed_amount6",
        "type": "amount6",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "positive_transfer_principal",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "receipt_finality_reorg_state",
        "type": "finality_reorg",
        "source": "arc_receipt",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "typed_status_finality_reorg",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "candidate_parties",
        "type": "candidate_list",
        "source": "candidate_matcher",
        "editability": "select",
        "requiredness": "optional",
        "validator": "zero_one_or_multiple_explicit",
        "reset_dependencies": [
          "observed_transaction"
        ]
      },
      {
        "field_id": "evidence_gaps",
        "type": "reason_list",
        "source": "projection_validator",
        "editability": "read_only",
        "requiredness": "required",
        "validator": "nonempty_when_unresolved",
        "reset_dependencies": [
          "candidate_parties"
        ]
      },
      {
        "field_id": "case_owner",
        "type": "role_user_ref",
        "source": "operator_assignment",
        "editability": "editable",
        "requiredness": "required",
        "validator": "authorized_investigator",
        "reset_dependencies": [
          "company"
        ]
      },
      {
        "field_id": "reason_code",
        "type": "enum",
        "source": "operator_confirmation",
        "editability": "editable",
        "requiredness": "required",
        "validator": "typed_unresolved_reason",
        "reset_dependencies": [
          "observed_transaction"
        ]
      }
    ],
    "dapp_objects": {
      "treasury_session": {
        "applicability": "required",
        "runtime_state": "ready"
      },
      "settlement_policy": {
        "applicability": "optional",
        "runtime_state": "missing"
      },
      "unsigned_command": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "wallet_review": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      },
      "receipt_finality": {
        "applicability": "required",
        "runtime_state": "observed"
      },
      "accounting_consequence": {
        "applicability": "not_applicable",
        "runtime_state": "not_applicable"
      }
    },
    "primary_action": "assign_or_keep_unresolved"
  }
});
export const A12_C15_ACCEPTED_ACTION_STATE_MACHINE = deepFreeze({
  "composition_rule": "resolved_action=scenario_primary_action_overrides_merged_over_stage_defaults; missing_key_or_unknown_action=non_executable",
  "required_keys": [
    "action_id",
    "scenario",
    "stage",
    "label",
    "role",
    "preconditions",
    "mutation_boundary",
    "consequence",
    "next_state",
    "stop_condition",
    "recovery",
    "next_owner"
  ],
  "stage_defaults": {
    "source": {
      "action_id": "inspect_source",
      "label": "Inspect source",
      "role": "ap_clerk_or_ar_clerk",
      "preconditions": [
        "case_selected"
      ],
      "mutation_boundary": "read_only",
      "consequence": "source_snapshot_only",
      "next_state": "classify",
      "stop_condition": "source_missing_or_unreadable",
      "recovery": "refresh_or_select_source",
      "next_owner": "operator"
    },
    "classify": {
      "action_id": "confirm_classification",
      "label": "Confirm classification",
      "role": "accountant",
      "preconditions": [
        "source_valid",
        "company_resolved",
        "direction_resolved"
      ],
      "mutation_boundary": "local_confirmation_only",
      "consequence": "typed_profile_and_party_candidate",
      "next_state": "allocate",
      "stop_condition": "unknown_or_multiple_candidate_or_tier_d",
      "recovery": "resolve_candidate_or_keep_unresolved",
      "next_owner": "accountant"
    },
    "allocate": {
      "action_id": "confirm_allocation",
      "label": "Confirm allocation",
      "role": "accountant",
      "preconditions": [
        "profile_resolved",
        "voucher_eligible",
        "amount_within_open_item_or_refund_ceiling"
      ],
      "mutation_boundary": "local_projection_only",
      "consequence": "frozen_allocation_projection",
      "next_state": "authorize",
      "stop_condition": "amount_or_account_or_voucher_not_unique",
      "recovery": "repair_allocation",
      "next_owner": "accountant"
    },
    "authorize": {
      "action_id": "prepare_authorization",
      "label": "Prepare authorization",
      "role": "treasury_reviewer",
      "preconditions": [
        "allocation_frozen",
        "policy_and_allowance_valid_or_not_applicable"
      ],
      "mutation_boundary": "unsigned_envelope_only",
      "consequence": "one_owner_review_packet_or_not_applicable",
      "next_state": "settle",
      "stop_condition": "policy_allowance_wallet_or_network_mismatch",
      "recovery": "refresh_policy_or_registry",
      "next_owner": "wallet_owner_or_operator"
    },
    "settle": {
      "action_id": "observe_settlement",
      "label": "Observe settlement",
      "role": "wallet_owner_or_watcher",
      "preconditions": [
        "owner_gate_for_write_or_existing_chain_observation"
      ],
      "mutation_boundary": "separate_owner_wallet_gate_or_read_only_observation",
      "consequence": "receipt_candidate_only",
      "next_state": "post",
      "stop_condition": "rejected_reverted_nonfinal_mismatch_or_reorg",
      "recovery": "preserve_open_item_and_review_receipt",
      "next_owner": "accountant"
    },
    "post": {
      "action_id": "prepare_erp_posting",
      "label": "Prepare ERP posting",
      "role": "accountant",
      "preconditions": [
        "final_matched_receipt_or_erp_origin_precondition",
        "source_voucher_valid",
        "accounts_unique"
      ],
      "mutation_boundary": "erp_draft_proposal_only_until_separate_owner_gate",
      "consequence": "payment_entry_and_bank_transaction_projection",
      "next_state": "close",
      "stop_condition": "readback_diff_docstatus_or_ledger_mismatch",
      "recovery": "inspect_erp_diff",
      "next_owner": "erp_submitter"
    },
    "close": {
      "action_id": "review_close",
      "label": "Review close",
      "role": "controller",
      "preconditions": [
        "erp_submitted_readback_matched",
        "gl_pled_balanced",
        "outstanding_expected"
      ],
      "mutation_boundary": "read_only_close_preflight",
      "consequence": "operational_close_candidate_only",
      "next_state": "terminal_or_period_gate",
      "stop_condition": "unresolved_exception_late_entry_or_period_rule",
      "recovery": "reopen_operational_case_or_route_period_control",
      "next_owner": "controller"
    }
  },
  "scenario_primary_actions": {
    "review_supplier_payment": {
      "action_id": "review_supplier_payment",
      "scenario": "supplier_payable",
      "stage": "authorize",
      "label": "Review supplier payment",
      "role": "treasury_reviewer",
      "preconditions": [
        "supplier_payable_fields_valid",
        "policy_cap_and_allowance_valid"
      ],
      "mutation_boundary": "unsigned_wallet_review_packet_only",
      "consequence": "opens_exactly_one_owner_wallet_review_after_separate_gate",
      "next_state": "settle",
      "stop_condition": "recipient_policy_allowance_or_amount_mismatch",
      "recovery": "return_to_business_or_arc_inspector",
      "next_owner": "wallet_owner"
    },
    "review_supplier_advance": {
      "action_id": "review_supplier_advance",
      "scenario": "supplier_advance",
      "stage": "authorize",
      "label": "Review supplier advance",
      "role": "treasury_reviewer",
      "preconditions": [
        "supplier_advance_fields_valid",
        "no_invoice_close_acknowledged"
      ],
      "mutation_boundary": "unsigned_wallet_review_packet_only",
      "consequence": "unallocated_advance_command_candidate",
      "next_state": "settle",
      "stop_condition": "purpose_account_policy_or_wallet_invalid",
      "recovery": "repair_advance_fields",
      "next_owner": "wallet_owner"
    },
    "review_reimbursement": {
      "action_id": "review_reimbursement",
      "scenario": "employee_payable",
      "stage": "authorize",
      "label": "Review reimbursement",
      "role": "treasury_reviewer",
      "preconditions": [
        "expense_claim_submitted",
        "employee_registry_effective"
      ],
      "mutation_boundary": "unsigned_wallet_review_packet_only",
      "consequence": "employee_payment_command_candidate",
      "next_state": "settle",
      "stop_condition": "claim_wallet_policy_or_amount_invalid",
      "recovery": "repair_claim_or_registry",
      "next_owner": "wallet_owner"
    },
    "match_customer_receipt": {
      "action_id": "match_customer_receipt",
      "scenario": "customer_invoice_receipt",
      "stage": "allocate",
      "label": "Match customer receipt",
      "role": "ar_accountant",
      "preconditions": [
        "final_receipt",
        "single_customer",
        "invoice_eligible",
        "allocation_valid"
      ],
      "mutation_boundary": "local_match_confirmation_only",
      "consequence": "receive_payment_entry_projection",
      "next_state": "post",
      "stop_condition": "candidate_receipt_invoice_or_amount_mismatch",
      "recovery": "inspect_first_failed_field",
      "next_owner": "accountant"
    },
    "classify_customer_advance": {
      "action_id": "classify_customer_advance",
      "scenario": "customer_advance",
      "stage": "allocate",
      "label": "Classify customer advance",
      "role": "ar_accountant",
      "preconditions": [
        "final_receipt",
        "single_customer",
        "advance_account_unique"
      ],
      "mutation_boundary": "local_classification_only",
      "consequence": "unallocated_receive_projection",
      "next_state": "post",
      "stop_condition": "party_purpose_or_account_unresolved",
      "recovery": "keep_unresolved_or_supply_evidence",
      "next_owner": "accountant"
    },
    "verify_incoming_refund": {
      "action_id": "verify_incoming_refund",
      "scenario": "payment_refund_incoming",
      "stage": "allocate",
      "label": "Verify incoming refund",
      "role": "accountant",
      "preconditions": [
        "original_outgoing_bound",
        "refund_final",
        "sender_equal",
        "mode_and_accounts_unique",
        "within_ceiling"
      ],
      "mutation_boundary": "local_refund_match_only",
      "consequence": "incoming_refund_receive_projection",
      "next_state": "post",
      "stop_condition": "original_sender_mode_account_or_ceiling_mismatch",
      "recovery": "keep_open_and_resolve_original",
      "next_owner": "accountant"
    },
    "review_receipt_refund": {
      "action_id": "review_receipt_refund",
      "scenario": "receipt_refund_outgoing",
      "stage": "authorize",
      "label": "Review receipt refund",
      "role": "treasury_reviewer",
      "preconditions": [
        "original_incoming_bound",
        "refund_approved",
        "recipient_equal",
        "mode_and_accounts_unique",
        "within_ceiling"
      ],
      "mutation_boundary": "unsigned_wallet_review_packet_only",
      "consequence": "outgoing_refund_command_candidate",
      "next_state": "settle",
      "stop_condition": "original_recipient_mode_account_policy_or_ceiling_mismatch",
      "recovery": "return_to_refund_resolution",
      "next_owner": "wallet_owner"
    },
    "assign_or_keep_unresolved": {
      "action_id": "assign_or_keep_unresolved",
      "scenario": "unresolved_incoming_outgoing",
      "stage": "classify",
      "label": "Assign or keep unresolved",
      "role": "accountant",
      "preconditions": [
        "observation_structurally_valid",
        "reason_code_present"
      ],
      "mutation_boundary": "local_assignment_only",
      "consequence": "no_erp_or_ledger_projection_until_resolved",
      "next_state": "classify_or_terminal_unresolved",
      "stop_condition": "evidence_still_insufficient",
      "recovery": "retain_unresolved_with_owner_and_reason",
      "next_owner": "investigator"
    }
  },
  "identity_assertion": "resolved.action_id === scenario_projection_matrix[resolved.scenario].primary_action; unknown_or_mismatch_is_non_executable"
});
