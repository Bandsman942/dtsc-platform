import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function writeAuditLog({
  userId,
  action,
  entity,
  entityId,
  metadata,
  request,
}: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  request?: Request;
}) {
  const ipAddress =
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip") ||
    null;
  const userAgent = request?.headers.get("user-agent") || null;

  return prisma.auditLog
    .create({
      data: {
        userId: userId || null,
        action,
        entity,
        entityId: entityId || null,
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
