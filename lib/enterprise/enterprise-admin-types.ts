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
  hiddenIncompatibleModulesCount: number;
  configurationIssuesCount: number;
  openRequestsCount: number;
  recentRequestsCount: number;
  submittedRequestsCount: number;
  inReviewRequestsCount: number;
  openTasksCount: number;
  overdueTasksCount: number;
  blockedTasksCount: number;
  pendingValidationsCount: number;
  todayMeetingsCount: number;
  upcomingMeetingsCount: number;
  recentDocumentsCount: number;
  activeBudgetsCount: number;
  activeSuppliersCount: number;
  generatedReportsCount: number;
  publishedReportsCount: number;
  pendingInvitationsCount: number;
  securityIncidentsCount: number;
  recentAdministrativeActionsCount: number;
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
  descriptionEn?: string | null;
  moduleCategory: string;
  icon: string | null;
  isEnabled: boolean;
  isCore: boolean;
  requiredPlan?: string | null;
  includedInPlan?: boolean;
  accessAllowed?: boolean;
  accessMessage?: string | null;
  canonicalCode?: string | null;
  implementationStatus?: string | null;
  navigationGroup?: string | null;
  routeKind?: string | null;
  sectorCompatible?: boolean;
  registryKnown?: boolean;
  createdAt?: string;
};

export type EnterpriseModuleConfigurationIssue = {
  code: string;
  severity: "WARNING" | "ERROR";
  moduleCode?: string;
  moduleLabel?: string;
  dependencyCodes?: string[];
  message: string;
};

export type EnterpriseDepartmentItem = {
  id: string;
  departmentCode: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string | null;
  descriptionEn?: string | null;
  responsibleUserId?: string | null;
  parentDepartmentId?: string | null;
  isActive: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
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
  departmentId?: string | null;
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

export type EnterprisePendingActionItem = {
  id: string;
  kind: "TASK" | "REQUEST" | "APPROVAL";
  title: string;
  description?: string | null;
  status: "IN_PROGRESS" | "WAITING_FOR_YOU" | "WAITING_FOR_VALIDATION" | "BLOCKED";
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  sourceModuleCode: string | null;
  sourceModuleLabel: string | null;
  actionUrl: string;
  canAct: boolean;
  assignedUserName: string | null;
  requestedByName: string | null;
  dueAt: string | null;
  createdAt: string;
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
  positionId?: string | null;
  positionCode?: string | null;
  positionTitle?: string | null;
  joinedAt?: string | null;
  createdAt?: string;
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

export type EnterpriseOrganizationRoleItem = {
  id: string;
  code: string;
  labelFr: string;
  labelEn: string;
  descriptionFr?: string | null;
  descriptionEn?: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionsJson?: unknown;
  modulesJson?: unknown;
  assignments: Array<{ id: string; memberId: string; assignedAt: string }>;
};

export type EnterpriseSecurityPolicyItem = {
  id?: string;
  sessionIdleMinutes: number;
  invitationExpiryHours: number;
  maxPendingInvitations: number;
  requireApprovedDomains: boolean;
  allowedEmailDomainsJson?: unknown;
  defaultInvitationRole: string;
  requireInvitationApproval: boolean;
  requireMfa: boolean;
  sensitiveExportApproval: boolean;
  devicePolicyJson?: unknown;
  dataExportPolicyJson?: unknown;
  updatedAt?: string;
};

export type EnterpriseAuditItem = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  result: string;
  reasonCode: string | null;
  riskLevel: string | null;
  requestId: string | null;
  metadata?: unknown;
  createdAt: string;
};

export type EnterpriseConfigurationChecklistItem = {
  code: string;
  group: "SETTINGS" | "MODULES";
  label: string;
  help: string;
  complete: boolean;
  deepLink: string;
  reason: string;
};

export type EnterpriseAdminDataset = {
  organization: EnterpriseAdminOrganization;
  dashboard: EnterpriseAdminDashboard;
  members: EnterpriseMemberItem[];
  modules: EnterpriseModuleItem[];
  departments: EnterpriseDepartmentItem[];
  positions: EnterprisePositionItem[];
  roles: EnterpriseOrganizationRoleItem[];
  securityPolicy: EnterpriseSecurityPolicyItem;
  auditItems: EnterpriseAuditItem[];
  configurationChecklist: EnterpriseConfigurationChecklistItem[];
  activityBlocks: EnterpriseActivityBlockItem[];
  workflows: EnterpriseWorkflowItem[];
  recentRequests: EnterpriseRequestItem[];
  pendingActions: EnterprisePendingActionItem[];
  calendarEvents: EnterpriseCalendarEventItem[];
  sectorRecords: EnterpriseSectorRecordItem[];
  entitlements: EnterpriseSaasEntitlements;
  configurationIssues: EnterpriseModuleConfigurationIssue[];
};