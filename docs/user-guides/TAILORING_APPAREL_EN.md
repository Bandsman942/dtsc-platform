# Guide utilisateur — Tailoring, garment making & apparel

**Contrat de guide DTSC v2**

## Objectif et périmètre

The **Tailoring, garment making & apparel** business subtype extends `MANUFACTURING` without duplicating DTSC ERP common data. Customers, catalog items, sites, warehouses, inventory, employees, sales, procurement and finance remain owned by their canonical ERP modules. Tailoring modules own only workshop-specific data: measurements, styles/patterns, size grading, material profiles, cutting, fittings, alterations, garment tracking and finishing.

Setup is available from **Tailoring overview** through an eight-step checklist recalculated from the company’s actual data: identity; sites and warehouses; team; catalog; initial stock; finance; production; Tailoring configuration. The assistant never silently creates common master data; every incomplete step links back to the module that owns the missing data.

### Tailoring operating modes

- **SUR_MESURE** (`MADE_TO_MEASURE`): customer-specific measurements and fitting workflow.
- **PRET_A_PORTER** (`READY_TO_WEAR`): size grading and batch-oriented apparel production.
- **MIXTE** (`MIXED`): both workflows coexist in the same workshop.

The operating mode is a business-subtype setting, not a separate DTSC sector.

### Recommended operational flow

Create the finished garment and materials in **Catalog**. Define components in **Bills of materials**. Define operations and work centers in **Production routings**. In **Styles & patterns**, connect the Tailoring style to its catalog item, BOM and routing when applicable.

For made-to-measure work, create or select the customer in **CRM / Customers**, then save an active measurement profile. Previous measurements are retained as history rather than overwritten.

Create the order in **Production orders**. Material requirements are derived from the BOM and use canonical inventory. Submit and approve the order according to permissions. Create a **cutting plan** linked to the production order and fabric. After cutting is completed, create garment bundles and move them through the workshop. Physical waste must be recorded through Manufacturing/Inventory flows; cutting never edits stock balances directly.

For made-to-measure work, schedule a fitting. An `ADJUSTMENTS_REQUIRED` result allows an alteration to be created. Finishing status `READY` requires every finishing check plus a passing Manufacturing quality check. The garment bundle then becomes `READY_FOR_DELIVERY`. Sales, collection and accounting remain in the shared commercial and finance modules.

## Accès et permissions

Access depends on the active organization, subscription, enabled modules and the user's role or position. Tailoring setup is restricted to authorized tenant administrators because the readiness view aggregates configuration signals from HR, Inventory, Finance and Manufacturing.

The Enterprise AI assistant may read Manufacturing/Tailoring modules only when the current user has the same access. Controlled operational actions run through the DTSC **Tool Gateway** and require explicit structural confirmation before mutation. They can include production-order submission, fitting completion, alteration progression and finishing updates. The AI cannot bypass the module access resolver, subscription entitlements, active organization context or confirmation requirements.

## Statuts, validations et traçabilité

Production orders, fittings, alterations, garment bundles and finishing records follow their authorized business transitions. Optimistic revisions prevent silent concurrent overwrites. Important operational mutations produce the audit traces required by their domain contracts.

Commercial readiness uses three levels. `BETA` means the capability is still under validation. `READY` means the product contract, modules, controls and automated QA exist but final commercialization evidence is not yet complete. `COMMERCIAL_READY` may only be promoted after proven CI and owner E2E validation of the path: DTSC creation → invitation → onboarding → order → production → delivery → finance.

## Sécurité et confidentialité

Every reference is tenant-scoped. Customers, catalog items, inventory, employees and finance data are never copied into a second Tailoring source of truth. DTSC Administration configures sector, subtype, template and subscription without reading the tenant's private operational data. AI mutation tools require structural confirmation, are idempotent and use sensitive audit classification.

Inventory remains authoritative in the Inventory module; production movements use Manufacturing/Inventory contracts. Accounting remains authoritative in Finance. Employee data remains authoritative in Human Resources. Cross-module links are validated server-side and must belong to the same tenant.

## Dépannage

- **A setup step remains incomplete**: open its link and complete the data in the indicated canonical module.
- **A material is missing**: confirm it is active, inventory-tracked and belongs to the same organization.
- **Initial stock is not recognized**: confirm an active inventory item and a positive balance exist in the selected warehouse.
- **Finance remains incomplete**: review functional currency, fiscal year/period, chart of accounts, mappings and journals.
- **A made-to-measure fitting is blocked**: verify active measurements and the fitting status.
- **Finishing cannot reach READY**: complete all checks and link a Manufacturing quality result of `PASS`.
- **The AI does not offer an action**: verify the plan, Enterprise AI access, the target module and the user's permissions.
