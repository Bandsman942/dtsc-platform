import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
  companyName: z.string().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  otp: z.string().regex(/^\d{6}$/).optional().or(z.literal("")),
});

export const signInSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().optional(),
  content: z.string().min(1).max(8_000),
  model: z.string().min(1).optional(),
});

export const conversationUpdateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  projectName: z.string().max(120).optional().or(z.literal("")),
  projectId: z.string().max(120).optional().nullable().or(z.literal("")),
});

export const conversationProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const accountPreferencesSchema = z.object({
  preferredModel: z.string().min(1).max(120).optional().or(z.literal("")),
  notifySupportEnabled: z.coerce.boolean().default(true),
  notifyUsageEnabled: z.coerce.boolean().default(true),
  notifyBroadcastEnabled: z.coerce.boolean().default(true),
  pushNotificationsEnabled: z.coerce.boolean().default(false),
  interfaceDensity: z.enum(["COMFORTABLE", "COMPACT"]).default("COMFORTABLE"),
  startPage: z.enum(["/dashboard", "/chat", "/billing", "/company", "/activities", "/support", "/notifications", "/announcements", "/profile", "/settings"]).default("/dashboard"),
  locale: z.enum(["fr", "en"]).default("fr"),
  timezone: z.string().min(2).max(80).default("Africa/Kinshasa"),
  dateFormat: z.enum(["FR", "ISO", "LONG"]).default("FR"),
  emailDigestFrequency: z.enum(["NEVER", "DAILY", "WEEKLY", "MONTHLY"]).default("WEEKLY"),
  chatResponseStyle: z.enum(["PROFESSIONAL", "DIRECT", "DETAILED", "EXECUTIVE"]).default("PROFESSIONAL"),
  chatResponseLength: z.enum(["SHORT", "BALANCED", "DETAILED"]).default("BALANCED"),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(10).max(500),
  }),
});

export const supportTicketSchema = z.object({
  subject: z.string().min(3).max(160),
  description: z.string().min(10).max(2_500),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

export const supportTicketUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  resolution: z.string().max(2_000).optional().or(z.literal("")),
});

export const userStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING"]),
});

export const userRoleSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "CLIENT", "SUPPORT"]),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(120),
  companyName: z.string().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  jobTitle: z.string().max(140).optional().or(z.literal("")),
  bio: z.string().max(800).optional().or(z.literal("")),
  location: z.string().max(120).optional().or(z.literal("")),
  website: z.string().max(180).optional().or(z.literal("")),
  avatarUrl: z.union([
    z.string().url().max(600),
    z.string().regex(/^\/api\/users\/[a-zA-Z0-9_-]+\/avatar(?:\?.*)?$/).max(600),
    z.literal(""),
  ]).optional(),
  publicProfileConsent: z.coerce.boolean().default(false),
});

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
});

export const adminCreateUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180).transform((email) => email.toLowerCase()),
  password: z.string().min(10).max(128),
  role: z.enum(["ADMIN", "MANAGER", "CLIENT", "SUPPORT"]),
  companyName: z.string().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  dailyMessageLimit: z.coerce.number().int().min(1).max(1000).default(30),
  dailyTokenLimit: z.coerce.number().int().min(1000).max(2_000_000).default(100000),
});

export const adminUsageLimitSchema = z.object({
  dailyMessageLimit: z.coerce.number().int().min(1).max(1000),
  dailyTokenLimit: z.coerce.number().int().min(1000).max(2_000_000),
});

export const siteVisitSchema = z.object({
  path: z.string().min(1).max(300),
  referrer: z.string().max(500).optional().or(z.literal("")),
});

export const ticketMessageSchema = z.object({
  content: z.string().min(1).max(2_000),
});

export const announcementSchema = z.object({
  title: z.string().min(3).max(160),
  content: z.string().min(3).max(8_000),
  contentHtml: z.string().max(60_000).optional().or(z.literal("")),
});

export const announcementUpdateSchema = announcementSchema;

export const announcementCommentSchema = z.object({
  content: z.string().min(1).max(1_000),
  parentId: z.string().min(1).max(120).optional().or(z.literal("")),
});

export const announcementCommentUpdateSchema = z.object({
  content: z.string().min(1).max(1_000),
});

export const announcementReactionSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const adminSettingsSchema = z.object({
  defaultDailyMessageLimit: z.coerce.number().int().min(1).max(1000),
  defaultDailyTokenLimit: z.coerce.number().int().min(1000).max(2_000_000),
  chatbotEnabled: z.coerce.boolean(),
  maintenanceMode: z.coerce.boolean(),
  supportAutoCloseDays: z.coerce.number().int().min(1).max(90),
  allowClientAnnouncements: z.coerce.boolean(),
  commentEditWindowMinutes: z.coerce.number().int().min(1).max(1440),
  notificationRetentionDays: z.coerce.number().int().min(7).max(365),
  signUpOtpEnabled: z.coerce.boolean(),
  signUpOtpExpirationMinutes: z.coerce.number().int().min(2).max(60),
  applyLimitsToExistingUsers: z.coerce.boolean().default(false),
});

export const broadcastSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(3).max(2_000),
  bodyHtml: z.string().max(60_000).optional().or(z.literal("")),
  type: z.string().min(2).max(40).default("BROADCAST"),
});

export const massMailSchema = z.object({
  subject: z.string().min(3).max(160),
  content: z.string().min(10).max(6_000),
  contentHtml: z.string().max(60_000).optional().or(z.literal("")),
});

const adminBlockSchema = z.enum(["overview", "settings", "publications", "users", "hrCfo", "sco", "coo", "ceo", "mpo", "cto", "visits", "activity", "audits"]);

export const adminAccessSchema = z.object({
  MANAGER: z.array(adminBlockSchema).default([]),
  SUPPORT: z.array(adminBlockSchema).default([]),
});

const optionalDate = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((value) => value ? new Date(value) : undefined);

const optionalText = (max = 500) => z.string().max(max).optional().or(z.literal(""));
const money = z.coerce.number().min(0).max(10_000_000);
const positiveMoney = z.coerce.number().positive().max(10_000_000);

export const hrcfoSchemas = {
  employees: z.object({
    userId: z.string().min(5),
    departmentId: z.string().min(5),
    positionId: z.string().min(5),
    jobTitle: z.string().max(140).optional().or(z.literal("")),
    contractType: z.enum(["PERMANENT", "CONSULTANT", "PART_TIME", "INTERN", "TEMPORARY"]).default("PERMANENT"),
    status: z.enum(["ACTIVE", "ONBOARDING", "ON_LEAVE", "SUSPENDED", "EXITED"]).default("ACTIVE"),
    startDate: optionalDate,
    monthlyCompensation: money.optional(),
    managerUserId: optionalText(120),
    skills: optionalText(1000),
    kpis: optionalText(1500),
    complianceStatus: z.enum(["COMPLETE", "TO_REVIEW", "MISSING_DOCUMENTS", "EXPIRED"]).default("TO_REVIEW"),
    notes: optionalText(1500),
  }),
  budgets: z.object({
    name: z.string().min(2).max(160),
    departmentId: z.string().min(5),
    accountId: optionalText(120),
    periodStart: optionalDate,
    periodEnd: optionalDate,
    amount: positiveMoney,
    status: z.enum(["OPEN", "MONITORING", "OVER_BUDGET", "CLOSED"]).default("OPEN"),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
    notes: optionalText(1500),
  }),
  transactions: z.object({
    transactionType: z.enum(["MANUAL", "SUBSCRIPTION", "PAYROLL", "SCO"]).default("MANUAL"),
    transactionCategory: z.enum(["IN", "OUT"]),
    title: z.string().min(2).max(180),
    category: z.enum(["IN", "OUT"]),
    requesterName: z.string().max(160).optional().or(z.literal("")),
    amount: positiveMoney,
    currency: z.string().min(3).max(8).default("USD"),
    transactionDate: optionalDate,
    accountId: optionalText(120),
    departmentId: optionalText(120),
    budgetId: optionalText(120),
    paymentMethod: optionalText(120),
    attachmentUrl: optionalText(600),
    status: z.enum(["DRAFT", "PENDING", "VALIDATED", "PAID", "REJECTED", "CANCELED"]).default("PENDING"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    notes: optionalText(1500),
  }),
  payrolls: z.object({
    employeeId: z.string().min(5),
    periodStart: optionalDate.refine(Boolean, "La période de début est obligatoire."),
    periodEnd: optionalDate.refine(Boolean, "La période de fin est obligatoire."),
    grossAmount: money.optional(),
    bonusAmount: money.default(0),
    deductionAmount: money.default(0),
    budgetId: z.string().min(5),
    status: z.enum(["DRAFT", "VALIDATED", "PAID", "CANCELED"]).default("DRAFT"),
    notes: optionalText(1500),
  }),
};

export const hrcfoReferenceSchemas = {
  departments: z.object({
    name: z.string().min(2).max(140),
    description: optionalText(800),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  }),
  accounts: z.object({
    name: z.string().min(2).max(140),
    accountType: z.enum(["CASH", "BANK", "MOBILE_MONEY", "PROJECT", "OPERATIONS"]).default("CASH"),
    description: optionalText(800),
    openingBalance: money.default(0),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  }),
  positions: z.object({
    title: z.string().min(2).max(140),
    code: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/, "Le code doit être en majuscules sans espaces."),
    description: optionalText(1200),
    departmentId: optionalText(120),
    hierarchyLevel: z.coerce.number().int().min(1).max(99).default(50),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    permissions: optionalText(800),
  }),
};

export const ceoSchemas = {
  objectives: z.object({
    title: z.string().min(2).max(180),
    description: optionalText(2000),
    objectiveType: z.enum(["FINANCIAL", "COMMERCIAL", "OPERATIONAL", "HR", "TECHNICAL", "MARKETING", "STRATEGIC"]).default("STRATEGIC"),
    departmentId: optionalText(120),
    responsibleEmployeeId: optionalText(120),
    periodStart: optionalDate,
    periodEnd: optionalDate,
    targetValue: money.optional(),
    currentValue: money.optional(),
    progress: z.coerce.number().int().min(0).max(100).default(0),
    status: z.enum(["PLANNED", "IN_PROGRESS", "ACHIEVED", "MISSED", "LATE", "CANCELED"]).default("PLANNED"),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    comments: optionalText(1800),
  }),
  supervisionLogs: z.object({
    title: z.string().min(2).max(180),
    entryType: z.enum(["OBSERVATION", "DECISION", "INSTRUCTION", "RISK", "OPPORTUNITY", "FOLLOW_UP", "VALIDATION", "OTHER"]).default("OBSERVATION"),
    description: optionalText(2200),
    departmentId: optionalText(120),
    employeeId: optionalText(120),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "ARCHIVED", "CANCELED"]).default("OPEN"),
    logDate: optionalDate,
    expectedAction: optionalText(1500),
    followUpResponsibleId: optionalText(120),
    comments: optionalText(1800),
  }),
};

export const mpoSchemas = {
  projects: z.object({
    title: z.string().min(2).max(180),
    projectType: z.enum(["WEB_APP", "MOBILE_APP", "SAAS_PLATFORM", "BI_DASHBOARD", "DATA_PROJECT", "AI_PROJECT", "AUTOMATION", "CHATBOT", "ERP", "CRM", "CLIENT_PORTAL", "DIGITAL_HEALTH", "INTERNAL_DTSC", "CLIENT_PROJECT", "DIGITAL_TRANSFORMATION", "OTHER"]).default("DIGITAL_TRANSFORMATION"),
    requester: optionalText(180),
    needDescription: optionalText(2200),
    businessObjective: optionalText(1600),
    technicalObjective: optionalText(1600),
    responsibleMpoId: optionalText(120),
    ctoEmployeeId: optionalText(120),
    cooEmployeeId: optionalText(120),
    hrCfoEmployeeId: optionalText(120),
    scoEmployeeId: optionalText(120),
    ceoEmployeeId: optionalText(120),
    collaborators: optionalText(1400),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    complexity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    estimatedBudget: money.optional(),
    status: z.enum(["DRAFT", "SCOPING", "INTERNAL_VALIDATION", "WAITING_CTO", "WAITING_BUDGET", "WAITING_SCO_RESOURCES", "DEVELOPMENT", "TESTING", "WAITING_CLIENT", "BLOCKED", "DELIVERED", "CLOSED", "CANCELED"]).default("SCOPING"),
    startDate: optionalDate,
    dueDate: optionalDate,
    expectedDeliverables: optionalText(1800),
    associatedDocuments: optionalText(1000),
    healthDigitalCategory: optionalText(120),
    healthObjective: optionalText(1200),
    medicalDataConcerned: optionalText(1000),
    medicalRisk: optionalText(1000),
    confidentialityConstraint: optionalText(1000),
    healthValidation: optionalText(1000),
    ethicalCompliance: optionalText(1000),
    comments: optionalText(1800),
  }),
  records: z.object({
    recordType: z.enum(["NEEDS_ASSESSMENT", "SPECIFICATION", "DELIVERABLE", "RISK_BLOCKER", "CTO_COLLABORATION", "COO_COORDINATION", "BUDGET_REQUEST", "SCO_MATERIAL_REQUEST", "DIGITAL_HEALTH", "PROJECT_REPORT", "PROJECT_WORKFLOW", "PROJECT_DOCUMENTATION", "DIGITAL_OPPORTUNITY"]),
    projectId: optionalText(120),
    title: z.string().min(2).max(180),
    status: z.enum(["DRAFT", "IN_PROGRESS", "SUBMITTED", "WAITING", "VALIDATED", "DELIVERED", "BLOCKED", "ARCHIVED", "CANCELED"]).default("DRAFT"),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    category: optionalText(120),
    departmentId: optionalText(120),
    responsibleEmployeeId: optionalText(120),
    targetEmployeeId: optionalText(120),
    amount: money.optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
    progress: z.coerce.number().int().min(0).max(100).default(0),
    description: optionalText(2200),
    content: optionalText(5000),
    notes: optionalText(2000),
    attachmentUrl: optionalText(600),
  }),
};

export const ctoSchemas = {
  projects: z.object({
    title: z.string().min(2).max(180),
    mpoProjectId: optionalText(120),
    solutionType: z.enum(["WEB_APP", "MOBILE_APP", "API", "BACKEND", "FRONTEND", "BI_DASHBOARD", "AUTOMATION", "AI_ML", "CHATBOT", "DATABASE", "EXTERNAL_INTEGRATION", "INFRASTRUCTURE", "SECURITY", "OTHER"]).default("WEB_APP"),
    functionalSummary: optionalText(1800),
    technicalObjective: optionalText(1800),
    responsibleCtoId: optionalText(120),
    technicalCollaborators: optionalText(1400),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    complexity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    techStack: optionalText(1400),
    status: z.enum(["DRAFT", "TECH_ANALYSIS", "WAITING_MPO", "WAITING_BUDGET", "WAITING_MATERIAL", "DEVELOPMENT", "REVIEW", "TESTING", "PREPRODUCTION", "PRODUCTION", "BLOCKED", "DELIVERED", "CLOSED", "CANCELED"]).default("TECH_ANALYSIS"),
    startDate: optionalDate,
    dueDate: optionalDate,
    environment: z.enum(["DEVELOPMENT", "TEST", "PREPRODUCTION", "PRODUCTION"]).optional().or(z.literal("")),
    repositoryUrl: optionalText(600),
    documentationUrl: optionalText(600),
    expectedTechnicalDeliverables: optionalText(1800),
    comments: optionalText(1800),
  }),
  records: z.object({
    recordType: z.enum(["ARCHITECTURE", "TECH_TASK", "API_INTEGRATION", "DATABASE_MODEL", "DEPLOYMENT", "SECURITY_REVIEW", "BUG_INCIDENT", "TECH_DOCUMENTATION", "QUALITY_REVIEW", "MPO_COLLABORATION", "COO_COORDINATION", "BUDGET_NEED", "SCO_MATERIAL_NEED", "INNOVATION", "CTO_REPORT"]),
    technicalProjectId: optionalText(120),
    mpoProjectId: optionalText(120),
    title: z.string().min(2).max(180),
    status: z.enum(["DRAFT", "OPEN", "ANALYSIS", "IN_PROGRESS", "REVIEW", "TESTING", "RESOLVED", "VALIDATED", "BLOCKED", "ARCHIVED", "CANCELED"]).default("DRAFT"),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    category: optionalText(120),
    departmentId: optionalText(120),
    responsibleEmployeeId: optionalText(120),
    assigneeEmployeeId: optionalText(120),
    provider: optionalText(160),
    environment: z.enum(["DEVELOPMENT", "TEST", "PREPRODUCTION", "PRODUCTION"]).optional().or(z.literal("")),
    repositoryUrl: optionalText(600),
    amount: money.optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
    progress: z.coerce.number().int().min(0).max(100).default(0),
    description: optionalText(2200),
    content: optionalText(5000),
    notes: optionalText(2000),
    attachmentUrl: optionalText(600),
  }),
};

export const scoSchemas = {
  materialItems: z.object({
    name: z.string().min(2).max(180),
    sku: optionalText(100),
    category: z.string().min(2).max(120),
    itemType: z.enum(["STOCK", "ASSET", "EQUIPMENT", "CONSUMABLE", "SERVICE_TOOL"]).default("EQUIPMENT"),
    unit: z.string().min(1).max(40).default("unité"),
    quantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
    condition: z.enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "LOST", "DAMAGED", "RETIRED", "ARCHIVED"]).optional().or(z.literal("")),
    location: optionalText(140),
    currentOwnerName: optionalText(160),
    departmentId: optionalText(120),
    relatedProjectId: optionalText(120),
    relatedTechnicalProjectId: optionalText(120),
    vendorName: optionalText(180),
    acquiredAt: optionalDate,
    estimatedValue: money.optional(),
    comments: optionalText(1500),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
    description: optionalText(1200),
  }),
  vendors: z.object({
    name: z.string().min(2).max(180),
    category: z.string().min(2).max(120),
    vendorType: z.enum(["IT_HARDWARE", "OFFICE_SUPPLIES", "CLOUD_SERVICES", "NETWORK_EQUIPMENT", "LOGISTICS", "TRANSPORT", "PRINTING", "MAINTENANCE", "TECHNICAL_PROVIDER", "OTHER"]).optional().or(z.literal("")),
    contactName: optionalText(140),
    email: z.string().email().max(180).optional().or(z.literal("")),
    phone: optionalText(60),
    address: optionalText(300),
    productsServices: optionalText(1200),
    serviceQuality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().or(z.literal("")),
    paymentTerms: optionalText(180),
    documentUrl: optionalText(600),
    criticality: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional().or(z.literal("")),
    reliabilityScore: z.coerce.number().int().min(0).max(100).default(70),
    avgLeadTimeDays: z.coerce.number().int().min(0).max(365).default(7),
    status: z.enum(["ACTIVE", "WATCHLIST", "SUSPENDED", "ARCHIVED", "BLACKLISTED"]).default("ACTIVE"),
    notes: optionalText(1500),
  }),
  purchaseRequests: z.object({
    title: z.string().min(2).max(180),
    requesterName: z.string().min(2).max(160),
    requesterDepartmentId: optionalText(120),
    sourceSection: z.enum(["SCO", "HR_CFO", "COO", "CTO", "MPO", "CEO", "ACTIVITIES"]).default("SCO"),
    sourceItemId: optionalText(120),
    destinationSection: optionalText(80),
    destinationItemId: optionalText(120),
    justification: z.string().min(5).max(1500),
    project: optionalText(160),
    relatedProjectId: optionalText(120),
    relatedBudgetId: optionalText(120),
    relatedAssetId: optionalText(120),
    relatedTaskId: optionalText(120),
    relatedMissionId: optionalText(120),
    requestedItemName: optionalText(180),
    requestedQuantity: z.coerce.number().int().min(1).max(1_000_000).default(1),
    urgency: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL", "MEDIUM", "URGENT"]).default("NORMAL"),
    estimatedAmount: money.optional(),
    currency: z.string().min(3).max(8).default("USD"),
    status: z.enum(["DRAFT", "SUBMITTED", "SCO_REVIEW", "WAITING_BUDGET", "WAITING_HR_CFO_VALIDATION", "WAITING_CEO_VALIDATION", "APPROVED", "ORDERED", "RECEIVED", "REJECTED", "CANCELED"]).default("DRAFT"),
    budgetStatus: z.enum(["PENDING_REVIEW", "AVAILABLE", "INSUFFICIENT", "APPROVED"]).default("PENDING_REVIEW"),
    selectedVendorName: optionalText(180),
    proposedVendorName: optionalText(180),
    requestedAt: optionalDate,
    neededBy: optionalDate,
    attachmentUrl: optionalText(600),
    notes: optionalText(1500),
  }),
  inventory: z.object({
    materialItemId: optionalText(120),
    name: z.string().min(2).max(180),
    sku: optionalText(80),
    category: z.string().min(2).max(120),
    quantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
    minimumQuantity: z.coerce.number().int().min(0).max(1_000_000).default(1),
    unit: z.string().min(1).max(40).default("unité"),
    location: optionalText(140),
    usualVendorName: optionalText(180),
    ownerName: optionalText(140),
    lastEntryAt: optionalDate,
    lastExitAt: optionalDate,
    movementType: z.enum(["STOCK_IN", "STOCK_OUT", "RETURN", "LOSS", "DAMAGE", "ADJUSTMENT"]).optional().or(z.literal("")),
    relatedProjectId: optionalText(120),
    relatedTaskId: optionalText(120),
    relatedMissionId: optionalText(120),
    status: z.enum(["AVAILABLE", "LOW_STOCK", "RESERVED", "OUT_OF_STOCK", "ARCHIVED"]).default("AVAILABLE"),
    lastInventoryAt: optionalDate,
    notes: optionalText(1500),
  }),
  assets: z.object({
    materialItemId: optionalText(120),
    tag: z.string().min(1).max(100),
    name: z.string().min(2).max(180),
    category: z.string().min(2).max(120),
    brandModel: optionalText(160),
    serialNumber: optionalText(160),
    estimatedValue: money.optional(),
    vendorName: optionalText(180),
    assignedTo: optionalText(140),
    departmentId: optionalText(120),
    relatedProjectId: optionalText(120),
    relatedTechnicalProjectId: optionalText(120),
    purchaseRequestId: optionalText(120),
    assignmentHistory: optionalText(1800),
    maintenanceHistory: optionalText(1800),
    condition: z.enum(["NEW", "GOOD", "FAIR", "DAMAGED", "REPAIR"]).default("GOOD"),
    status: z.enum(["ASSIGNED", "AVAILABLE", "MAINTENANCE", "DAMAGED", "LOST", "RETURNED", "RETIRED"]).default("ASSIGNED"),
    purchaseDate: optionalDate,
    maintenanceDueAt: optionalDate,
    notes: optionalText(1500),
  }),
  logistics: z.object({
    title: z.string().min(2).max(180),
    missionType: z.enum(["CLIENT_MISSION", "TRAINING", "EVENT", "TECHNICAL_INTERVENTION", "EXTERNAL_MEETING", "DELIVERY", "INSTALLATION", "FIELD_SUPPORT", "PROJECT_PRESENTATION", "OTHER"]).optional().or(z.literal("")),
    location: z.string().min(2).max(180),
    eventDate: optionalDate,
    requesterName: optionalText(160),
    departmentId: optionalText(120),
    relatedProjectId: optionalText(120),
    relatedTechnicalProjectId: optionalText(120),
    relatedTaskId: optionalText(120),
    participants: optionalText(1200),
    logisticsNeeds: optionalText(1500),
    requiredMaterial: optionalText(1500),
    estimatedBudget: money.optional(),
    ownerName: z.string().min(2).max(160),
    status: z.enum(["PLANNED", "PREPARING", "WAITING_MATERIAL", "WAITING_BUDGET", "READY", "IN_PROGRESS", "COMPLETED", "CANCELED"]).default("PLANNED"),
    transportPlan: optionalText(1500),
    equipmentChecklist: optionalText(1500),
    riskNotes: optionalText(1500),
    notes: optionalText(1500),
  }),
};

export const cooSchemas = {
  operations: z.object({
    title: z.string().min(2).max(180),
    description: optionalText(2000),
    pilotDepartmentId: z.string().min(5),
    involvedDepartments: optionalText(800),
    leadEmployeeId: z.string().min(5),
    collaborators: optionalText(1000),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    status: z.enum(["DRAFT", "PLANNED", "IN_PROGRESS", "WAITING", "BLOCKED", "COMPLETED", "CANCELED"]).default("PLANNED"),
    startDate: optionalDate,
    dueDate: optionalDate,
    progress: z.coerce.number().int().min(0).max(100).default(0),
    objectives: optionalText(1600),
    deliverables: optionalText(1600),
    comments: optionalText(1600),
    attachmentUrl: optionalText(600),
  }),
  tasks: z.object({
    title: z.string().min(2).max(180),
    description: optionalText(1800),
    taskType: z.enum(["ADMINISTRATIVE", "COMMERCIAL", "TECHNICAL", "FINANCIAL", "LEGAL", "HR", "CLIENT_SUPPORT", "MARKETING", "REPORTING", "MEETING", "CLIENT_FOLLOW_UP", "DELIVERY", "OTHER"]).default("ADMINISTRATIVE"),
    operationId: optionalText(120),
    departmentId: z.string().min(5),
    responsibleEmployeeId: z.string().min(5),
    assigneeEmployeeId: z.string().min(5),
    plannedDate: optionalDate,
    plannedStartTime: optionalText(20),
    deadlineTime: optionalText(20),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    status: z.enum(["TODO", "IN_PROGRESS", "PENDING_VALIDATION", "COMPLETED", "VALIDATED", "REJECTED", "LATE", "BLOCKED", "CANCELED"]).default("TODO"),
    progress: z.coerce.number().int().min(0).max(100).default(0),
    managerComment: optionalText(1500),
    assigneeComment: optionalText(1500),
    proofUrl: optionalText(600),
    lateReason: optionalText(1000),
    blockerReason: optionalText(1000),
  }),
  recurringTasks: z.object({
    title: z.string().min(2).max(180),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]).default("DAILY"),
    daysOfWeek: optionalText(120),
    startDate: optionalDate,
    endDate: optionalDate,
    deadlineTime: optionalText(20),
    departmentId: z.string().min(5),
    responsibleEmployeeId: z.string().min(5),
    assigneeEmployeeId: z.string().min(5),
    taskTemplate: z.string().min(5).max(1800),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  }),
  departmentRequests: z.object({
    requesterDepartmentId: z.string().min(5),
    targetDepartmentId: z.string().min(5),
    subject: z.string().min(2).max(180),
    description: optionalText(1800),
    requesterEmployeeId: z.string().min(5),
    targetResponsibleEmployeeId: z.string().min(5),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    status: z.enum(["NEW", "ACCEPTED", "IN_PROGRESS", "WAITING_INFORMATION", "DONE", "REJECTED", "BLOCKED", "CANCELED"]).default("NEW"),
    requestedAt: optionalDate,
    dueDate: optionalDate,
    expectedResponse: optionalText(1200),
    comment: optionalText(1200),
    taskId: optionalText(120),
    operationId: optionalText(120),
  }),
  blockers: z.object({
    title: z.string().min(2).max(180),
    description: optionalText(1800),
    sourceType: z.enum(["TASK", "OPERATION", "DEPARTMENT_REQUEST", "HR", "FINANCE", "TECHNICAL", "INFORMATION", "VALIDATION_DELAY", "OTHER"]).default("TASK"),
    taskId: optionalText(120),
    operationId: optionalText(120),
    departmentId: z.string().min(5),
    responsibleEmployeeId: z.string().min(5),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    impact: optionalText(1200),
    correctiveAction: optionalText(1200),
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "UNRESOLVED", "ESCALATED", "CANCELED"]).default("OPEN"),
    declaredAt: optionalDate,
    resolvedAt: optionalDate,
    resolutionComment: optionalText(1500),
  }),
  meetings: z.object({
    title: z.string().min(2).max(180),
    meetingType: z.enum(["COORDINATION", "STRATEGIC", "OPERATIONAL", "FOLLOW_UP", "TECHNICAL", "FINANCIAL", "HR", "CLIENT", "OTHER"]).default("COORDINATION"),
    meetingDate: optionalDate,
    meetingTime: optionalText(20),
    departmentId: optionalText(120),
    participants: optionalText(1200),
    agenda: optionalText(1800),
    decisions: optionalText(1800),
    generatedTasks: optionalText(1200),
    reportOwnerEmployeeId: z.string().min(5),
    status: z.enum(["PLANNED", "HELD", "POSTPONED", "CANCELED"]).default("PLANNED"),
    minutes: optionalText(2400),
    attachmentUrl: optionalText(600),
  }),
  workflows: z.object({
    name: z.string().min(2).max(180),
    description: optionalText(1800),
    departmentId: z.string().min(5),
    steps: z.string().min(5).max(3000),
    stepOwners: optionalText(1600),
    stepDeadlines: optionalText(1000),
    status: z.enum(["DRAFT", "ACTIVE", "IN_PROGRESS", "COMPLETED", "BLOCKED", "ARCHIVED"]).default("DRAFT"),
    shareEmployeeIds: optionalText(1600),
    shareInstruction: optionalText(1200),
  }),
  reports: z.object({
    title: z.string().min(2).max(180),
    reportType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "DEPARTMENT", "EMPLOYEE", "OPERATION"]).default("DAILY"),
    periodStart: optionalDate,
    periodEnd: optionalDate,
    departmentId: optionalText(120),
    employeeId: optionalText(120),
    recipientEmployeeId: optionalText(120),
    operationId: optionalText(120),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    content: optionalText(3000),
    tasksCreated: z.coerce.number().int().min(0).max(1_000_000).default(0),
    tasksCompleted: z.coerce.number().int().min(0).max(1_000_000).default(0),
    tasksValidated: z.coerce.number().int().min(0).max(1_000_000).default(0),
    tasksRejected: z.coerce.number().int().min(0).max(1_000_000).default(0),
    lateTasks: z.coerce.number().int().min(0).max(1_000_000).default(0),
    blockersCount: z.coerce.number().int().min(0).max(1_000_000).default(0),
    executionRate: z.coerce.number().min(0).max(100).default(0),
    mainBlockers: optionalText(1600),
    recommendations: optionalText(2000),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  }),
};

export const operationPatchSchema = z.object({
  status: z.string().min(2).max(80).optional(),
  notes: optionalText(1500),
});

export const companyProfileSchema = z.object({
  organizationName: z.string().min(2).max(180),
  legalForm: z.string().max(120).optional().or(z.literal("")),
  sector: z.string().max(140).optional().or(z.literal("")),
  sizeRange: z.string().max(80).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  website: z.string().max(180).optional().or(z.literal("")),
  description: z.string().max(1200).optional().or(z.literal("")),
  mission: z.string().max(1200).optional().or(z.literal("")),
  productsServices: z.string().max(2000).optional().or(z.literal("")),
  customers: z.string().max(1200).optional().or(z.literal("")),
  markets: z.string().max(1200).optional().or(z.literal("")),
  competitors: z.string().max(1200).optional().or(z.literal("")),
  processes: z.string().max(2000).optional().or(z.literal("")),
  tools: z.string().max(1600).optional().or(z.literal("")),
  dataSystems: z.string().max(1600).optional().or(z.literal("")),
  compliance: z.string().max(1600).optional().or(z.literal("")),
  challenges: z.string().max(2000).optional().or(z.literal("")),
  goals: z.string().max(1600).optional().or(z.literal("")),
  kpis: z.string().max(1600).optional().or(z.literal("")),
  userPosition: z.string().max(140).optional().or(z.literal("")),
  department: z.string().max(140).optional().or(z.literal("")),
  responsibilities: z.string().max(2000).optional().or(z.literal("")),
  decisionRole: z.string().max(800).optional().or(z.literal("")),
});

export const companyActivitySchema = z.object({
  title: z.string().min(3).max(180),
  description: z.string().min(10).max(2000),
  frequency: z.string().max(100).optional().or(z.literal("")),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  tools: z.string().max(1200).optional().or(z.literal("")),
  dataInputs: z.string().max(1200).optional().or(z.literal("")),
  dataOutputs: z.string().max(1200).optional().or(z.literal("")),
  painPoints: z.string().max(1600).optional().or(z.literal("")),
});

export const newsletterSubscriptionSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180).transform((email) => email.toLowerCase()),
  companyName: z.string().max(160).optional().or(z.literal("")),
  interest: z.string().max(240).optional().or(z.literal("")),
  consent: z.literal(true),
});

export const publicContactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180).transform((email) => email.toLowerCase()),
  phone: z.string().max(40).optional().or(z.literal("")),
  companyName: z.string().max(160).optional().or(z.literal("")),
  subject: z.string().min(3).max(160),
  message: z.string().min(10).max(3_000),
  source: z.string().max(80).default("landing"),
});

export const publicPublicationSchema = z.object({
  title: z.string().min(3).max(180),
  slug: z
    .string()
    .min(3)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(["RESSOURCE", "ARTICLE", "GUIDE", "CAS_PRATIQUE", "ANNONCE", "PROJET"]).default("RESSOURCE"),
  excerpt: z.string().min(20).max(500),
  content: z.string().min(80).max(12000),
  contentHtml: z.string().max(60000).optional().or(z.literal("")),
  coverLabel: z.string().max(80).optional().or(z.literal("")),
  published: z.coerce.boolean().default(false),
});

export const publicPublicationCommentSchema = z.object({
  content: z.string().min(1).max(1_000),
  parentId: z.string().min(1).max(120).optional().or(z.literal("")),
});

export const publicPublicationCommentUpdateSchema = z.object({
  content: z.string().min(1).max(1_000),
});

export const publicPublicationReactionSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const checkoutSchema = z.object({
  planId: z.string().min(2).max(80),
  walletId: z.string().max(40).optional().or(z.literal("")),
  provider: z.enum(["MPESA", "ORANGE", "AIRTEL", "AFRICEL", "MTN"]).default("MPESA"),
});

export const documentUploadSchema = z.object({
  title: z.string().min(2).max(160).optional().or(z.literal("")),
});

export const maishaPayCallbackSchema = z.object({
  transactionReference: z.string().min(1).optional(),
  originatingTransactionId: z.string().min(1).optional(),
  transactionId: z.string().min(1).optional(),
  status: z.union([z.string(), z.number()]).optional(),
  statusCode: z.union([z.string(), z.number()]).optional(),
  statusDescription: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
}).passthrough();
