export type EnterpriseActivitiesOrganization = {
  id: string;
  name: string;
  sector: string | null;
  sectorCode: string | null;
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
};

export type EnterpriseActivitiesDataset = {
  organization: EnterpriseActivitiesOrganization;
  blocks: EnterpriseActivityBlockItem[];
  requests: EnterpriseActivityRequestItem[];
  members: EnterpriseActivityMemberItem[];
  sectorRecords: EnterpriseActivitySectorRecordItem[];
  workflows: EnterpriseActivityWorkflowItem[];
  entitlements: {
    planCode: string;
    planLabel: string;
    subscriptionStatus: string;
    subscriptionActive: boolean;
  };
};
