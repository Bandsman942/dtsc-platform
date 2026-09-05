import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createJournalEntryDraft, listJournalEntries } from "@/lib/enterprise/accounting/journal-service";
import { journalEntryCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

type JournalListItem = {
  id: string;
  status: string;
  preparedByUserId: string;
  [key: string]: unknown;
};

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const input = financeListParams(req);
  const baseResult = recordId
    ? {
        items: await prisma.enterpriseJournalEntry.findMany({
          where: { organizationId, id: recordId },
          take: 1,
          include: { journal: true, fiscalPeriod: true, _count: { select: { lines: true } } },
        }),
        pagination: { page: 1, pageSize: 1, total: 0, pageCount: 1 },
      }
    : await listJournalEntries(organizationId, input);
  const rawItems = baseResult.items as JournalListItem[];
  const ids = rawItems.map((item) => item.id);
  const approvals = ids.length ? await prisma.enterpriseApproval.findMany({
    where: {
      organizationId,
      targetEntityType: "EnterpriseJournalEntry",
      targetEntityId: { in: ids },
      status: "PENDING",
      archivedAt: null,
    },
    select: { targetEntityId: true, approverUserId: true },
  }) : [];
  const assignedIds = new Set(approvals.filter((approval) => approval.approverUserId === auth.session.userId).map((approval) => approval.targetEntityId));
  const capabilities = auth.access.capabilities;
  const items = rawItems.map((item) => ({
    ...item,
    capabilities: {
      canSubmit: Boolean(capabilities.canSubmit && item.status === "DRAFT" && item.preparedByUserId === auth.session.userId),
      canApprove: Boolean(capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id)),
      canReject: Boolean(capabilities.canApprove && item.status === "PENDING_APPROVAL" && assignedIds.has(item.id)),
      canPost: Boolean(capabilities.canManage && item.status === "APPROVED"),
      canReverse: Boolean(capabilities.canManage && item.status === "POSTED"),
    },
  }));
  const pagination = recordId
    ? { page: 1, pageSize: 1, total: items.length, pageCount: 1 }
    : baseResult.pagination;

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "journal-entries", recordId: recordId || null } });
  return NextResponse.json({ items, pagination });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true, limit: 100 });
  if (!auth.ok) return auth.response;
  const parsed = journalEntryCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const entry = await createJournalEntryDraft(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_JOURNAL_ENTRY_CREATED", entity: "EnterpriseJournalEntry", entityId: entry.id, request: req, metadata: { organizationId, number: entry.number, totalDebit: entry.totalDebit.toFixed(), currency: entry.functionalCurrencyCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "journal-entries" } });
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "JOURNAL_ENTRY_CREATE_FAILED");
  }
}
