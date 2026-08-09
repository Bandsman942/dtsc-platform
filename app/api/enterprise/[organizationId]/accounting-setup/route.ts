import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";
import { accountingSetupMutationSchema } from "@/lib/enterprise/accounting/accounting-program-schemas";
import {
  activateAccountingChart,
  createCustomChildAccount,
  deactivateCustomLedgerAccount,
  diffOrganizationChartAgainstTemplate,
  getAccountingChartReadiness,
  previewChartTemplateAdoption,
} from "@/lib/enterprise/accounting/chart-lifecycle-service";
import { adoptDraftChartTemplate } from "@/lib/enterprise/accounting/chart-template-application-service";
import { chartTemplateReference, DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE, listAccountingFrameworks, listChartTemplates } from "@/lib/enterprise/accounting/chart-template-registry";
import { applyRecommendedJournals } from "@/lib/enterprise/accounting/journal-template-registry";
import { COUNTRY_ACCOUNTING_OVERLAYS } from "@/lib/enterprise/accounting/country-accounting-overlays";
import { accountingTemplateProductionReadiness, applySafeChartTemplateUpgrade, previewChartTemplateUpgrade } from "@/lib/enterprise/accounting/chart-version-migration-service";
import { getRegulatoryStatementSupport } from "@/lib/enterprise/accounting/regulatory-statements-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const chartId = url.searchParams.get("chartId");
    const previewTemplate = url.searchParams.get("previewTemplate");
    const upgradeTo = url.searchParams.get("upgradeTo");
    const [charts, regulatorySupport] = await Promise.all([
      prisma.enterpriseChartOfAccounts.findMany({ where: { organizationId }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], include: { _count: { select: { accounts: true, groups: true } } } }),
      getRegulatoryStatementSupport(organizationId),
    ]);
    const selectedChartId = chartId || charts.find((chart) => chart.status === "ACTIVE")?.id || charts[0]?.id || null;
    const [readiness, organizationDiff, adoptionPreview, upgradePreview] = await Promise.all([
      selectedChartId ? getAccountingChartReadiness(organizationId, selectedChartId) : null,
      selectedChartId && charts.find((chart) => chart.id === selectedChartId)?.templateCode ? diffOrganizationChartAgainstTemplate(organizationId, selectedChartId) : null,
      previewTemplate ? previewChartTemplateAdoption(organizationId, previewTemplate) : null,
      selectedChartId && upgradeTo ? previewChartTemplateUpgrade(organizationId, selectedChartId, upgradeTo) : null,
    ]);
    const templates = listChartTemplates({ status: "PUBLISHED" }).map((template) => ({
      code: template.code,
      version: template.version,
      reference: chartTemplateReference(template),
      frameworkCode: template.frameworkCode,
      nameFr: template.nameFr,
      nameEn: template.nameEn,
      effectiveFrom: template.effectiveFrom,
      countryScope: template.countryScope,
      entityTypes: template.entityTypes,
      sourceKind: template.source.kind,
      sourceAuthority: template.source.authority,
      accountCount: template.accounts.length,
      semanticMappingCount: template.semanticMappings.length,
      journalCount: template.journals.length,
      statementMappingCount: template.financialStatementMappings.length,
      productionReadiness: accountingTemplateProductionReadiness(chartTemplateReference(template)),
      isDefault: chartTemplateReference(template) === DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE,
    }));
    const items = (readiness?.diagnostics || []).map((diagnostic) => ({ id: diagnostic.code, code: diagnostic.code, status: diagnostic.ready ? "READY" : diagnostic.severity, description: diagnostic.messageFr, messageEn: diagnostic.messageEn, actionFr: diagnostic.actionFr || null, actionEn: diagnostic.actionEn || null }));
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "accounting-setup", chartId: selectedChartId } });
    return NextResponse.json({
      items,
      metrics: { charts: charts.length, templates: templates.length, blockers: readiness?.blockers.length || 0, warnings: readiness?.warnings.length || 0 },
      checklist: readiness ? Object.fromEntries(readiness.diagnostics.filter((diagnostic) => diagnostic.severity === "BLOCKER").map((diagnostic) => [diagnostic.code, diagnostic.ready])) : {},
      ready: readiness?.ready || false,
      frameworks: listAccountingFrameworks(),
      templates,
      defaultTemplateReference: DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE,
      charts,
      selectedChartId,
      readiness,
      organizationDiff,
      adoptionPreview,
      upgradePreview,
      regulatorySupport,
      countryOverlays: COUNTRY_ACCOUNTING_OVERLAYS,
      governance: {
        bootstrapWarning: false,
        officialDefaultReference: DEFAULT_ACCOUNTING_TEMPLATE_REFERENCE,
        futureVersionsRequireControlledMigration: true,
        messageFr: "SYSCOHADA révisé 2017 v0.1.0 est le plan comptable officiel par défaut de DTSC Platform. Toute nouvelle version est importée séparément, comparée puis migrée de manière contrôlée.",
        messageEn: "Revised SYSCOHADA 2017 v0.1.0 is the official default chart of accounts in DTSC Platform. Every new version is imported separately, compared, then migrated through a controlled process.",
      },
    });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNTING_SETUP_READ_FAILED");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = accountingSetupMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ACCOUNTING_SETUP_INPUT_INVALID", message: "Vérifiez les informations de configuration comptable puis réessayez." }, { status: 400 });
  try {
    let result: unknown;
    switch (parsed.data.action) {
      case "ADOPT_TEMPLATE": result = await adoptDraftChartTemplate(organizationId, auth.session.userId, parsed.data.chartId, parsed.data.templateReference); break;
      case "ACTIVATE_CHART": result = await activateAccountingChart(organizationId, parsed.data.chartId, auth.session.userId, parsed.data.revision); break;
      case "CREATE_CUSTOM_CHILD_ACCOUNT": result = await createCustomChildAccount(organizationId, parsed.data.chartId, auth.session.userId, parsed.data); break;
      case "DEACTIVATE_CUSTOM_ACCOUNT": result = await deactivateCustomLedgerAccount(organizationId, parsed.data.accountId, auth.session.userId, parsed.data.revision); break;
      case "APPLY_RECOMMENDED_JOURNALS": result = await prisma.$transaction((tx) => applyRecommendedJournals(tx, organizationId, auth.session.userId)); break;
      case "APPLY_SAFE_TEMPLATE_UPGRADE": result = await applySafeChartTemplateUpgrade(organizationId, parsed.data.chartId, parsed.data.targetTemplateReference, auth.session.userId, parsed.data.revision); break;
    }
    await writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_ACCOUNTING_${parsed.data.action}`, entity: "EnterpriseChartOfAccounts", entityId: "chartId" in parsed.data ? parsed.data.chartId : organizationId, request: req, metadata: { organizationId, accountingAction: parsed.data.action } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "accounting-setup", action: parsed.data.action } });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNTING_SETUP_UPDATE_FAILED");
  }
}
