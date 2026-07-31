# ERP Health Billing and Insurance

## Clinical and financial authority

Health remains authoritative for patients, consultations, medical records, laboratory, prescriptions, dispensations and medical documents. The common ERP receives only the minimum financial projection required to bill, collect, reconcile and account.

A patient financial projection uses a controlled label such as `Patient #PAT-000123`. It does not copy diagnosis, symptoms, allergies, history, treatment, laboratory results, prescription text or medical files.

## Billing chain

```text
HealthMedicalInvoice
  -> HealthBillingExtension
  -> EnterpriseSalesInvoice
  -> EnterpriseReceivable
  -> HealthInvoicePayerComponent
  -> EnterprisePayment / EnterprisePaymentAllocation
  -> HealthPayerAllocation
  -> Treasury and accounting
```

The common invoice is unique per Health invoice and owns the financial balance after cutover.

## Payer components

Supported payer types:

- `PATIENT`
- `INSURER`
- `EMPLOYER`
- `PARTNER`
- `OTHER_THIRD_PARTY`

The requested amounts of all payer components must equal the common invoice total. Each component keeps requested, approved, settled, written-off and outstanding amounts. Components subdivide one receivable; they do not create duplicate invoices.

## Insurance cycle

```text
DRAFT
-> SUBMITTED
-> UNDER_REVIEW
-> APPROVED / PARTIALLY_APPROVED / REJECTED
-> CLAIMED
-> PARTIALLY_SETTLED / SETTLED
-> CLOSED
```

`HealthInsuranceProviderExtension` maps the Health insurer to one common business party with role `INSURER`. Name similarity alone is never sufficient for an automatic mapping.

## Differences and responsibility transfer

The system preserves the difference between requested, approved and settled amounts. A difference must lead to one of:

- patient responsibility;
- insurer rejection;
- a new or corrected claim;
- a dispute;
- an approved write-off.

No difference silently disappears and no rejected insurance amount remains indefinitely attributed to the insurer.

## Payments

Patient and insurer payments use `EnterprisePayment`. An insurer payment can cover several invoices by using common allocations. Every Health allocation additionally records its payer component through `HealthPayerAllocation`.

Allocation checks include:

- tenant, payer and currency equality;
- confirmed inbound payment;
- available payment balance;
- common receivable balance;
- payer-component balance;
- row locks and serializable transaction;
- idempotent mapping.

A Health invoice cannot be marked financially paid without confirmed common allocations covering the common balance.

## Internal pharmacy

A Health internal dispensation remains linked to the patient and clinical context. It may create one Health billing item and one separately controlled inventory accounting event. It must not create a second Pharmacy autonomous sale unless the organization explicitly uses the standalone Pharmacy sector and a documented integration.

## Confidentiality

Finance may see invoice number, permitted payer label, amounts, balances, payment, account and journal references. Finance receives no automatic access to consultation notes, diagnoses, prescriptions, results or medical files. Opaque entity links do not grant access.

## Iteration 5

Deferred:

- removal of legacy Health financial payment routes;
- retirement of compatibility flags and projections;
- final archive policy for unmapped historic payments;
- cleanup of obsolete fields and aliases;
- long-term performance and reporting stabilization.
