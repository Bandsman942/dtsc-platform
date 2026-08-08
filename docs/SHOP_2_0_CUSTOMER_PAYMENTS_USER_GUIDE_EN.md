# User Guide — Shop 2.0 — Customer, Loyalty, Payments and Devices

## Audience

This guide is for `COMMERCE_RETAIL` users with `RETAIL_POS` and, when sold, the Mobile Money/Telco extensions.

Visible actions depend on position and permissions. The server always rechecks authorization before a mutation.

## 1. Recognize a customer at the POS

In the POS customer bar:

1. search by name, code, email or phone;
2. select the customer;
3. review the Retail profile when needed;
4. build the basket and checkout.

The customer comes from common CRM. DTSC does not create a second Retail customer master.

A sale can remain a **walk-in sale** without a selected customer.

Quick customer creation is shown only to users who actually have CRM write authority.

## 2. Review customer history

Retail history consolidates:

- recent purchases;
- returns;
- totals per currency;
- loyalty accounts;
- customer-linked gift cards and store credit.

Different currencies are never added together arbitrarily.

## 3. Loyalty

A loyalty programme can define:

- points earned per currency unit;
- value per point;
- minimum redemption points;
- active period;
- optional tier;
- additional settings.

Automatic earning is applied only when the programme is **ACTIVE** and `autoEarn` is explicitly enabled.

During redemption, DTSC locks the account and rejects:

- insufficient balance;
- an idempotency key already used for a different effect;
- an inconsistent customer/programme relationship.

An approved return can reverse points earned on the related sale.

## 4. Gift cards and store credit

Two account types are available:

- `GIFT_CARD`;
- `STORE_CREDIT`.

At issue time, preserve the code delivered to the customer. DTSC does not store the bearer code in plaintext; only a lookup hash is persisted.

Redemption and refund are transactional. Concurrent requests cannot spend the same balance twice.

Always verify currency and expiry.

## 5. Provider-neutral payments

Payment transactions use explicit states:

`INITIATED → AUTHORIZED/CAPTURED/FAILED/VOIDED → REFUNDED`.

Invalid transitions are rejected.

External integrations never persist raw provider secrets in the database: only credential and webhook-secret references.

## 6. Mobile Money / Telco: MANUAL and CONNECTED

### MANUAL

Use this when no real partner adapter is connected. Execute the operation on the actual provider channel, then record it in DTSC following the control procedure.

### CONNECTED

DTSC initiates through a real adapter. Possible states are:

- `INITIATED`;
- `PENDING_PROVIDER`;
- `CONFIRMED`;
- `FAILED`;
- `UNKNOWN`;
- `RECONCILED`.

**Important:** `UNKNOWN` is never success.

No definitive till/float business effect is created before `CONFIRMED`.

## 7. Webhooks and reconciliation

Provider callbacks must be signed and verified by the adapter. Receiving the same event multiple times must not create multiple transactions.

For a timeout or `UNKNOWN` state, an authorized controller can run reconciliation. Retry counts and useful provider errors remain available for audit.

## 8. Customer receipt

A receipt is available after a sale:

- structured JSON for integration/sharing;
- print-friendly HTML with `format=html`.

It includes:

- ticket number/date;
- lines, quantities, prices, discounts and tax;
- total;
- payment methods;
- coupons/promotions;
- loyalty movements;
- gift card/store credit usage;
- related returns.

Customer email and phone are disclosed only when an active `RETAIL_RECEIPT_CONTACT` consent exists in the identity/consent domain.

No provider secret appears on a receipt.

## 9. POS devices

DTSC can register:

- barcode scanner;
- thermal receipt printer;
- cash drawer;
- payment terminal;
- customer display;
- scale.

The device layer supports browser, WebUSB, WebBluetooth, WebSerial, network, native bridge or manual modes.

When a browser API is unavailable, POS must remain usable and report a degraded mode instead of blocking the sale.

## 10. Important controls

- Never expose a gift-card/store-credit bearer code in a public comment or log.
- Never force `CONFIRMED` because a provider is slow.
- Never treat `UNKNOWN` as success.
- Never use a financial account in the wrong currency.
- Do not rely on hidden UI controls for security: backend authorization remains authoritative.
- For a financial correction, use a business reversal; never rewrite confirmed history.

## Remaining limits

Shop 2.0 Iteration 4 still covers offline, advanced omnichannel, global multi-store, country packs and `COMMERCIAL_READY_GLOBAL` certification.
