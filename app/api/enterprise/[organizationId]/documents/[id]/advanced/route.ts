import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseDocument, getEnterpriseProcurementAccess } from "@/lib/enterprise/procurement/access";
import { getEnterpriseDocumentSignedDownload } from "@/lib/enterprise/procurement/document-service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getDocumentIndexFeatureStatus, getDocumentVisualComparisonFeatureStatus } from "@/lib/technical-debt/feature-gates";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("INDEX"), versionId: z.string().min(5).max(120).optional() }).strict(),
  z.object({ action: z.literal("COMPARE"), leftVersionId: z.string().min(5).max(120), rightVersionId: z.string().min(5).max(120) }).strict(),
]);

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const document = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [indexStates, comparisons] = await Promise.all([
    prisma.enterpriseDocumentIndexState.findMany({ where: { organizationId, documentId: id }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.enterpriseDocumentVersionComparison.findMany({ where: { organizationId, documentId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, documentId: id, domain: "document_advanced_tools" } });
  return NextResponse.json({
    features: { index: getDocumentIndexFeatureStatus(), comparison: getDocumentVisualComparisonFeatureStatus() },
    indexStates,
    comparisons: comparisons.map((comparison) => ({
      id: comparison.id,
      leftVersionId: comparison.leftVersionId,
      rightVersionId: comparison.rightVersionId,
      provider: comparison.provider,
      status: comparison.status,
      summaryJson: comparison.summaryJson,
      completedAt: comparison.completedAt,
      createdAt: comparison.createdAt,
      errorCode: comparison.errorCode,
    })),
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `document-advanced:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseProcurementAccess({ session, organizationId, moduleCode: "DOCUMENTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const document = await canAccessEnterpriseDocument({ organizationId, userId: session.userId, canManage: access.canManage, documentId: id });
  if (!document || (!access.canManage && document.createdByUserId !== session.userId && document.ownerUserId !== session.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Action documentaire avancée invalide." }, { status: 400 });

  if (parsed.data.action === "INDEX") {
    const feature = getDocumentIndexFeatureStatus();
    const version = parsed.data.versionId
      ? await prisma.enterpriseDocumentVersion.findFirst({ where: { id: parsed.data.versionId, organizationId, documentId: id } })
      : await prisma.enterpriseDocumentVersion.findFirst({ where: { organizationId, documentId: id, versionNumber: document.currentVersion } });
    if (!version) return NextResponse.json({ error: "VERSION_NOT_FOUND" }, { status: 404 });
    const state = await prisma.enterpriseDocumentIndexState.upsert({
      where: { organizationId_documentId_versionId: { organizationId, documentId: id, versionId: version.id } },
      update: { provider: process.env.DOCUMENT_INDEX_PROVIDER || "NOT_CONFIGURED", status: feature.available ? "PROCESSING" : "NOT_CONFIGURED", errorCode: feature.available ? null : "PROVIDER_NOT_CONFIGURED", errorMessage: feature.available ? null : feature.message },
      create: { organizationId, documentId: id, versionId: version.id, provider: process.env.DOCUMENT_INDEX_PROVIDER || "NOT_CONFIGURED", status: feature.available ? "PROCESSING" : "NOT_CONFIGURED", contentHash: version.checksum, errorCode: feature.available ? null : "PROVIDER_NOT_CONFIGURED", errorMessage: feature.available ? null : feature.message },
    });
    if (!feature.available) {
      await writeApiLog({ request: req, statusCode: 503, userId: session.userId, startedAt, metadata: { organizationId, documentId: id, action: "INDEX", configured: false } });
      return NextResponse.json({ error: "PROVIDER_NOT_CONFIGURED", message: feature.message, state }, { status: 503 });
    }
    try {
      const download = await getEnterpriseDocumentSignedDownload(organizationId, id, version.id);
      const providerResult = await callProvider(process.env.DOCUMENT_INDEX_ENDPOINT || "", process.env.DOCUMENT_INDEX_API_KEY || "", {
        operation: "index",
        sourceUrl: download.signedUrl,
        sourceUrlExpiresInSeconds: download.expiresInSeconds,
        document: { id, versionId: version.id, fileName: version.fileName, mimeType: version.mimeType, checksum: version.checksum, organizationReference: organizationId },
      });
      const updated = await prisma.enterpriseDocumentIndexState.update({
        where: { id: state.id },
        data: { status: "READY", chunkCount: safeInteger(providerResult.chunkCount), indexReference: safeString(providerResult.indexReference), indexedAt: new Date(), errorCode: null, errorMessage: null },
      });
      await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_INDEXED", entity: "EnterpriseDocumentIndexState", entityId: updated.id, request: req, metadata: { organizationId, documentId: id, versionId: version.id, provider: updated.provider, chunkCount: updated.chunkCount } });
      return NextResponse.json({ ok: true, state: updated });
    } catch (error) {
      const failed = await prisma.enterpriseDocumentIndexState.update({ where: { id: state.id }, data: { status: "FAILED", errorCode: "PROVIDER_REQUEST_FAILED", errorMessage: safeErrorMessage(error) } });
      await writeApiLog({ request: req, statusCode: 502, userId: session.userId, startedAt, metadata: { organizationId, documentId: id, action: "INDEX", providerFailed: true } });
      return NextResponse.json({ error: "PROVIDER_REQUEST_FAILED", message: "Le fournisseur d'indexation n'a pas terminé l'opération.", state: failed }, { status: 502 });
    }
  }

  const feature = getDocumentVisualComparisonFeatureStatus();
  if (parsed.data.leftVersionId === parsed.data.rightVersionId) return NextResponse.json({ error: "IDENTICAL_VERSIONS", message: "Choisissez deux versions différentes." }, { status: 400 });
  const versions = await prisma.enterpriseDocumentVersion.findMany({ where: { organizationId, documentId: id, id: { in: [parsed.data.leftVersionId, parsed.data.rightVersionId] } } });
  if (versions.length !== 2) return NextResponse.json({ error: "VERSION_NOT_FOUND" }, { status: 404 });
  const comparison = await prisma.enterpriseDocumentVersionComparison.upsert({
    where: { documentId_leftVersionId_rightVersionId: { documentId: id, leftVersionId: parsed.data.leftVersionId, rightVersionId: parsed.data.rightVersionId } },
    update: { provider: process.env.DOCUMENT_VISUAL_DIFF_PROVIDER || "NOT_CONFIGURED", status: feature.available ? "PROCESSING" : "NOT_CONFIGURED", requestedById: session.userId, errorCode: feature.available ? null : "PROVIDER_NOT_CONFIGURED", errorMessage: feature.available ? null : feature.message, completedAt: null },
    create: { organizationId, documentId: id, leftVersionId: parsed.data.leftVersionId, rightVersionId: parsed.data.rightVersionId, provider: process.env.DOCUMENT_VISUAL_DIFF_PROVIDER || "NOT_CONFIGURED", status: feature.available ? "PROCESSING" : "NOT_CONFIGURED", requestedById: session.userId, errorCode: feature.available ? null : "PROVIDER_NOT_CONFIGURED", errorMessage: feature.available ? null : feature.message },
  });
  if (!feature.available) {
    await writeApiLog({ request: req, statusCode: 503, userId: session.userId, startedAt, metadata: { organizationId, documentId: id, action: "COMPARE", configured: false } });
    return NextResponse.json({ error: "PROVIDER_NOT_CONFIGURED", message: feature.message, comparison }, { status: 503 });
  }
  try {
    const [left, right] = await Promise.all([
      getEnterpriseDocumentSignedDownload(organizationId, id, parsed.data.leftVersionId),
      getEnterpriseDocumentSignedDownload(organizationId, id, parsed.data.rightVersionId),
    ]);
    const providerResult = await callProvider(process.env.DOCUMENT_VISUAL_DIFF_ENDPOINT || "", process.env.DOCUMENT_VISUAL_DIFF_API_KEY || "", {
      operation: "compare",
      left: { sourceUrl: left.signedUrl, sourceUrlExpiresInSeconds: left.expiresInSeconds, versionId: left.version.id, fileName: left.version.fileName, mimeType: left.version.mimeType },
      right: { sourceUrl: right.signedUrl, sourceUrlExpiresInSeconds: right.expiresInSeconds, versionId: right.version.id, fileName: right.version.fileName, mimeType: right.version.mimeType },
      document: { id, organizationReference: organizationId },
    });
    const updated = await prisma.enterpriseDocumentVersionComparison.update({
      where: { id: comparison.id },
      data: { status: "READY", summaryJson: asJsonObject(providerResult.summary), visualDiffStoragePath: safeString(providerResult.visualDiffReference), completedAt: new Date(), errorCode: null, errorMessage: null },
    });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_DOCUMENT_VERSIONS_COMPARED", entity: "EnterpriseDocumentVersionComparison", entityId: updated.id, request: req, metadata: { organizationId, documentId: id, leftVersionId: updated.leftVersionId, rightVersionId: updated.rightVersionId, provider: updated.provider } });
    return NextResponse.json({ ok: true, comparison: updated });
  } catch (error) {
    const failed = await prisma.enterpriseDocumentVersionComparison.update({ where: { id: comparison.id }, data: { status: "FAILED", errorCode: "PROVIDER_REQUEST_FAILED", errorMessage: safeErrorMessage(error) } });
    await writeApiLog({ request: req, statusCode: 502, userId: session.userId, startedAt, metadata: { organizationId, documentId: id, action: "COMPARE", providerFailed: true } });
    return NextResponse.json({ error: "PROVIDER_REQUEST_FAILED", message: "Le fournisseur de comparaison n'a pas terminé l'opération.", comparison: failed }, { status: 502 });
  }
}

async function callProvider(endpoint: string, apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body) throw new Error(`Provider response ${response.status}`);
  return body;
}

function safeInteger(value: unknown) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
function safeString(value: unknown) { return typeof value === "string" && value.length <= 500 ? value : null; }
function safeErrorMessage(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "Unknown provider error"; }
function asJsonObject(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}
