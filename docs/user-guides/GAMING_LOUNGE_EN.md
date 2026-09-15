# Guide utilisateur — Gaming Lounge

**Contrat de guide DTSC v2**

## Objectif et périmètre

`HOSPITALITY_EVENTS -> GAMING_LOUNGE` supports gaming lounges, console rooms and e-sport operations without parallel master data. Customers remain in CRM, services in Catalog, sites in Sites, PlayStations/TVs/controllers/UPS devices in Assets & maintenance, payments/accounts in Finance, physical goods in Inventory, and reports in the shared Reports framework.

The Gaming domain adds only business-specific concepts: a station profile linked to an asset, timed session, booking, pricing rule, checkout linked to canonical Finance objects, Gaming daily close, tournament and analytical projections.

## Eight-step setup

From **Gaming overview**, the **Gaming Lounge setup** card checks real organization data. It never silently creates shared ERP master data.

1. **Identity & site**: complete the company identity and choose the primary operating site.
2. **5 stations & assets**: launch readiness expects five station profiles linked to five canonical assets. Five is never a product limit; the same workflow supports the sixth station and every station after it.
3. **Team & permissions**: use the recommended Gaming manager/admin, cashier/operator, technician and finance/accountant positions. Permissions are explicit and provide no global bypass.
4. **Catalog services**: create gaming-time offers as services in the shared Catalog.
5. **Pricing & packages**: configure one or more Gaming rules. Price calculation and pricing snapshots are server-authoritative.
6. **Finance & payments**: complete Finance readiness and configure at least one active financial account. No parallel Gaming cash account or tender is created.
7. **Bookings, sessions & checkout**: verify the operational modules are enabled and accessible under the current plan and permissions.
8. **Close, reports & DTSC AI**: use daily close, dashboard, reports, tournaments and authorized AI reads to complete the operating path.

## Daily operations

### Gaming stations

A Gaming station extends an `EnterpriseAsset`. Create the asset in **Assets & maintenance**, then link it in **Gaming stations**. Major incidents and maintenance can make a station unavailable according to domain rules. Archiving a Gaming profile never deletes the asset or its history.

### Bookings and sessions

A booking can be draft, confirmed, checked in, no-show, cancelled or converted to a session. Time-slot conflicts are enforced server-side. Booking-to-session conversion is idempotent.

Sessions use server timestamps. The browser is never the timer authority. A station cannot host two incompatible live sessions. Pause, resume, extension, transfer and end transitions are controlled and auditable.

### Pricing

Gaming rules reference active services in the shared Catalog. They may depend on duration, station, package, weekday and time slot. The applied rule, currency and relevant parameters are snapshotted to preserve historical explainability. Pricing exceptions require an explicit permission and reason.

### Checkout and daily close

An ended session becomes collectible through the shared commercial and Finance objects. Cash, Mobile Money, bank and split payments use authorized Finance accounts. Retries must not create duplicate sales or payments.

Gaming daily close compares sessions and collections by currency and payment method. CDF, USD and every other currency stay separate unless an explicit FX conversion basis exists.

### Incidents and maintenance

From a station or session, use the shortcut to **Assets & maintenance**. In `Activities [Company]`, **Report a Gaming breakdown** and **Request maintenance** route to the canonical Assets domain; they do not create a second Gaming maintenance system.

### Tournaments and reports

Identified participants come from shared CRM. Entry fees, when applicable, use Finance. Gaming reports are stored through `EnterpriseReport` and can cover station utilization, revenue by currency, off-peak periods, incidents/maintenance and bookings/no-shows.

## DTSC AI

The enterprise AI assistant can summarize Gaming performance only from sources the current user is already allowed to read. `ERP_GAMING_PERFORMANCE_READ` is read-only. It cannot bypass the plan, enabled modules, permissions, Finance rights or Assets rights. It reports factual observations and does not turn correlation into causation.

## Accès et permissions

Recommended Gaming positions are a starting point. Each position receives only explicitly provisioned permissions. A global DTSC role does not automatically grant access to private Gaming Lounge tenant data.

Access depends on the active organization, subscription, enabled modules and the user's role or position. Gaming setup is restricted to authorized tenant administrators because readiness aggregates configuration signals from Sites, Assets, HR, Catalog, Finance and Gaming modules.

The Enterprise AI assistant may read Gaming performance only when the current user has the same access. It cannot bypass the module access resolver, subscription entitlements, active organization context, or Finance/Assets permissions.

## Statuts, validations et traçabilité

Bookings, sessions, checkouts, daily closes, tournaments and station profiles follow their authorized business transitions. Optimistic revisions, idempotency keys, serializable transactions and database constraints protect sensitive operations from duplicate submissions and concurrent conflicts according to each domain contract.

Incidents and maintenance remain traceable in Assets. Invoices, payments, allocations, financial accounts and money movements remain traceable in Finance. Reports persist in the shared Reports framework. Important mutations produce the audit traces required by their contracts.

Commercial readiness is distinct from technical module status. `COMMERCIAL_READY` is admissible only on the exact final head that passed CI and after `OWNER_E2E` for the path: DTSC creation → invitation → onboarding → 5 stations → booking → session → payment → daily close → breakdown/maintenance → report/AI.

## Sécurité et confidentialité

Sensitive mutations follow DTSC contracts: active organization, membership, compatible subtype, enabled module, entitlement, permission, same-origin checks, Zod validation, rate limits, revision/idempotency and audit where required.

Every cross-module reference is tenant-scoped. Customers remain in CRM, services in Catalog, equipment and maintenance in Assets, financial data in Finance and reports in Reports. DTSC Administration configures sector, subtype, template and subscription without reading private tenant operational data.

Amounts in different currencies are never added implicitly. CDF, USD and other currencies remain separate unless an explicit Finance-governed FX conversion is available.

## Commercial readiness

The product must remain usable in FR/EN, light/dark, mobile 320/360/375/390/414, tablet and desktop. The checklist is recalculated from real organization data and routes incomplete steps to the owning canonical module; it does not manufacture demo records to hide missing configuration.

## Dépannage

- **A checklist step remains incomplete**: open its deep link and complete the data in the canonical module.
- **A station is missing**: check the asset, organization scope, status and whether another Gaming profile already references it.
- **A session cannot start**: check availability, incident/maintenance state, booking conflicts and applicable pricing.
- **No price matches**: check the Catalog service, currency and an active rule covering the time slot.
- **Payment fails**: check Finance readiness, the financial account, currency and user permissions.
- **Daily close shows multiple currencies**: this is intentional; do not add them without an explicit FX rate.
- **AI hides Finance or Assets details**: the current user lacks the corresponding permissions.
