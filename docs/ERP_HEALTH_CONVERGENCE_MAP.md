# ERP Health Convergence Map

## Scope and verified baseline

This map is based on the dedicated Health models currently present in `prisma/schema.prisma`, including patients, appointments, consultations, medical records, laboratory, internal pharmacy, medical billing, insurance coverage, quality and medical documents. Iteration 4 introduces financial projections and links only; clinical ownership remains unchanged.

## Ownership rule

- Clinical identity, care context, consultations, medical records, prescriptions, lab results and medical documents remain under Health authority.
- Minimal billing identity, payer identity, invoice, receivable, payment, treasury and accounting become common ERP authority after cutover.
- Finance users receive only the minimum permitted projection and no implicit clinical access.

## Model-by-model mapping

| Current sector model | Current truth | Common part | Specialized part retained | Future truth | Target relation | Backfill | Cutover | Legacy | Sensitive class | Accounting event | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `HealthPatient` | Health | billing identity, contact, address, financial responsible party | all clinical and detailed administrative health data | Health + minimal financial profile | mapping to `EnterpriseBusinessParty` through `HealthPatientFinancialProfile` | deterministic patient number and organization only | patient-finance flag | Health remains authoritative | MEDICAL_CONFIDENTIAL | none directly | critical |
| `HealthAppointment` | Health | optional billable service reference | appointment reason, care provider and clinical workflow | Health | opaque entity links and workflow adapter | not financial backfill | workflow flag | unchanged | MEDICAL_CONFIDENTIAL | none directly | medium |
| `HealthConsultation` | Health | billable service trigger | symptoms, examination, diagnosis, treatment, prescription and notes | Health | source reference only on Health billing extension | no clinical copy | billing flag | unchanged | MEDICAL_HIGHLY_RESTRICTED | invoice only through validated billing service | critical |
| `HealthMedicalRecord` and related clinical models | Health | none beyond opaque source reference | entire record, allergies, history, treatments, alerts and confidential notes | Health | opaque `EnterpriseEntityLink` only | not applicable | none | unchanged | MEDICAL_HIGHLY_RESTRICTED | none directly | critical |
| `HealthLabRequest` | Health | billable catalog item and amount trigger | indication, sample, result, validation and clinical interpretation | Health | source reference on billing item/extension | no result copy | billing flag | unchanged | MEDICAL_HIGHLY_RESTRICTED | invoicing only | critical |
| `HealthPharmacyDispensation` | Health | billable amount and inventory accounting projection | patient, prescription, prescriber, batch and clinical dispensation | Health | source reference on billing extension; inventory adapter | deterministic only when mapped product and invoice are known | billing/inventory flags | unchanged | MEDICAL_CONFIDENTIAL | `HEALTH_DISPENSATION_INVOICED`; stock issue where configured | critical |
| `HealthBillingServiceCatalog` | Health | code, financial label, service type, price, tax, currency and status | specialty, clinical prerequisites, nomenclature and restrictions | Core catalog + Health extension | mapping to `EnterpriseCatalogItem` | deterministic service code | service-catalog flag | readable extension | MEDICAL_CONFIDENTIAL where restricted | invoice revenue mapping | high |
| `HealthMedicalInvoice` | Health | clinical billing composition and source references | patient, consultation, lab/dispensation links and confidentiality | `EnterpriseSalesInvoice` + `HealthBillingExtension` | one-to-one FK mapping | totals, currency, patient profile and lines must be deterministic | billing flag | non-authoritative financial balance after cutover | FINANCIAL_CONFIDENTIAL | `HEALTH_MEDICAL_INVOICE_POSTED` | critical |
| `HealthMedicalInvoiceItem` | Health | billable line quantity, price and service | source clinical references and confidentiality | common invoice item + extension metadata | parent invoice mapping + catalog mapping | deterministic | billing flag | readable | FINANCIAL_CONFIDENTIAL; source clinical link restricted | invoice posting | critical |
| `HealthMedicalInvoicePayment` | Health | legacy collection | collector and Health invoice context | `EnterprisePayment` + `HealthPaymentExtension` | one-to-one mapping | amount, currency, payer and financial account must be deterministic | payment flag | non-authoritative after cutover | FINANCIAL_CONFIDENTIAL | patient or insurer payment confirmed | critical |
| `HealthInsuranceProvider` | Health | insurer administration | legal identity, contacts, address and payer role | common business party + insurer extension | mapping to `EnterpriseBusinessParty` role `INSURER` | registration/tax ID or controlled manual mapping; never name-only | insurance flag | readable extension | FINANCIAL_CONFIDENTIAL | insurance receivable/payments | critical |
| `HealthPatientInsuranceCoverage` | Health | Health | policy, coverage limits, dates and clinical/administrative restrictions | Health | mapping to insurer business party and patient financial profile | deterministic when endpoints map | insurance flag | unchanged | MEDICAL_CONFIDENTIAL | none directly | high |
| `HealthCoverageRequest` | Health | Health insurance workflow | request context, supporting documents and insurer decision | Health + common insurance receivable extension | mapping to receivable component/claim | deterministic only after common invoice exists | insurance flag | readable | MEDICAL_CONFIDENTIAL | `HEALTH_INSURANCE_RECEIVABLE_CREATED`, settlement/write-off | critical |
| `HealthCoverageRequestEvent` | Health | Health | lifecycle and insurer interactions | Health | contextual link only | no financial copy | insurance flag | unchanged | MEDICAL_CONFIDENTIAL | none independently | medium |
| `HealthDocument` / versions / access logs | Health | Health | medical content, files, access policy and audit | Health | opaque relation from Core; no general-download authority | no content copy | document-policy flag | unchanged | MEDICAL_CONFIDENTIAL or MEDICAL_HIGHLY_RESTRICTED | none directly | critical |
| `HealthQualityIncident` | Health | Health | incident, patient impact, investigation and restricted notes | Health | workflow/task links only | not applicable | workflow flag | unchanged | most restrictive Health level | write-off only via separate approval | high |

## Patient financial projection

Allowed fields are restricted to:

- organization and Health patient identifiers;
- generated billing party code;
- billing display label or controlled pseudonym;
- payment contact and billing address where explicitly allowed;
- financial responsible party;
- insurer business party references;
- migration and synchronization metadata.

The following are prohibited from Core mappings, logs, journal descriptions and push notifications:

- diagnosis, symptoms, treatment, allergy and medical history;
- laboratory result or interpretation;
- complete prescription or medical note;
- medical document content;
- any clinical information not strictly necessary for billing authorization.

## Receivable split

A common medical invoice may have multiple structured payer components:

- `PATIENT`
- `INSURER`
- `EMPLOYER`
- `PARTNER`
- `OTHER_THIRD_PARTY`

Each component has its own party, requested/approved/settled/written-off amounts and status. The invoice total is never assigned entirely to the patient when another payer is responsible.

## Double-source decisions

1. Health remains authoritative for the medical invoice composition and confidentiality context.
2. `EnterpriseSalesInvoice`, payer-component receivables, `EnterprisePayment`, allocations and posted entries become authoritative for financial balances after cutover.
3. A Health invoice cannot become financially paid without confirmed common allocations covering its balance.
4. A common invoice cannot be duplicated for the same Health invoice.
5. Insurance payments may allocate across multiple invoice components.

## Cutover flags

- `ERP_HEALTH_PATIENT_FINANCE_CONVERGENCE`
- `ERP_HEALTH_SERVICE_CATALOG_CONVERGENCE`
- `ERP_HEALTH_BILLING_CONVERGENCE`
- `ERP_HEALTH_PAYMENT_CONVERGENCE`
- `ERP_HEALTH_INSURANCE_CONVERGENCE`
- `ERP_HEALTH_INTERNAL_PHARMACY_ACCOUNTING`

All flags are server-side, safe-off by default and scheduled for removal in Iteration 5.
