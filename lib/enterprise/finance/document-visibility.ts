import type { Prisma } from "@prisma/client";
import { enterpriseDocumentVisibilityWhere } from "@/lib/enterprise/procurement/access";
import { prisma } from "@/lib/prisma";

export async function financeVisibleDocumentWhere(organizationId: string, userId: string): Promise<Prisma.EnterpriseDocumentWhereInput> {
  return enterpriseDocumentVisibilityWhere({ organizationId, userId, canSeeAll: false });
}

export async function validateFinanceDocumentIds(organizationId: string, userId: string, documentIds: string[]) {
  const ids = [...new Set(documentIds.map((value) => value.trim()).filter(Boolean))];
  if (!ids.length) return { ok: true as const, ids };
  const visibility = await financeVisibleDocumentWhere(organizationId, userId);
  const visible = await prisma.enterpriseDocument.count({
    where: {
      AND: [
        visibility,
        { id: { in: ids }, status: "ACTIVE", archivedAt: null },
      ],
    },
  });
  return visible === ids.length ? { ok: true as const, ids } : { ok: false as const, ids };
}
