# Shop 2.0 User Guide — Offline, multi-store and omnichannel

## 1. Purpose

This guide explains the Shop 2.0 Iteration 4 capabilities exposed in the POS: controlled offline continuity, synchronization, omnichannel customer orders, country readiness and self-service onboarding.

## 2. Prepare offline mode

Offline mode must be prepared **while the device is connected**.

1. Open `RETAIL_POS`.
2. Make sure a cash session is open.
3. In **Controlled offline continuity**, select the warehouse.
4. Click **Prepare offline**.
5. The server resolves authoritative prices/taxes and Inventory availability, then the browser encrypts the snapshot on the device.

Snapshots expire. Reconnect and prepare a new snapshot after expiration.

### When offline checkout is blocked

Shop deliberately disables offline checkout when active promotions or dynamic pricing conditions exist. A disconnected device must not try to reproduce commercial rules that may have changed on the server.

## 3. Capture an offline sale

An offline entry is an **encrypted local draft**, not a final accounting sale.

1. Search the local catalog.
2. Add available quantities to the cart.
3. Review the total.
4. Click **Encrypt sale draft**.

Rules:

- `CASH` only;
- no CRM customer selection;
- no coupon;
- no manual price/discount override;
- no card, Mobile Money, Telco, gift card or store credit;
- server stock and accounting are not changed yet.

The device subtracts quantities already present in its `PENDING_SYNC` queue to reduce local oversell risk on that device.

## 4. Synchronization and conflicts

When connectivity returns, the POS automatically attempts to synchronize `PENDING_SYNC` drafts. Synchronization can also be triggered manually.

Possible results:

- `SYNCED`: the server revalidated and materialized the sale;
- `CONFLICT`: an authoritative condition changed, such as price, tax, stock, Finance readiness, period or cash session;
- `REJECTED`: the draft no longer satisfies an allowed contract;
- `PENDING_SYNC`: the server has not confirmed it yet.

Never force a conflict. Reconnect, refresh authoritative data, review stock/pricing/Finance and recreate the transaction when required.

## 5. Omnichannel customer orders

The **Omnichannel customer orders** panel creates a canonical customer order from the POS without creating a second Retail order engine.

### Supported modes

- **Click & Collect**;
- **Pickup at another store**;
- **Ship from store**;
- **Customer delivery**.

### Procedure

1. Choose a fulfillment mode.
2. Select the source site.
3. Select the fulfillment warehouse.
4. For pickup, select the requested pickup site.
5. Search and select a canonical CRM customer.
6. Search products available in the selected warehouse.
7. Add quantities to the order cart.
8. Optionally choose an expected fulfillment date/time.
9. Click **Confirm order & reserve stock**.

Search prices are indicative. The server reprices and recalculates tax on submit. The order is stored in `EnterpriseSalesOrder`; Inventory then creates canonical reservations for stock-tracked items.

If reservation fails, Shop does not present the order as guaranteed. Already-created reservations are compensated and the orchestration status exposes the failure.

## 6. Cross-channel status

The **Cross-channel status** section combines:

- canonical order reference and status;
- omnichannel mode;
- Retail orchestration status;
- Inventory reservation count;
- latest common fulfillment when available.

Fulfillment operations continue to use the common Sales/Fulfillment domain.

## 7. Country readiness and onboarding

The **Shop onboarding & country readiness** panel selects real existing tenant resources and evaluates readiness.

It checks:

- country pack;
- Finance functional currency;
- site;
- warehouse;
- cash financial account;
- catalog;
- Inventory links for tracked products;
- active team;
- POS accounting readiness;
- active Retail configuration.

**Activate proven core only** activates only the product capabilities already demonstrated by the country pack. It never upgrades an evidence-gated or uncertified capability into a compliance claim.

The onboarding assistant does not automatically create financial accounts, balances, sites, warehouses, tax rates or regulated records.

## 8. DRC country pack

`CD_RETAIL_CORE_V1` currently describes:

- localized Retail Core;
- CDF/USD multi-currency capability;
- tax references supplied by common tenant Finance configuration;
- organization-configurable numbering;
- fiscal receipt capability gated by evidence;
- e-invoicing not certified in Retail Core.

This matrix describes DTSC product capability. It is not legal or tax advice.

## 9. Operator practices

- prepare a fresh snapshot before known periods of unstable connectivity;
- do not share the same browser profile between cashiers;
- synchronize as soon as connectivity returns;
- resolve conflicts before accumulating a long queue;
- use omnichannel only with an identified CRM customer;
- verify reservation and fulfillment status before promising pickup/delivery;
- keep provider-authorized payments online.

## 10. Deliberate limits

Iteration 4 does not claim to:

- make provider payments work offline;
- guarantee remote inventory without server revalidation;
- automatically certify country tax/legal obligations;
- invent missing finance or regulated resources;
- turn the browser into a second business source of truth.
