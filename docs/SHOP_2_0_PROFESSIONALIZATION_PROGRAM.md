# DTSC Platform — Shop 2.0 Professionalization Program

GitHub epic: #122

Execution issues:

- #123 — Iteration 1/4: Retail Core, internationalization, accounting, performance and P0 QA
- #124 — Iteration 2/4: pricing, tax, promotions, returns and commercial controls
- #125 — Iteration 3/4: retail customer, loyalty, payments, hardware and operators
- #126 — Iteration 4/4: offline, omnichannel, multi-store, country packs and global certification

## Product direction

`COMMERCE_RETAIL` is the sector. `RETAIL_CORE` is the universal retail business profile. Mobile Money and Telco are optional Retail extensions and must not define the whole sector.

The existing `RETAIL_TELCO_MOBILE_MONEY` profile remains a compatibility and specialized business profile for tenants that use both extensions. Existing tenants must not lose configuration, providers, mappings, balances, permissions or operational history during the Shop 2.0 transition.

## Architecture target

```text
COMMERCE_RETAIL
└── RETAIL_CORE
    ├── POS
    ├── CRM customers
    ├── catalog
    ├── sites / warehouses
    ├── inventory
    ├── suppliers / purchases
    ├── finance / treasury / cash
    ├── daily close
    └── reports

Optional extensions
├── MOBILE_MONEY
└── TELCO
```

Later iterations add dedicated Retail domains for pricing/promotions, returns/refunds, loyalty/gift cards/store credit, provider payments, device integration and offline/omnichannel orchestration. They must reuse the canonical ERP domains instead of creating parallel sources of truth.

## Iteration 1 — foundations and P0 risk removal

The first iteration must be additive first and keep the current Shop commercially usable while the new profile contract is introduced.

Required outcomes:

1. `RETAIL_CORE` is a canonical profile contract independent from Mobile Money and Telco.
2. Existing `RETAIL_TELCO_MOBILE_MONEY` tenants remain supported during the transition.
3. Phone and locale handling no longer contain global DRC-only assumptions.
4. POS accounting is proven by integration tests for revenue, tax, COGS, inventory and reversal.
5. Retail dashboard loaders are module-scoped and do not load unrelated domains before response filtering.
6. POS product search is server-side and paginated rather than limited to the first bootstrap products.
7. Sale preparation avoids N+1 lookups inside serializable transactions.
8. Retail rate limits are action-specific and compatible with real store throughput.
9. Dead legacy Retail workspace code is removed only after dependency proof.
10. Behavioral, concurrency, security and performance QA become part of the delivery gates.

## Iteration 2 — commercial engine

Introduce a server-authoritative Retail pricing engine using canonical catalog prices, effective dates and tenant context. Tax must be resolved automatically and no longer treated as a manual override by default.

Add dedicated promotions and transactional partial returns/refunds/exchanges with granular permissions and complete accounting/stock reversals.

## Iteration 3 — customer and store experience

Expose canonical CRM customers in POS, then add loyalty, coupons, gift cards and store credit as dedicated Retail domains. Introduce provider payment adapters and a separate POS device layer.

Mobile Money and Telco evolve from manual reconciliation-compatible operations toward optional asynchronous provider adapters with signed webhooks, idempotency, retries and reconciliation.

## Iteration 4 — resilient global retail

Add a secure offline engine, cross-store stock visibility, reservations and omnichannel order flows by reusing common Sales/Fulfillment objects.

Country packs contain local fiscal behavior; Retail Core must stay country-neutral. Self-service onboarding is added without inventing financial accounts, balances or regulatory data.

## Commercial maturity

The existing Shop `COMMERCIAL_READY` status describes the currently accepted feature set. Shop 2.0 does not remove that status while the migration is additive and backwards compatible.

A future global commercial maturity level may only be introduced after explicit owner acceptance and automated evidence for accounting, concurrency, security, performance, returns, payments, offline, multi-store, omnichannel and localization.

## Delivery contract

Every iteration follows `AGENTS.md`:

branch → checks → commits → push → PR → Quality Gates → review → merge into `main` → Production deployment from `main` only.

No direct feature development on `main`, no destructive migration shortcut, no test neutralization and no legacy dual-write are allowed.
