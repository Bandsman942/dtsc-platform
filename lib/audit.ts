import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function jsonObject(value: Prisma.InputJsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.InputJsonValue> : null;
}

export async function writeAuditLog({
  userId,
  organizationId,
  requestId,
  action,
  entity,
  entityId,
  result = "SUCCESS",
  reasonCode,
  riskLevel,
  before,
  after,
  metadata,
  request,
}: {
  userId?: string | null;
  organizationId?: string | null;
  requestId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  result?: "SUCCESS" | "DENIED" | "FAILED" | "PARTIAL";
  reasonCode?: string | null;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  request?: Request;
}) {
  const ipAddress =
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip") ||
    null;
  const userAgent = request?.headers.get("user-agent") || null;
  const metadataObject = jsonObject(metadata);
  const resolvedOrganizationId = organizationId || (typeof metadataObject?.organizationId === "string" ? metadataObject.organizationId : null);
  const resolvedRequestId = requestId || request?.headers.get("x-request-id") || request?.headers.get("x-vercel-id") || null;

  return prisma.auditLog
    .create({
      data: {
        userId: userId || null,
        organizationId: resolvedOrganizationId,
        requestId: resolvedRequestId,
        action,
        entity,
        entityId: entityId || null,
        result,
        reasonCode: reasonCode || null,
        riskLevel: riskLevel || null,
        beforeJson: before,
        afterJson: after,
        metadata: metadata || undefined,
        ipAddress,
        userAgent,
      },
    })
    .catch((error) => {
      console.error("Audit log failed", error);
      return null;
    });
}

export async function writeApiLog({
  request,
  statusCode,
  userId,
  startedAt,
  metadata,
}: {
  request: Request;
  statusCode: number;
  userId?: string | null;
  startedAt?: number;
  metadata?: Prisma.InputJsonValue;
}) {
  const url = new URL(request.url);
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent") || null;

  return prisma.apiLog
    .create({
      data: {
        method: request.method,
        path: url.pathname,
        statusCode,
        userId: userId || null,
        durationMs: startedAt ? Date.now() - startedAt : null,
        ipAddress,
        userAgent,
        metadata: metadata || undefined,
      },
    })
    .catch((error) => {
      console.error("API log failed", error);
      return null;
    });
}
