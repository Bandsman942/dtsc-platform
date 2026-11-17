import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canNavigateRetailInvoice, findRetailNavigationInvoice, matchesRetailInvoiceTarget, retailInvoiceNavigationHref } from "../lib/enterprise/retail/invoice-navigation.ts";

const target = { siteId: "store-A", invoiceId: "invoice-A", invoiceNumber: "FAC/2026 & 001" };
const row = (status, rights = {}) => ({ siteId: target.siteId, invoice: { id: target.invoiceId, number: target.invoiceNumber, status, outstandingAmount: "100" }, ...rights });
assert(matchesRetailInvoiceTarget(row("APPROVED"), target));
assert(!matchesRetailInvoiceTarget({ ...row("APPROVED"), siteId: "store-B" }, target));
assert(!matchesRetailInvoiceTarget({ ...row("APPROVED"), invoice: { ...row("APPROVED").invoice, id: "invoice-B" } }, target));
assert(canNavigateRetailInvoice("approvals", row("PENDING_APPROVAL", { canApprove: true })));
assert(!canNavigateRetailInvoice("approvals", row("PENDING_APPROVAL", { canApprove: false })));
assert(!canNavigateRetailInvoice("approvals", row("APPROVED", { canApprove: true })));
assert(canNavigateRetailInvoice("issue", row("APPROVED", { canIssue: true })));
assert(!canNavigateRetailInvoice("issue", row("APPROVED", { canIssue: false })));
assert(!canNavigateRetailInvoice("issue", row("PENDING_APPROVAL", { canIssue: true })));
assert(canNavigateRetailInvoice("collections", row("ISSUED", { canCollect: true }), true));
assert(canNavigateRetailInvoice("collections", row("PARTIALLY_PAID", { canCollect: true }), true));
assert(!canNavigateRetailInvoice("collections", row("PAID", { canCollect: true }), true));
assert(!canNavigateRetailInvoice("collections", row("APPROVED", { canCollect: true }), true));
assert(!canNavigateRetailInvoice("collections", row("ISSUED", { canCollect: false }), true));
assert(!canNavigateRetailInvoice("collections", row("ISSUED", { canCollect: true }), false));
const settled = row("ISSUED", { canCollect: true }); settled.invoice.outstandingAmount = "0";
assert(!canNavigateRetailInvoice("collections", settled, true));

const approvalHref = new URL(retailInvoiceNavigationHref("approvals", target), "https://test.example");
assert.equal(approvalHref.searchParams.get("section"), "approvals");
assert.equal(approvalHref.searchParams.get("invoiceView"), "approvals");
assert.equal(approvalHref.searchParams.get("siteId"), target.siteId);
assert.equal(approvalHref.searchParams.get("invoiceId"), target.invoiceId);
assert.equal(approvalHref.searchParams.get("invoiceNumber"), target.invoiceNumber);
assert.equal(new URL(retailInvoiceNavigationHref("issue", target), "https://test.example").searchParams.get("invoiceView"), "issue");
assert.equal(new URL(retailInvoiceNavigationHref("collections", target), "https://test.example").searchParams.get("section"), "collections");

const originalFetch = globalThis.fetch;
try {
  let calls = [];
  const approval = row("PENDING_APPROVAL", { canApprove: true });
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url, "https://test.example");
    calls.push(parsed);
    assert.equal(init.cache, "no-store");
    assert.equal(parsed.pathname, "/api/enterprise/org-A/retail/invoices/workflow");
    assert.equal(parsed.searchParams.get("view"), "approvals");
    assert.equal(parsed.searchParams.get("q"), target.invoiceNumber);
    assert.equal(parsed.searchParams.get("siteId"), target.siteId);
    return Response.json({ items: parsed.searchParams.get("page") === "1" ? [{ ...approval, siteId: "wrong-site" }] : [approval], pagination: { pageCount: 2 } });
  };
  assert.deepEqual(await findRetailNavigationInvoice("org-A", "approvals", target), approval);
  assert.equal(calls.length, 2);
  globalThis.fetch = async () => Response.json({ items: [row("PENDING_APPROVAL", { canApprove: false })], pagination: { pageCount: 1 } });
  assert.equal(await findRetailNavigationInvoice("org-A", "approvals", target), null);
  globalThis.fetch = async () => new Response("", { status: 403 });
  assert.equal(await findRetailNavigationInvoice("org-A", "issue", target), null);
  globalThis.fetch = async () => { throw Error("network"); };
  assert.equal(await findRetailNavigationInvoice("org-A", "collections", target), null);
  globalThis.fetch = async (url) => {
    assert.match(url, /\/retail\/invoices\?/);
    return Response.json({ checkoutReady: true, items: [settled], pagination: { pageCount: 1 } });
  };
  assert.equal(await findRetailNavigationInvoice("org-A", "collections", target), null);
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { throw Error("must not fetch"); };
  assert.equal(await findRetailNavigationInvoice("org-A", "approvals", target, controller.signal), null);
} finally { globalThis.fetch = originalFetch; }

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const register = read("components/enterprise/professional/retail-invoice-flow-workbench.tsx");
const queue = read("components/enterprise/professional/retail-invoice-approval-workbench.tsx");
const page = read("app/enterprise-modules/retail-page.tsx");
assert.match(register, /findRetailNavigationInvoice\(organizationId, view,/);
assert.match(register, /workflowLinks\.source === data/);
assert.match(register, /data\.checkoutReady && workflowLinks/);
assert.match(queue, /findRetailNavigationInvoice<QueueInvoice>\(organizationId, "issue", decided\)/);
assert.match(queue, /findRetailNavigationInvoice\(organizationId, "collections", issued, controller\.signal\)/);
assert.match(queue, /collectionProof\.allowed \?/);
assert.match(queue, /retailInvoiceNavigationHref\("collections", receipt\.target\)/);
assert.match(queue, /revision: target\.entry\.invoice\.revision/);
assert.match(page, /targetInvoiceId=\{options\?\.invoiceId\} targetInvoiceNumber=\{options\?\.invoiceNumber\}/);
assert.match(page, /getRetailPosSection\(options\?\.section, canManagePos, posCapabilities\)/);
assert.match(page, /hasExplicitRetailSelfApproval/);
console.log("PASS #1210 — exact POS invoice workflow links, assigned queue, issue/collection eligibility, denial, cancellation and encoding.");
