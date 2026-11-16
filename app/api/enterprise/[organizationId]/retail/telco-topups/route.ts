import { Prisma } from "@prisma/client";
import { financeBusinessDateRange } from "@/lib/enterprise/accounting/http";
import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prepareCommercialTelcoTopup } from "@/lib/enterprise/retail/commercial-guardrails";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailFailureOutcome, retailPendingOutcome, retailSuccessOutcome } from "@/lib/enterprise/retail/mutation-outcome";
import { createConnectedTelcoTopupOperation } from "@/lib/enterprise/retail/operator-orchestration";
import { telcoTopupCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createTelcoTopupWithPosting } from "@/lib/enterprise/retail/service";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "read");
  if (!auth.ok) return auth.response;
  // RETAIL store-isolated staff cannot export another boutique's operator
  // transactions. The topup has no siteId: attribute it only via its
  // canonical tender financial account's siteId, never by client-side hints.
  let visibleSites: Awaited<ReturnType<typeof retailFinanceReadSiteScope>>;
  try { visibleSites = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "VIEW_SALES"); }
  catch (error) { return retailErrorResponse(error, "RETAIL_SITE_ACCESS_DENIED"); }
  const permittedTenderAccountIds = visibleSites === null ? null : (await prisma.enterpriseFinancialAccount.findMany({
    where: { organizationId, siteId: { in: visibleSites }, archivedAt: null },
    select: { id: true },
  })).map((item) => item.id);
  const { page, pageSize, status, providerCode, search, from, to } = retailListParams(req);
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;
  if (search.length > 120) return NextResponse.json({ error: "TELCO_SEARCH_TOO_LONG", message: "Limitez la recherche à 120 caractères." }, { status: 400 });
  if (status && !["SUCCESS", "FAILED", "REVERSED"].includes(status)) {
    return NextResponse.json({ error: "TELCO_STATUS_INVALID", message: "Choisissez un statut Télécom valide." }, { status: 400 });
  }
  const effectiveFrom = dates.from || from;
  const effectiveTo = dates.to || to;
  const where: Prisma.EnterpriseTelcoTopupWhereInput = {
    organizationId,
    ...(permittedTenderAccountIds !== null ? { tenderFinancialAccountId: { in: permittedTenderAccountIds } } : {}),
    ...(status ? { status } : {}),
    ...(providerCode ? { providerCode } : {}),
    ...(effectiveFrom || effectiveTo ? { occurredAt: { ...(effectiveFrom ? { gte: effectiveFrom } : {}), ...(effectiveTo ? { lte: effectiveTo } : {}) } } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { offerLabel: { contains: search, mode: "insensitive" } }, { externalReference: { contains: search, mode: "insensitive" } }, { destinationPhone: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseTelcoTopup.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseTelcoTopup.count({ where }),
  ]);
  const masked = items.map((item) => { const phone = item.destinationPhone.length > 6 ? `${item.destinationPhone.slice(0, 4)}••••${item.destinationPhone.slice(-3)}` : item.destinationPhone; return { ...item, destinationPhone: phone, destinationPhoneMasked: phone }; });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", page } });
  return NextResponse.json({ items: masked, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "TELCO_TOPUPS", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const parsed = telcoTopupCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_TELCO_TOPUPS_INPUT_INVALID", req);
  try {
    const prepared = await prepareCommercialTelcoTopup(organizationId, parsed.data);
    if (prepared.executionMode === "CONNECTED") {
      const connected = await createConnectedTelcoTopupOperation(organizationId, auth.session.userId, prepared.input);
      if (!connected) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_CONNECTED", 409, { providerCode: prepared.input.providerCode });
      const finalized = connected.finalized?.kind === "TELCO_TOPUP" ? connected.finalized.topup : null;
      const failed = connected.operation.status === "FAILED";
      const pending = !failed && !finalized;
      const statusCode = failed ? 422 : pending ? 202 : connected.idempotent ? 200 : 201;
      await Promise.allSettled([
        writeAuditLog({
          userId: auth.session.userId,
          action: `ENTERPRISE_TELCO_PROVIDER_${connected.operation.status}`,
          entity: "EnterpriseRetailProviderOperation",
          entityId: connected.operation.id,
          request: req,
          metadata: {
            organizationId,
            providerCode: prepared.input.providerCode,
            offerLabel: prepared.input.offerLabel,
            saleAmount: String(prepared.input.saleAmount),
            currency: prepared.input.currencyCode,
            providerStatus: connected.operation.status,
            businessTopupId: finalized?.id || null,
            idempotent: connected.idempotent,
          },
        }),
        writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", action: "provider-initiate", providerStatus: connected.operation.status, finalized: Boolean(finalized), outcome: failed ? "FAILURE" : pending ? "PENDING" : "SUCCESS" } }),
      ]);
      if (failed) {
        return NextResponse.json(
          retailFailureOutcome("RETAIL_PROVIDER_FAILED", { mode: "CONNECTED", operation: connected.operation, topup: finalized, idempotent: connected.idempotent }),
          { status: statusCode },
        );
      }
      if (pending) {
        return NextResponse.json(
          retailPendingOutcome("RETAIL_PROVIDER_PENDING", { mode: "CONNECTED", operation: connected.operation, topup: finalized, idempotent: connected.idempotent }),
          { status: statusCode },
        );
      }
      return NextResponse.json(
        retailSuccessOutcome({ mode: "CONNECTED", operation: connected.operation, topup: finalized, idempotent: connected.idempotent }),
        { status: statusCode },
      );
    }

    const result = await createTelcoTopupWithPosting(organizationId, auth.session.userId, prepared.input);
    if (result.topup.status !== "SUCCESS") {
      const statusCode = result.idempotent ? 200 : 201;
      await Promise.allSettled([
        writeAuditLog({
          userId: auth.session.userId,
          action: "ENTERPRISE_TELCO_TOPUP_RECORDED",
          entity: "EnterpriseTelcoTopup",
          entityId: result.topup.id,
          request: req,
          metadata: {
            organizationId,
            number: result.topup.number,
            providerCode: result.topup.providerCode,
            status: result.topup.status,
            saleAmount: result.topup.saleAmount.toFixed(),
            operatorCost: result.topup.operatorCost.toFixed(),
            margin: result.topup.marginAmount.toFixed(),
            externalReference: result.topup.externalReference,
            idempotent: result.idempotent,
            mode: "MANUAL",
            journalEntryId: null,
          },
        }),
        writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", action: "create", mode: "MANUAL", outcome: "SUCCESS", journalEntryId: null } }),
      ]);
      return NextResponse.json(retailSuccessOutcome({ mode: "MANUAL", ...result, accounting: null }), { status: statusCode });
    }

    const accounting = result.accounting;
    const statusCode = result.idempotent ? 200 : 201;
    await Promise.allSettled([
      writeAuditLog({
        userId: auth.session.userId,
        action: "ENTERPRISE_TELCO_TOPUP_RECORDED",
        entity: "EnterpriseTelcoTopup",
        entityId: result.topup.id,
        request: req,
        metadata: {
          organizationId,
          number: result.topup.number,
          providerCode: result.topup.providerCode,
          status: result.topup.status,
          saleAmount: result.topup.saleAmount.toFixed(),
          operatorCost: result.topup.operatorCost.toFixed(),
          margin: result.topup.marginAmount.toFixed(),
          externalReference: result.topup.externalReference,
          idempotent: result.idempotent,
          mode: "MANUAL",
          journalEntryId: accounting?.entry.id || null,
        },
      }),
      writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "telco-topups", action: "create", mode: "MANUAL", outcome: "SUCCESS", journalEntryId: accounting?.entry.id || null } }),
    ]);
    return NextResponse.json(retailSuccessOutcome({ mode: "MANUAL", ...result, accounting: accounting ? { journalEntryId: accounting.entry.id, idempotent: accounting.idempotent } : null }), { status: statusCode });
  } catch (error) {
    return retailErrorResponse(error, "TELCO_TOPUP_CREATE_FAILED");
  }
}
