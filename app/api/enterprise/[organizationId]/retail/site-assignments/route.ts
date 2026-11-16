import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { RETAIL_OWNER_ROLES, RETAIL_SELF_APPROVAL_CAPABILITIES, RETAIL_SITE_CAPABILITIES, ROLE_DEFAULT_CAPABILITIES, retailSiteAssignmentInputSchema, retailStaffIsolationIsEnabled, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

/** The actual proprietor can be stored as Organization.ownerUserId even when
 * a historical member row has a non-OWNER administrative role. Fail closed for
 * ordinary admins, and require an ACTIVE member of this exact organization. */
async function isRetailEnterpriseProprietor(organizationId: string, userId: string): Promise<boolean> {
  const [membership, organization] = await Promise.all([
    prisma.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { role: true } }),
    prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { ownerUserId: true } }),
  ]);
  return Boolean(membership && organization && (membership.role === "OWNER" || organization.ownerUserId === userId));
}

async function authorizeOwner(req: Request, organizationId: string, mutation = false) {
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", mutation ? "manage" : "read", { mutation, limit: 40 });
  if (!auth.ok) return auth;
  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: auth.session.userId, status: "ACTIVE", removedAt: null, role: { in: [...RETAIL_OWNER_ROLES] } },
    select: { id: true, role: true },
  });
  if (!owner) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return auth;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeOwner(req, organizationId);
  if (!auth.ok) return auth.response;
  const [items, sites, members, positions, configuration] = await Promise.all([
    prisma.enterpriseRetailSiteAssignment.findMany({
      where: { organizationId }, orderBy: [{ siteId: "asc" }, { createdAt: "asc" }], take: 500,
      select: { id: true, siteId: true, userId: true, roleCode: true, permissionsJson: true, isActive: true, revision: true },
    }),
    prisma.enterpriseSite.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null }, orderBy: [{ name: "asc" }], take: 500, select: { id: true, name: true, code: true } }),
    prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null }, orderBy: [{ createdAt: "asc" }], take: 500,
      select: { userId: true, role: true, positionId: true, positionTitle: true, user: { select: { name: true } } },
    }),
    prisma.enterprisePosition.findMany({
      where: { organizationId }, select: { id: true, positionCode: true, labelFr: true, labelEn: true }, take: 500,
    }),
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-site-assignments" } });
  return NextResponse.json({
    items: items.map((item) => ({ ...item, permissions: siteStaffCapabilities(item.roleCode, item.permissionsJson) })),
    sites, members: members.map((member) => {
      const position = positions.find((entry) => entry.id === member.positionId);
      return {
        userId: member.userId, role: member.role, name: member.user.name,
        // The enterprise administration position is the only professional job.
        // A Retail assignment is only an operational access profile at a site.
        positionId: member.positionId,
        positionTitleFr: position?.labelFr || member.positionTitle || null,
        positionTitleEn: position?.labelEn || member.positionTitle || null,
      };
    }),
    capabilities: RETAIL_SITE_CAPABILITIES, defaults: ROLE_DEFAULT_CAPABILITIES,
    canGrantSelfApproval: await isRetailEnterpriseProprietor(organizationId, auth.session.userId),
    isolationEnabled: retailStaffIsolationIsEnabled(configuration?.settingsJson),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeOwner(req, organizationId, true);
  if (!auth.ok) return auth.response;
  const parsed = retailSiteAssignmentInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_SITE_ASSIGNMENT_INPUT_INVALID", req);
  const input = parsed.data;
  try {
    const [site, member] = await Promise.all([
      prisma.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } }),
      prisma.organizationMember.findFirst({ where: { organizationId, userId: input.userId, status: "ACTIVE", removedAt: null }, select: { role: true } }),
    ]);
    if (!site || !member || RETAIL_OWNER_ROLES.has(member.role)) throw new EnterpriseRetailError("RETAIL_SITE_ASSIGNMENT_TARGET_INVALID", 409);
    const existing = await prisma.enterpriseRetailSiteAssignment.findUnique({
      where: { organizationId_siteId_userId: { organizationId, siteId: input.siteId, userId: input.userId } },
      select: { id: true, revision: true, permissionsJson: true, roleCode: true, isActive: true },
    });
    if ((existing && existing.revision !== input.revision) || (!existing && input.revision)) throw new EnterpriseRetailError("RETAIL_SITE_ASSIGNMENT_CONFLICT", 409);
    // Only the actual organization OWNER may grant, retain or revoke a self-approval exception.
    const oldRights = existing ? siteStaffCapabilities(existing.roleCode, existing.permissionsJson) : [];
    const newRights = input.permissions ?? ROLE_DEFAULT_CAPABILITIES[input.roleCode];
    if (RETAIL_SELF_APPROVAL_CAPABILITIES.some((permission) => oldRights.includes(permission) || newRights.includes(permission))) {
      if (!await isRetailEnterpriseProprietor(organizationId, auth.session.userId)) {
        throw new EnterpriseRetailError("RETAIL_SITE_SELF_APPROVAL_OWNER_ONLY", 403);
      }
    }
    if (newRights.includes("SELF_APPROVE_INVOICE") && !newRights.includes("PREPARE_INVOICE") ||
        newRights.includes("SELF_APPROVE_PAYMENT") && !newRights.includes("COLLECT_PAYMENT") ||
        newRights.includes("SELF_APPROVE_INVOICE_RETURN") &&
        (input.roleCode !== "MANAGER" || !newRights.includes("REQUEST_INVOICE_RETURN") || !newRights.includes("APPROVE_INVOICE_RETURN"))) {
      throw new EnterpriseRetailError("RETAIL_SITE_SELF_APPROVAL_DEPENDENCY", 400);
    }
    const row = existing
      ? await prisma.enterpriseRetailSiteAssignment.updateMany({
          where: { id: existing.id, organizationId, revision: existing.revision },
          data: {
            roleCode: input.roleCode,
            permissionsJson: input.permissions === undefined ? undefined : input.permissions,
            isActive: input.isActive, updatedByUserId: auth.session.userId, revision: { increment: 1 },
          },
        }).then(async (result) => {
          if (result.count !== 1) throw new EnterpriseRetailError("RETAIL_SITE_ASSIGNMENT_CONFLICT", 409);
          return prisma.enterpriseRetailSiteAssignment.findUniqueOrThrow({ where: { id: existing.id } });
        })
      : await prisma.enterpriseRetailSiteAssignment.create({
          data: {
            organizationId, siteId: input.siteId, userId: input.userId, roleCode: input.roleCode,
            permissionsJson: input.permissions ?? undefined, isActive: input.isActive, createdByUserId: auth.session.userId,
          },
        });
    await writeAuditLog({ userId: auth.session.userId, organizationId, action: existing ? "RETAIL_SITE_ASSIGNMENT_UPDATED" : "RETAIL_SITE_ASSIGNMENT_CREATED", entity: "EnterpriseRetailSiteAssignment", entityId: row.id, request: req,
      riskLevel: RETAIL_SELF_APPROVAL_CAPABILITIES.some((permission) => oldRights.includes(permission) || newRights.includes(permission)) ? "HIGH" : "MEDIUM",
      before: existing ? { roleCode: existing.roleCode, isActive: existing.isActive, permissions: oldRights, revision: existing.revision } : undefined,
      after: { roleCode: row.roleCode, isActive: row.isActive, permissions: siteStaffCapabilities(row.roleCode, row.permissionsJson), revision: row.revision },
      metadata: { organizationId, siteId: row.siteId, userId: row.userId, roleCode: row.roleCode, isActive: row.isActive, revision: row.revision,
        selfApprovalGrants: RETAIL_SELF_APPROVAL_CAPABILITIES.filter((permission) => newRights.includes(permission)) } });
    await writeApiLog({ request: req, statusCode: existing ? 200 : 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-site-assignments", action: existing ? "update" : "create" } });
    return NextResponse.json({ item: { ...row, permissions: siteStaffCapabilities(row.roleCode, row.permissionsJson) } }, { status: existing ? 200 : 201 });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_SITE_ASSIGNMENT_FAILED");
  }
}
