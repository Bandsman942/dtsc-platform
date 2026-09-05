import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createAssetAccountingProfile } from "@/lib/enterprise/accounting/asset-accounting-service";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { assetProfileSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const createSchema = assetProfileSchema.extend({ assetId: z.string().cuid() });

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ASSETS", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, status, search } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const assetMatches = search
    ? await prisma.enterpriseAsset.findMany({
        where: {
          organizationId,
          archivedAt: null,
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { serialNumber: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      })
    : [];

  const where: Prisma.EnterpriseAssetAccountingProfileWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { assetId: { in: assetMatches.map((item) => item.id) } } : {}),
  };
  const [profiles, total, allProfileAssetIds] = await Promise.all([
    prisma.enterpriseAssetAccountingProfile.findMany({
      where,
      orderBy: [{ status: "asc" }, { inServiceDate: "desc" }],
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      include: {
        schedules: { orderBy: { scheduledDate: "asc" }, take: 240 },
        disposals: { orderBy: { disposalDate: "desc" }, take: 5 },
      },
    }),
    prisma.enterpriseAssetAccountingProfile.count({ where }),
    prisma.enterpriseAssetAccountingProfile.findMany({
      where: { organizationId },
      select: { assetId: true },
    }),
  ]);

  const [availableAssets, assets] = await Promise.all([
    prisma.enterpriseAsset.findMany({
      where: {
        organizationId,
        archivedAt: null,
        id: { notIn: allProfileAssetIds.map((item) => item.assetId) },
      },
      orderBy: { name: "asc" },
      take: 250,
      select: {
        id: true,
        code: true,
        name: true,
        indicativeValue: true,
        acquisitionDate: true,
        currency: true,
        status: true,
      },
    }),
    profiles.length
      ? prisma.enterpriseAsset.findMany({
          where: { organizationId, id: { in: profiles.map((profile) => profile.assetId) } },
          select: {
            id: true,
            code: true,
            name: true,
            serialNumber: true,
            status: true,
            site: { select: { code: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const capabilities = auth.access.capabilities;
  const items = profiles.map((profile) => ({
    ...profile,
    asset: assetById.get(profile.assetId) || null,
    capabilities: {
      canRunDepreciation: Boolean(capabilities.canManage && profile.status === "ACTIVE"),
      canDispose: Boolean(capabilities.canManage && profile.status === "ACTIVE" && profile.disposals.length === 0),
    },
  }));

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, domain: "asset-accounting", page, recordId: recordId || null },
  });
  return NextResponse.json({
    items,
    availableAssets,
    pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) },
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ASSETS", "manage", {
    mutation: true,
    limit: 20,
  });
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { assetId, ...profileInput } = parsed.data;
  try {
    const result = await createAssetAccountingProfile(
      organizationId,
      assetId,
      auth.session.userId,
      profileInput,
    );
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_ASSET_CAPITALIZED",
      entity: "EnterpriseAssetAccountingProfile",
      entityId: result.profile.id,
      request: req,
      metadata: { organizationId, assetId, journalEntryId: result.posting.entry.id },
    });
    await writeApiLog({
      request: req,
      statusCode: 201,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "asset-accounting" },
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "ASSET_CAPITALIZATION_FAILED");
  }
}
