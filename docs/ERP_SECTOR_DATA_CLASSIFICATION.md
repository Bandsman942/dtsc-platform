# ERP Sector Data Classification

## Classification levels

| Level | Meaning | Default visibility |
|---|---|---|
| `GENERAL` | non-sensitive common operational metadata | authorized organization members with module access |
| `FINANCIAL_CONFIDENTIAL` | invoices, payer, balances, accounts, allocations, tax and accounting references | Finance permissions and involved operational users |
| `PHARMACY_RESTRICTED` | regulated products, lots, controlled-product rules, recalls, compliance and pharmacovigilance | Pharmacy permissions; Finance sees only permitted projections |
| `MEDICAL_CONFIDENTIAL` | patient identity linked to care, coverage and ordinary medical context | Health permissions; minimal billing projection allowed |
| `MEDICAL_HIGHLY_RESTRICTED` | diagnosis, symptoms, medical history, results, prescriptions, notes and medical files | explicit clinical permission only |

The most restrictive classification wins when objects are linked.

## Field allow-lists

### Pharmacy -> Core supplier projection

Allowed:

- legal/display name;
- supplier code and deterministic migration key;
- tax/registration identifiers;
- business contacts and address;
- payment terms, currency and normal lead time;
- active/suspended status.

Restricted to Pharmacy extension:

- pharmaceutical licence and regulatory qualification;
- controlled-product authorizations;
- temperature and cold-chain rules;
- pharmacovigilance and compliance notes;
- restricted supporting documents.

### Pharmacy -> Core product projection

Allowed:

- code/SKU/barcode;
- commercial name and description;
- general category and unit;
- indicative prices and currency;
- taxable and inventory-tracking flags;
- active/archived status.

Restricted to Pharmacy extension:

- generic name, active ingredient, dosage and pharmaceutical form;
- prescription and pharmacist-validation rules;
- controlled-product status and sale limits;
- FEFO, recall, quarantine and storage constraints;
- pharmacovigilance information.

### Health patient -> Core financial party projection

Allowed only where necessary:

- generated billing-party code and Health patient identifier;
- controlled display label or pseudonym;
- billing contact and address;
- financial responsible party;
- insurer/common payer references;
- migration and synchronization state.

Never copied:

- diagnosis or provisional diagnosis;
- symptoms, examination, treatment or clinical conduct;
- allergy, medical history or current treatment;
- laboratory result, sample or interpretation;
- complete prescription or dispensation instructions;
- confidential note or medical document content.

### Health invoice -> Core invoice projection

Allowed:

- financial number, dates and currency;
- payer business-party IDs;
- catalog item IDs and financial line descriptions;
- quantity, price, discount, tax and totals;
- payer-component amounts;
- permitted opaque source IDs and confidentiality level.

Not allowed in common invoice notes, journal descriptions, logs or notifications:

- diagnosis, symptoms or treatment;
- raw consultation note;
- lab result;
- prescription text;
- medical document title where it reveals a condition;
- unrestricted patient full name in push payloads.

## Access matrix

| Role family | General Core | Common Finance | Pharmacy regulated data | Health administrative billing | Clinical data | Medical documents |
|---|---:|---:|---:|---:|---:|---:|
| Finance | yes | yes | projected fields only | minimum billing fields | no | no |
| Pharmacist | relevant | own sale/payment summaries | yes | no by default | no | no |
| Health cashier/billing | relevant | invoice/payment scope | no by default | yes | no except explicitly required source labels | no |
| Clinician | relevant | limited patient invoice summary | internal pharmacy as granted | relevant | yes as granted | yes as granted |
| Sector quality | relevant | limited financial consequence | incident scope | incident scope | restricted by incident permission | restricted |
| Organization owner/admin | configuration only; no automatic sensitive bypass | explicit permissions required | explicit permissions required | explicit permissions required | no automatic access | no automatic access |

## API and service rules

1. Every read applies organization, active membership, module, entitlement, permission and classification checks.
2. Finance APIs return opaque sector links unless the caller also has the sector permission.
3. Sector adapters accept explicit DTOs or source IDs from allow-lists; they never serialize whole clinical records into the Core.
4. Audit and API logs contain bounded identifiers, statuses and error codes, never clinical payloads.
5. Backfill reports list IDs and counters only; they do not print patient names, diagnoses, prescriptions or medical document metadata.
6. Push notifications use generic locked text for sensitive events.
7. `EnterpriseDocument` may store general financial/procurement documents. Health medical files remain in `HealthDocument` and are served only by Health authorization.
8. Entity links do not grant access to the linked object.

## Notification examples

Allowed:

- `Une facture médicale nécessite une validation.`
- `Un paiement Pharmacy n’a pas pu être rapproché.`
- `Une synchronisation sectorielle requiert une action manuelle.`

Forbidden:

- patient full name plus diagnosis;
- prescription content;
- laboratory result;
- complete bank or Mobile Money account;
- regulated-product incident details in a general push.

## Reporting rules

- Financial reports use common invoices, payments, receivables, payables and posted journal entries after cutover.
- Pharmacy operational reports may retain lot, expiry, FEFO and recall detail under Pharmacy permissions.
- Health reports expose financial totals by service/site/payer without diagnosis or clinical content.
- Any cross-sector export applies the most restrictive classification and an explicit export permission.
