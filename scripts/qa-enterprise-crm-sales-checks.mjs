import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-crm-sales.prisma",
  "lib/enterprise/crm-sales/leads.ts",
  "lib/enterprise/crm-sales/quotes.ts",
  "lib/enterprise/crm-sales/fulfillments.ts",
  "app/api/enterprise/[organizationId]/leads/route.ts",
  "app/api/enterprise/[organizationId]/quotes/route.ts",
  "app/api/enterprise/[organizationId]/sales-orders/route.ts",
]);
requireTokens("lib/enterprise/crm-sales/leads.ts", ["LEAD_MUST_BE_QUALIFIED", "convertedPartyId", "$transaction"]);
requireTokens("lib/enterprise/crm-sales/quotes.ts", ["QUOTE_MUST_BE_ACCEPTED", "lineSubtotal", "taxAmount", "convertedOrderId"]);
requireTokens("lib/enterprise/crm-sales/fulfillments.ts", ["FULFILLMENT_QUANTITY_EXCEEDED", "idempotencyKey", "PARTIALLY_FULFILLED"]);
forbidTokens("lib/enterprise/crm-sales/quotes.ts", ["invoice.create", "payment.create", "ledger"]);
success("enterprise CRM and sales chains");
