# ERP Sector Workflow Adapters

## Security model

Sector workflow adapters are statically registered. They never choose a Prisma model from browser input, evaluate JavaScript, execute arbitrary SQL or call arbitrary HTTP endpoints.

Each adapter:

- loads an entity by `organizationId` and ID;
- exposes an allow-list of condition fields;
- exposes an allow-list of placeholders;
- exposes an allow-list of domain events and actions;
- calls a sector or common business service;
- reloads the entity after the action;
- remains idempotent and tenant-scoped.

Clinical fields are not exposed as generic workflow condition fields.

## Pharmacy entities

Progressively supported:

- `PharmacyPurchaseOrder`
- `PharmacyReceipt`
- `PharmacySale`
- `PharmacyRefund`
- `PharmacyCashSession`
- `PharmacyQualityIncident`
- `PharmacyStockMovement`

Safe actions first include convergence to common purchase/receipt/invoice/cash services. Regulated status changes continue through Pharmacy business services and are never written directly by the Workflow Engine.

## Health entities

Progressively supported:

- `HealthAppointment`
- `HealthConsultation`
- `HealthLabRequest`
- `HealthMedicalInvoice`
- `HealthPatientInsuranceCoverage`
- `HealthQualityIncident`

Health adapters expose only administrative identifiers, status, priority, assignee/service references and bounded financial fields where appropriate. Diagnosis, symptoms, results, prescriptions and notes are excluded from generic conditions and templates.

## Draft templates

The following templates may be seeded as drafts only:

1. Pharmacy order -> validation -> receipt -> quality control -> stock -> supplier invoice.
2. Sensitive Pharmacy sale -> pharmacist validation -> invoice -> payment -> stock issue.
3. Medical invoice -> control -> insurance coverage -> issue -> patient/insurer payment.
4. Critical Health incident -> assignment -> task -> resolution approval.

No template is automatically published or activated. Publication requires explicit authorized review.

## Error handling

Adapters classify failures as business, security, configuration, transient or terminal errors. Retries preserve the same workflow/action idempotency key and do not duplicate a common document or posting.

## Iteration 5

Iteration 5 will remove obsolete legacy workflow adapters, temporary compatibility actions and cutover-only triggers after all sectors use one authoritative business route.
