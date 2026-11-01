import type { SessionPayload } from "@/lib/session";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DTSC_INTERNAL_ORGANIZATION_ID, isDtscInternalSession } from "@/lib/organizations";
import { CONSOLE_CAPABILITIES, getConsoleAccessDecision } from "@/lib/console/console-capabilities";
import { getAppSettings } from "@/lib/settings";
import { parseAdminRoleAccess } from "@/lib/admin-access";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { paymentError } from "./payment-errors";
import type { PaymentAction, PaymentContext, PaymentTarget } from "./payment-types";

async function assertActiveActor(session: SessionPayload) {
  const user = await prisma.user.findFirst({ where: { id: session.userId, status: "ACTIVE" }, select: { id: true } });
  if (!user) paymentError("PAYMENT_ACCESS_DENIED");
}

/** Always verify a live authenticated cookie; a client-supplied actor ID is never authority. */
export async function assertPaymentMutationBoundary(context: PaymentContext, operation: string) {
  const session = await getSession();
  if (!session || session.userId !== context.session.userId) paymentError("PAYMENT_UNAUTHENTICATED");
  if (session.role !== context.session.role || session.activeContext !== context.session.activeContext ||
    session.activeOrganizationId !== context.session.activeOrganizationId ||
    session.activeOrganizationRole !== context.session.activeOrganizationRole) {
    paymentError("PAYMENT_ACCESS_DENIED");
  }
  if (!isSameOriginRequest(context.request)) paymentError("PAYMENT_ACCESS_DENIED");
  const limited = await rateLimit(getRateLimitKey(context.request, `payments:${operation}:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) paymentError("PAYMENT_RATE_LIMITED");
  await assertActiveActor(session);
}

/**
 * Billing is a platform entitlement: requiring a *current* paid subscription here
 * would prevent lapsed organizations from renewing it. Business ERP entitlements
 * continue to be enforced by their independent EnterprisePayment service.
 */
export async function assertPaymentTargetAccess(session: SessionPayload, target: PaymentTarget, action: PaymentAction) {
  await assertActiveActor(session);
  if (action === "DECIDE" || action === "FINALIZE") paymentError("PAYMENT_ACCESS_DENIED");
  if (target.scope === "PERSONAL") {
    if (target.userId !== session.userId) paymentError("PAYMENT_ACCESS_DENIED");
    return;
  }
  if (session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== target.organizationId) {
    paymentError("PAYMENT_ACCESS_DENIED");
  }
  const member = await prisma.organizationMember.findFirst({
    where: {
      userId: session.userId, organizationId: target.organizationId, status: "ACTIVE", removedAt: null,
      organization: { organizationType: "CLIENT", status: "ACTIVE", deletedAt: null },
    },
    select: { role: true },
  });
  if (!member) paymentError("PAYMENT_ACCESS_DENIED");
  // SaaS billing is a sensitive OWNER/ADMIN workspace even for read-only views.
  if (member.role !== "OWNER" && member.role !== "ADMIN") paymentError("PAYMENT_ACCESS_DENIED");
}

/** Console staff do not inherit client-tenant access from their global role. */
export async function assertInternalPaymentAccess(session: SessionPayload, action: "READ" | "MANAGE" | "VALIDATOR") {
  if (!isDtscInternalSession(session)) paymentError("PAYMENT_ACCESS_DENIED");
  await assertActiveActor(session);
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: session.userId, organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null,
      organization: { organizationType: "DTSC_INTERNAL", status: "ACTIVE", deletedAt: null },
    },
    select: { id: true },
  });
  if (!membership) paymentError("PAYMENT_ACCESS_DENIED");
  if (action === "VALIDATOR") {
    const employee = await prisma.hrcfoEmployee.findFirst({ where: { userId: session.userId, status: "ACTIVE" }, select: { id: true } });
    if (!employee) paymentError("PAYMENT_VALIDATOR_REQUIRED");
    return;
  }
  const settings = await getAppSettings();
  const decision = await getConsoleAccessDecision({
    user: { id: session.userId, role: session.role },
    capability: action === "READ" ? CONSOLE_CAPABILITIES.SUBSCRIPTIONS_READ : CONSOLE_CAPABILITIES.SUBSCRIPTIONS_MANAGE,
    adminRoleAccess: parseAdminRoleAccess(settings.adminRoleAccess),
  });
  if (!decision.allowed) paymentError("PAYMENT_ACCESS_DENIED");
}

export async function assertPaymentOwnerOrInternal(session: SessionPayload, payment: { userId: string; organizationId: string | null }) {
  if (isDtscInternalSession(session)) return assertInternalPaymentAccess(session, "READ");
  return assertPaymentTargetAccess(session,
    payment.organizationId ? { scope: "ORGANIZATION", organizationId: payment.organizationId } : { scope: "PERSONAL", userId: payment.userId },
    "READ");
}
