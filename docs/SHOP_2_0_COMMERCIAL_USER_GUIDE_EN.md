# User Guide — Shop 2.0 — Pricing, Promotions and Returns

## Who is this guide for?

This guide is for users of a `COMMERCE_RETAIL` organization with the `RETAIL_POS` module.

Depending on your position, you may be allowed to:

- view prices and sales;
- administer pricing rules;
- administer promotions;
- request a return;
- approve or reject a refund.

Visible actions depend on your permissions, but the server always rechecks authorization before any mutation.

## Open commercial control

From **Shop commissioning**, open:

**Shop 2 pricing, promotions and returns**

or go to:

`RETAIL_POS > Commercial control`

The workspace has three tabs:

1. **Pricing**;
2. **Promotions**;
3. **Returns & exchanges**.

---

## 1. Pricing

### Principle

A product’s base sale price is created in the common **Catalog**. Commercial control does not create a second price catalog: it defines when a canonical price applies at the POS.

### Add a rule

1. Open **Pricing**.
2. Select a canonical sale price.
3. If needed, enter:
   - minimum quantity;
   - maximum quantity;
   - channel;
   - priority.
4. Save.

The POS server then resolves the applicable price automatically.

### Tax-included prices

If the Catalog price is marked **tax included**, the POS keeps that value as the customer TTC/gross price and correctly extracts the net amount and tax. Tax is not added a second time.

### Overrides

A manual change to price, discount or tax is a business override.

It requires:

- the matching permission;
- an explicit reason;
- an audit trail.

Without an override reason, the server decision replaces stale values that may still be sent by an older browser UI.

---

## 2. Promotions

### Create a promotion

Open **Promotions**, then enter:

- code;
- French name;
- English name;
- type;
- target product(s);
- active period;
- optional coupon;
- discount parameters.

Available types:

- percentage;
- fixed amount;
- quantity break;
- Buy X Get Y;
- bundle.

### Example — 10% discount

1. Type: **Percentage**.
2. Target product: select the product.
3. Percentage: `10`.
4. Start: select activation date/time.
5. Save.

The promotion is applied server-side. Editing the total in the browser does not change the commercial rule.

### Usage

The promotion list displays status and usage. Redemptions are idempotent: retrying the same sale does not consume the promotion twice.

---

## 3. Request a partial return

Open **Returns & exchanges**.

### Steps

1. Select the original sale.
2. Select the sale line.
3. Enter quantity to return.
4. Select product condition.
5. Select stock disposition.
6. Select refund method.
7. Add a reason.
8. Submit.

The request becomes **Pending approval**.

### Returnable quantity

The system accounts for:

- originally sold quantity;
- completed returns;
- pending return requests.

The same unit therefore cannot be returned twice.

### Product condition

Available values:

- sellable;
- opened;
- damaged;
- defective;
- expired;
- other.

### Stock disposition

- **Restock**: puts the quantity back into Inventory and reverses the related valuation;
- **Scrap**: does not put the product back into sellable stock;
- **No stock effect**: for non-stock or explicitly controlled cases.

---

## 4. Exchange

An exchange is a return linked to a real replacement sale.

1. Choose **Exchange**.
2. Select the original sale.
3. Select the replacement sale.
4. Complete the returned lines.
5. Submit the request.

The replacement sale must belong to the same organization and use the same currency.

---

## 5. Approve a return

Approval is independent from the request.

The requester cannot approve their own refund.

An authorized user opens the **Pending approval** queue and either:

- selects **Approve & refund**; or
- enters a rejection reason and selects **Reject**.

When approved, DTSC Platform:

1. applies the configured stock movement;
2. refunds through an authorized financial account;
3. creates treasury traces;
4. posts the return to common Finance;
5. reverses COGS/Inventory for restocked quantities;
6. preserves the history.

---

## 6. Refund methods

Available in this iteration:

- original sale tender(s);
- cash;
- Mobile Money;
- bank transfer;
- card through an authorized bank/clearing account.

A cash refund requires an open cash session for the user executing the refund.

### Why is store credit not available yet?

Store credit cannot be a label only. It needs a real spendable balance, expiration, double-spend protection and financial history. That domain is planned for Shop 2.0 Iteration 3.

---

## 7. Common errors

### “No applicable price”

Check the active Catalog sale price, currency and effective dates.

### “Tax configuration required”

A taxable product needs a common tax code and an active rate for the sale date.

### “Return quantity exceeded”

Part of the line has already been returned or is reserved by a pending request.

### “Self approval forbidden”

Ask another responsible user with refund permission to approve the return.

### “Invalid refund account”

Check account type, currency, status and available operational balance.

---

## 8. Not included yet

The following belong to later Shop 2.0 iterations:

- loyalty and points;
- advanced customer-linked coupons;
- gift cards;
- store credit;
- asynchronous PSP/webhooks;
- POS hardware;
- connected Mobile Money/Telco providers;
- offline mode;
- omnichannel;
- advanced multi-store;
- country packs.
