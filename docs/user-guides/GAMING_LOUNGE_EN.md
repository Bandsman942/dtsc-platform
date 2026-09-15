# User guide — Gaming Lounge

**DTSC guide contract v2**

## Purpose and scope

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

## Access, roles and security

Recommended Gaming positions are a starting point. Each position receives only explicitly provisioned permissions. A global DTSC role does not automatically grant access to private Gaming Lounge tenant data.

Sensitive mutations follow DTSC contracts: active organization, membership, compatible subtype, enabled module, entitlement, permission, same-origin checks, Zod validation, rate limits, revision/idempotency and audit where required.

## Commercial readiness

`COMMERCIAL_READY` is not an automatic marketing label. It is admissible only on the exact final head that passed CI and after `OWNER_E2E` for: DTSC creation → invitation → onboarding → 5 stations → booking → session → payment → daily close → breakdown/maintenance → report/AI.

The product must remain usable in FR/EN, light/dark, mobile 320/360/375/390/414, tablet and desktop.

## Troubleshooting

- **A checklist step remains incomplete**: open its deep link and complete the data in the canonical module.
- **A station is missing**: check the asset, organization scope, status and whether another Gaming profile already references it.
- **A session cannot start**: check availability, incident/maintenance state, booking conflicts and applicable pricing.
- **No price matches**: check the Catalog service, currency and an active rule covering the time slot.
- **Payment fails**: check Finance readiness, the financial account, currency and user permissions.
- **Daily close shows multiple currencies**: this is intentional; do not add them without an explicit FX rate.
- **AI hides Finance or Assets details**: the current user lacks the corresponding permissions.
