import type { EnterpriseActivityRequestWorkflowStatus } from "@/lib/enterprise/enterprise-activity-workflow-links";

export type EnterpriseActivitiesOrganization = {
  id: string;
  name: string;
  sector: string | null;
  sectorCode: string | null;
  businessSubtypeCode: string | null;
  businessSubtypeLabelFr: string | null;
  businessSubtypeLabelEn: string | null;
  businessSector: { labelFr: string; labelEn: string; icon: string | null; color: string | null } | null;
};

export type EnterpriseActivityBlockItem = {
  id: string;
  blockCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  icon: string | null;
  targetModuleCode: string | null;
};

export type EnterpriseActivityRequestItem = {
  id: string;
  blockCode: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  workflowLink: EnterpriseActivityRequestWorkflowStatus | null;
  targetModuleCode: string | null;
  createdAt: string;
  createdBy: { name: string; email: string };
  block: { labelFr: string; labelEn: string; icon: string | null } | null;
};

export type EnterpriseActivityMemberItem = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

export type EnterpriseActivitySectorRecordItem = {
  id: string;
  moduleCode: string;
  title: string;
  status: string;
  payloadJson: Record<string, unknown> | null;
};

export type EnterpriseActivityWorkflowItem = {
  id: string;
  workflowCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  stepsJson: unknown;
  updatedAt?: string;
  triggerEntityType?: string | null;
  triggerEventType?: string | null;
};

export type EnterpriseActivitiesDataset = {
  organization: EnterpriseActivitiesOrganization;
  blocks: EnterpriseActivityBlockItem[];
  canonicalActionHandoffs: Record<string, { href: string; labelFr: string; labelEn: string }>;
  requests: EnterpriseActivityRequestItem[];
  members: EnterpriseActivityMemberItem[];
  departments: { value: string; labelFr: string; labelEn: string }[];
  sectorRecords: EnterpriseActivitySectorRecordItem[];
  workflows: EnterpriseActivityWorkflowItem[];
  gamingReferences: Partial<Record<"gamingStations" | "gamingBookings" | "gamingSessions" | "gamingCloses" | "businessParties", { value: string; label: string }[]>>;
  entitlements: {
    planCode: string;
    planLabel: string;
    subscriptionStatus: string;
    subscriptionActive: boolean;
  };
};
