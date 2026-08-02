import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { contractTransitionSchema } from "@/lib/enterprise/crm-sales/schemas";
import { transitionEnterpriseContract } from "@/lib/enterprise/crm-sales/service";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; contractId: string }> };

const DECISION_ACTIONS = new Set(["APPROVE", "REQUEST_CORRECTION", "REJECT"]);

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-contract-transition:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, contractId } = await params;
  const parsed = contractTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Action contractuelle invalide." }, { status: 400 });

  const isDecision = DECISION_ACTIONS.has(parsed.data.action);
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CONTRACTS", action: isDecision ? "read" : "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pendingApproval = isDecision ? await prisma.enterpriseApproval.findFirst({
    where: {
      organizationId,
      targetEntityType: "EnterpriseContract",
      targetEntityId: contractId,
      status: "PENDING",
      archivedAt: null,
    },
    orderBy: { requestedAt: "desc" },
    select: { id: true, approverUserId: true, requestedByUserId: true, revision: true },
  }) : null;
  if (isDecision && (!pendingApproval || pendingApproval.approverUserId !== session.userId)) {
    return NextResponse.json({ error: "Forbidden", message: "Seul le validateur sélectionné peut décider ce contrat." }, { status: 403 });
  }

  try {
    const before = await prisma.enterpriseContract.findFirst({
      where: { id: contractId, organizationId, archivedAt: null },
      select: { ownerUserId: true, createdByUserId: true, title: true, revision: true },
    });
    if (!before) return NextResponse.json({ error: "Not found", message: "Contrat introuvable." }, { status: 404 });

    const serviceInput = parsed.data.action === "REQUEST_CORRECTION"
      ? { ...parsed.data, action: "REJECT" as const }
      : parsed.data;
    const contract = await transitionEnterpriseContract(organizationId, contractId, session.userId, serviceInput);

    if (parsed.data.action === "REQUEST_CORRECTION" && pendingApproval) {
      await prisma.enterpriseApproval.updateMany({
        where: { id: pendingApproval.id, organizationId, status: "REJECTED" },
        data: { status: "RETURNED" },
      });
    }

    if (parsed.data.action === "SUBMIT" && parsed.data.approverUserId && parsed.data.approverUserId !== session.userId) {
      await notifyUser({
        userId: parsed.data.approverUserId,
        organizationId,
        type: "ENTERPRISE_APPROVAL",
        title: "Contrat à valider",
        body: contract.title,
        targetUrl: `/enterprise-modules/CONTRACTS?contract=${encodeURIComponent(contract.id)}&section=validation`,
        idempotencyKey: `contract-submit:${contract.id}:${contract.revision}`,
      });
    }

    const recipientUserId = pendingApproval?.requestedByUserId || before.ownerUserId || before.createdByUserId;
    if (recipientUserId && recipientUserId !== session.userId && parsed.data.action !== "SUBMIT") {
      const labels: Record<string, string> = {
        APPROVE: "Contrat approuvé",
        REQUEST_CORRECTION: "Corrections demandées sur le contrat",
        REJECT: "Contrat refusé",
        ACTIVATE: "Contrat activé",
        SUSPEND: "Contrat suspendu",
        RENEW: "Contrat renouvelé",
        TERMINATE: "Contrat résilié",
        ARCHIVE: "Contrat archivé",
      };
      await notifyUser({
        userId: recipientUserId,
        organizationId,
        type: "ENTERPRISE_CONTRACT",
        title: labels[parsed.data.action] || "Contrat mis à jour",
        body: parsed.data.reason ? `${contract.title} · ${parsed.data.reason.slice(0, 180)}` : contract.title,
        targetUrl: `/enterprise-modules/CONTRACTS?contract=${encodeURIComponent(contract.id)}&section=history`,
        idempotencyKey: `contract-transition:${contract.id}:${contract.revision}:${parsed.data.action}`,
      });
    }

    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_CONTRACT_${parsed.data.action}`, entity: "EnterpriseContract", entityId: contract.id, request: req, metadata: { organizationId, status: contract.status, reason: parsed.data.reason || null } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "contracts", action: parsed.data.action } });
    return NextResponse.json({ ok: true, contract });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "CONTRACT_TRANSITION_FAILED");
  }
}
