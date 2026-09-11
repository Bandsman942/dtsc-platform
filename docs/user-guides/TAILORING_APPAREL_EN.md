# DTSC Platform — Tailoring, garment making & apparel user guide

## 1. Purpose

The **Tailoring, garment making & apparel** business subtype extends `MANUFACTURING` without duplicating DTSC ERP common data. Customers, catalog items, sites, warehouses, inventory, employees, sales, procurement and finance remain owned by their canonical ERP modules. Tailoring modules own only workshop-specific data: measurements, styles/patterns, size grading, material profiles, cutting, fittings, alterations, garment tracking and finishing.

## 2. Eight-step setup

Open **Tailoring overview** and the **Tailoring setup** section. Progress is recalculated from actual tenant data and remains reconfigurable.

1. **Identity** — configure the company country and timezone.
2. **Sites and warehouses** — create at least one active site and warehouse in common master data.
3. **Team** — ensure an active organization member has an active employee record.
4. **Catalog** — create finished garments and required materials; enable inventory tracking for physical items.
5. **Initial stock** — connect tracked items to inventory and record starting quantities through canonical Inventory & logistics flows.
6. **Finance** — complete currency, chart of accounts, fiscal year/periods, mappings and required journals.
7. **Production** — configure Manufacturing default warehouses, at least one work center, one active BOM and one active routing.
8. **Tailoring configuration** — choose the operating mode and default measurement unit.

The onboarding assistant never silently creates common ERP data. Every incomplete step links back to the canonical owner module.

## 3. Tailoring operating modes

- **SUR_MESURE** (`MADE_TO_MEASURE`): customer-specific measurements and fitting workflow.
- **PRET_A_PORTER** (`READY_TO_WEAR`): size grading and batch-oriented apparel production.
- **MIXTE** (`MIXED`): both workflows coexist in the same workshop.

The operating mode is a business-subtype setting, not a separate DTSC sector.

## 4. Recommended operational flow

### Prepare the product

Create the finished garment and materials in **Catalog**. Define components in **Bills of materials**. Define operations and work centers in **Production routings**. In **Styles & patterns**, connect the Tailoring style to its catalog item, BOM and routing when applicable.

### Prepare made-to-measure work

Create or select the customer in **CRM / Customers**, then save an active measurement profile. Previous measurements are retained as history rather than overwritten.

### Launch production

Create the order in **Production orders**. Material requirements are derived from the BOM and use canonical inventory. Submit and approve the order according to the user's permissions.

### Cutting and workshop tracking

Create a **cutting plan** linked to the production order and fabric. After cutting is completed, create garment bundles and move them through the workshop. Physical waste must be recorded through Manufacturing/Inventory flows; cutting never edits stock balances directly.

### Fittings and alterations

For made-to-measure work, schedule a fitting. An `ADJUSTMENTS_REQUIRED` result allows an alteration to be created. Alteration transitions are controlled and use optimistic revisions.

### Finishing and delivery

Finishing status `READY` requires every finishing check plus a passing Manufacturing quality check. The garment bundle then becomes `READY_FOR_DELIVERY`. Sales, collection and accounting remain in the shared commercial and finance modules.

## 5. Enterprise AI assistant

The assistant may read Manufacturing/Tailoring modules only when the current user has the same access. Controlled actions run through the DTSC Tool Gateway and require explicit structural confirmation before mutation. Supported actions include production-order submission, fitting completion, alteration progression and finishing updates.

The AI cannot bypass the module access resolver, subscription entitlements, active organization context or confirmation requirements.

## 6. Controls and security

- Every reference is tenant-scoped.
- Common ERP data is never copied into a second Tailoring source of truth.
- Sensitive mutations are audited.
- Optimistic revisions prevent silent concurrent overwrites.
- DTSC Administration configures sector, subtype and subscription without reading the tenant's private operational data.

## 7. Commercial readiness

`BETA` means the capability is still under validation. `READY` means the product contract, modules, controls and automated QA exist but final commercialization evidence is not yet complete. `COMMERCIAL_READY` may only be promoted after proven CI and owner E2E validation of the path: DTSC creation → invitation → onboarding → order → production → delivery → finance.

## 8. Troubleshooting

- **A setup step remains incomplete**: open its link and complete the data in the indicated canonical module.
- **A material is missing**: confirm it is active, inventory-tracked and belongs to the same organization.
- **A made-to-measure fitting is blocked**: verify the active measurements and fitting status.
- **Finishing cannot reach READY**: complete all checks and link a Manufacturing quality result of `PASS`.
- **The AI does not offer an action**: verify the plan, Enterprise AI access, the target module and the user's permissions.
