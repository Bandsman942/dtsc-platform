import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
import { renderProfessionalPdfBytes } from "@/lib/reporting/professional-pdf-v2";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getActiveEnterpriseSelfEmployee } from "@/lib/enterprise/hr-payroll/self-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; payslipId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  const { organizationId, payslipId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "PAYROLL_OPERATIONS", action: "read", includeMutationCapabilities: false });
  if (!access) return new Response(null, { status: 403 });
  const employee = await getActiveEnterpriseSelfEmployee(session, organizationId);
  if (!employee) return new Response(null, { status: 403 });
  const payslip = await prisma.enterprisePayslip.findFirst({
    where: {
      id: payslipId, organizationId, status: "GENERATED",
      payrollItem: { is: { organizationId, employeeId: employee.id, payrollRun: { is: { organizationId, status: "APPROVED", archivedAt: null } } } },
    },
    select: {
      id: true, payslipNumber: true, generatedAt: true, currency: true,
      grossAmount: true, deductionAmount: true, netAmount: true,
      payrollItem: { select: {
        baseGrossAmount: true, bonusAmount: true, deductionAmount: true,
        payrollRun: { select: { reference: true, approvedAt: true, payrollPeriod: {
          select: { name: true, periodStart: true, periodEnd: true, payDate: true },
        } } },
      } },
    },
  });
  // No existence disclosure for another person's payslip or non-approved payroll.
  if (!payslip) return new Response(null, { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "fr";
  const en = lang === "en";
  const currency = payslip.currency;
  const money = (n: { toString(): string }) => `${n.toString()} ${currency}`;
  const period = payslip.payrollItem.payrollRun.payrollPeriod;
  const date = (d: Date | null) => d ? new Intl.DateTimeFormat(en ? "en-GB" : "fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d) : "—";
  const model: ProfessionalReportExportModel = {
    title: en ? "Personal payslip" : "Bulletin de paie individuel",
    subtitle: `${employee.displayName} · ${employee.employeeNumber} · ${payslip.payslipNumber}`,
    organizationName: "DTSC Platform · ERP",
    generatedLabel: `${en ? "Generated" : "Généré"} : ${date(payslip.generatedAt)}`,
    filenameBase: `payslip-${payslip.payslipNumber}`,
    accentHex: "#075985",
    filters: [
      { label: en ? "Period" : "Période", value: `${date(period.periodStart)} - ${date(period.periodEnd)}` },
      { label: en ? "Payroll approval" : "Approbation paie", value: date(payslip.payrollItem.payrollRun.approvedAt) },
    ],
    kpis: [
      { label: en ? "Gross" : "Brut", value: money(payslip.grossAmount) },
      { label: en ? "Deductions" : "Retenues", value: money(payslip.deductionAmount) },
      { label: en ? "Net payable" : "Net à payer", value: money(payslip.netAmount) },
      { label: en ? "Scheduled payday" : "Date prévue de paie", value: date(period.payDate) },
    ],
    columns: [{ key: "item", label: en ? "Component" : "Rubrique" }, { key: "amount", label: en ? "Amount" : "Montant" }],
    rows: [
      { item: en ? "Contractual base" : "Base contractuelle", amount: money(payslip.payrollItem.baseGrossAmount) },
      { item: en ? "Bonuses" : "Primes", amount: money(payslip.payrollItem.bonusAmount) },
      { item: en ? "Gross" : "Brut", amount: money(payslip.grossAmount) },
      { item: en ? "Deductions" : "Retenues", amount: money(payslip.payrollItem.deductionAmount) },
      { item: en ? "Net payable" : "Net à payer", amount: money(payslip.netAmount) },
    ],
    chart: [],
    insights: [{ title: en ? "Important" : "Information importante", body: en
      ? "Approved payroll is not evidence that a financial payment has been executed."
      : "Une paie approuvée ne constitue pas une preuve de décaissement financier." }],
  };
  const pdf = renderProfessionalPdfBytes(model);
  const buffer = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(buffer).set(pdf);
  await writeAuditLog({
    userId: session.userId, action: "ENTERPRISE_SELF_PAYSLIP_DOWNLOADED",
    entity: "EnterprisePayslip", entityId: payslip.id, request: req,
    metadata: { organizationId, employeeId: employee.id },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "my-hr-payslip-pdf" } });
  const safeName = payslip.payslipNumber.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  return new Response(buffer, { status: 200, headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="payslip-${safeName}.pdf"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
