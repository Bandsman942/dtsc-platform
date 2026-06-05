export type EnterpriseAdminOrganization = {
  id: string;
  name: string;
  sector: string | null;
  sectorCode: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  timezone?: string | null;
  settingsJson?: unknown;
  brandingJson?: unknown;
  businessSector: { labelFr: string; labelEn: string; icon: string | null; color: string | null } | null;
};

export type EnterpriseAdminDashboard = {
  membersCount: number;
  activeModulesCount: number;
  modulesCount: number;
  openRequestsCount: number;
  recentRequestsCount: number;
};

export type EnterpriseSaasEntitlements = {
  planCode: string;
  planLabel: string;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  trialEndsAt: string | null;
  expiresAt: string | null;
  limits: {
    maxUsers: number;
    maxStorageMb: number;
    maxMonthlyCallMinutes: number;
    maxActiveModules: number;
    maxDocuments: number;
    supportLevel: string;
  };
};

export type EnterpriseModuleItem = {
  id: string;
  moduleCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  moduleCategory: string;
  icon: string | null;
  isEnabled: boolean;
  isCore: boolean;
  requiredPlan?: string | null;
  includedInPlan?: boolean;
  accessAllowed?: boolean;
  accessMessage?: string | null;
  createdAt?: string;
};

export type EnterpriseDepartmentItem = {
  id: string;
  departmentCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  responsibleUserId?: string | null;
  isActive: boolean;
  sortOrder?: number;
};

export type EnterprisePositionItem = {
  id: string;
  positionCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr?: string | null;
  hierarchyLevel: number;
  isActive: boolean;
  isKeyPosition: boolean;
  permissionsJson?: unknown;
  department: { labelFr: string; labelEn: string } | null;
};

export type EnterpriseActivityBlockItem = {
  id: string;
  blockCode: string;
  labelFr: string;
  labelEn: string;
  targetModuleCode: string | null;
  isEnabled: boolean;
};

export type EnterpriseWorkflowItem = {
  id: string;
  workflowCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr?: string | null;
  isEnabled: boolean;
  stepsJson?: unknown;
};

export type EnterpriseRequestItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  createdBy: { name: string; email: string };
};

export type EnterpriseCalendarEventItem = {
  id: string;
  title: string;
  eventType: string;
  startDateTime: string;
  endDateTime: string;
  status: string;
  priority: string;
  visibility: string;
  participants?: Array<{ id: string; collaboratorId: string; participantStatus: string }>;
};

export type EnterpriseMemberItem = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

export type EnterpriseSectorRecordItem = {
  id: string;
  moduleCode: string;
  recordType: string;
  title: string;
  summary: string | null;
  status: string;
  priority: string;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string; email: string };
  assignedTo: { id: string; name: string; email: string } | null;
};

export type EnterpriseAdminDataset = {
  organization: EnterpriseAdminOrganization;
  dashboard: EnterpriseAdminDashboard;
  members: EnterpriseMemberItem[];
  modules: EnterpriseModuleItem[];
  departments: EnterpriseDepartmentItem[];
  positions: EnterprisePositionItem[];
  activityBlocks: EnterpriseActivityBlockItem[];
  workflows: EnterpriseWorkflowItem[];
  recentRequests: EnterpriseRequestItem[];
  calendarEvents: EnterpriseCalendarEventItem[];
  sectorRecords: EnterpriseSectorRecordItem[];
  entitlements: EnterpriseSaasEntitlements;
};
