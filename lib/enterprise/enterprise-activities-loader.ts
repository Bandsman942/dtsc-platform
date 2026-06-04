import { getEnterpriseActivityBlocks } from "@/lib/enterprise/enterprise-activity-blocks-loader";
import { getEnterpriseActivityHealthcareRecords } from "@/lib/enterprise/enterprise-activity-healthcare-loader";
import { getEnterpriseActivityMembers } from "@/lib/enterprise/enterprise-activity-members-loader";
import { getEnterpriseActivityRequests } from "@/lib/enterprise/enterprise-activity-requests-loader";
import { getEnterpriseActivityWorkflows } from "@/lib/enterprise/enterprise-activity-workflows-loader";
import type { EnterpriseActivitiesDataset } from "@/lib/enterprise/enterprise-activities-types";
import { prisma } from "@/lib/prisma";

function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function getEnterpriseActivitiesDataset({
  organizationId,
  userId,
  membershipRole,
}: {
  organizationId: string;
  userId: string;
  membershipRole: string | null | undefined;
}) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: {
      id: true,
      name: true,
      sector: true,
      sectorCode: true,
      businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } },
    },
  });

  if (!organization) {
    return null;
  }

  const [blocks, requests, members, sectorRecords, workflows] = await Promise.all([
    getEnterpriseActivityBlocks(organizationId),
    getEnterpriseActivityRequests({ organizationId, userId, membershipRole }),
    getEnterpriseActivityMembers(organizationId),
    getEnterpriseActivityHealthcareRecords(organizationId, organization.sectorCode),
    getEnterpriseActivityWorkflows(organizationId),
  ]);

  return toJson<EnterpriseActivitiesDataset>({
    organization,
    blocks,
    requests,
    members,
    sectorRecords,
    workflows,
  });
}
