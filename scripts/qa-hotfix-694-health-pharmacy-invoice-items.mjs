import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };

const healthPath = "lib/enterprise/sector-convergence/health-billing-service.ts";
const pharmacyPath = "lib/enterprise/sector-convergence/pharmacy-finance-service.ts";
const health = read(healthPath);
const pharmacy = read(pharmacyPath);
const schema = read("prisma/enterprise-accounting.prisma");
const regression = read("scripts/qa-regression-checks.mjs");
const pkg = read("package.json");

function itemProjection(source, file) {
  const start = source.indexOf("const invoiceItems: Prisma.EnterpriseSalesInvoiceItemCreateWithoutSalesInvoiceInput[]");
  const end = source.indexOf("const invoice = await tx.enterpriseSalesInvoice.create", start);
  check(start >= 0, `#694 ${file}: missing checked nested item type`);
  check(end > start, `#694 ${file}: missing invoice create after checked item projection`);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

for (const [file, source] of [[healthPath, health], [pharmacyPath, pharmacy]]) {
  const projection = itemProjection(source, file);
  check(!projection.includes("organizationId"), `#694 ${file}: organizationId must be propagated by the parent invoice relation`);
  check(!projection.includes("salesInvoiceId"), `#694 ${file}: salesInvoiceId must be propagated by the parent invoice relation`);
  check(source.includes("items: { create: invoiceItems }"), `#694 ${file}: invoice must create the checked item projection through the parent relation`);
}

check(
  schema.includes('salesInvoice       EnterpriseSalesInvoice @relation(fields: [organizationId, salesInvoiceId], references: [organizationId, id], onDelete: Cascade)'),
  "#694 schema: EnterpriseSalesInvoiceItem must keep the composite parent relation that propagates tenant/invoice keys",
);
check(regression.includes('qa-hotfix-694-health-pharmacy-invoice-items.mjs'), "#694 must remain in canonical regression QA");
check(pkg.includes('"qa:hotfix-694"'), "#694 package QA command missing");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}

console.log("✅ Hotfix #694 vérifié : Health/Pharmacy nested invoice items use relation-safe checked Prisma inputs.");
