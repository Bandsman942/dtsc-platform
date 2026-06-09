import { z } from "zod";
import {
  PHARMACY_ADMINISTRATION_ROUTES,
  PHARMACY_CURRENCIES,
  PHARMACY_PRODUCT_CATEGORIES,
  PHARMACY_PRODUCT_FORMS,
  PHARMACY_PRODUCT_STATUSES,
  PHARMACY_PRODUCT_UNITS,
  PHARMACY_STORAGE_TYPES,
} from "@/lib/pharmacy-products";
import {
  PHARMACY_BATCH_MANUAL_STATUSES,
  PHARMACY_BATCH_STORAGE_CONDITIONS,
} from "@/lib/pharmacy-batch-options";

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
  organizationId: z.string().max(120).optional().or(z.literal("")),
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
  startPage: z.enum(["/dashboard", "/chat", "/billing", "/company", "/calendar", "/collaborators", "/activities", "/support", "/notifications", "/announcements", "/profile", "/settings"]).default("/dashboard"),
  locale: z.enum(["fr", "en"]).default("fr"),
  timezone: z.string().min(2).max(80).default("Africa/Kinshasa"),
  dateFormat: z.enum(["FR", "US", "ISO", "LONG"]).default("FR"),
  callSoundsEnabled: z.coerce.boolean().default(true),
  callNotificationsEnabled: z.coerce.boolean().default(true),
  floatingCallAlertsEnabled: z.coerce.boolean().default(true),
  participantEventAlertsEnabled: z.coerce.boolean().default(true),
  callAlertSoundEnabled: z.coerce.boolean().default(true),
  incomingCallBannerEnabled: z.coerce.boolean().default(true),
  connectionIssueSoundsEnabled: z.coerce.boolean().default(true),
  startMutedByDefault: z.coerce.boolean().default(false),
  startCameraOffByDefault: z.coerce.boolean().default(true),
  callSoundVolume: z.coerce.number().int().min(0).max(100).default(45),
  callAlertDisplayDuration: z.coerce.number().int().min(2500).max(15000).default(6000),
  preferredAudioInputId: z.string().max(240).optional().nullable().or(z.literal("")),
  preferredVideoInputId: z.string().max(240).optional().nullable().or(z.literal("")),
  preferredAudioOutputId: z.string().max(240).optional().nullable().or(z.literal("")),
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

export const enterpriseOrganizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional().or(z.literal("")),
  sectorId: z.string().max(160).optional().or(z.literal("")),
  industry: z.string().max(160).optional().or(z.literal("")),
  country: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(60).optional().or(z.literal("")),
  address: z.string().max(240).optional().or(z.literal("")),
  timezone: z.string().max(80).default("Africa/Kinshasa"),
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"]).default("DRAFT"),
  adminUserId: z.string().optional().or(z.literal("")),
  planId: z.string().optional().or(z.literal("")),
  applySectorTemplate: z.coerce.boolean().default(false),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const enterpriseOrganizationUpdateSchema = z.object({
  action: z.enum(["update", "set_status", "grant_admin", "revoke_admin", "apply_sector_template", "update_subscription", "soft_delete"]),
  name: z.string().trim().min(2).max(160).optional(),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional().or(z.literal("")),
  sectorId: z.string().max(160).optional().or(z.literal("")),
  industry: z.string().max(160).optional().or(z.literal("")),
  country: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(60).optional().or(z.literal("")),
  address: z.string().max(240).optional().or(z.literal("")),
  timezone: z.string().max(80).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
  userId: z.string().optional().or(z.literal("")),
  planId: z.string().optional().or(z.literal("")),
  subscriptionStatus: z.enum(["ACTIVE", "PENDING_PAYMENT", "PAST_DUE", "CANCELED", "EXPIRED", "SUSPENDED", "TRIAL"]).optional(),
  startedAt: z.string().optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
  trialEndsAt: z.string().optional().or(z.literal("")),
  templateMode: z.enum(["merge", "replace_sector"]).default("merge"),
  reason: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

const organizationSubscriptionStatusSchema = z.enum([
  "ACTIVE",
  "PENDING_PAYMENT",
  "PAST_DUE",
  "CANCELED",
  "EXPIRED",
  "SUSPENDED",
  "TRIAL",
]);

export const organizationSubscriptionCreateSchema = z.object({
  organizationId: z.string().min(1).max(160),
  planId: z.string().min(1).max(160),
  status: organizationSubscriptionStatusSchema.default("PENDING_PAYMENT"),
  startedAt: z.string().optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
  trialEndsAt: z.string().optional().or(z.literal("")),
  reason: z.string().trim().min(3).max(500),
});

export const organizationSubscriptionUpdateSchema = z.object({
  action: z.enum(["update", "activate", "start_trial", "renew", "suspend", "mark_past_due", "cancel", "expire"]),
  planId: z.string().max(160).optional().or(z.literal("")),
  status: organizationSubscriptionStatusSchema.optional(),
  startedAt: z.string().optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
  trialEndsAt: z.string().optional().or(z.literal("")),
  reason: z.string().trim().min(3).max(500),
});

export const billingPlanUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(1000),
  priceUsd: z.coerce.number().min(0).max(1_000_000).refine((value) => Math.round(value * 100) / 100 === value, "Le prix accepte au maximum deux décimales."),
  dailyMessageLimit: z.coerce.number().int().min(1).max(1_000_000),
  dailyTokenLimit: z.coerce.number().int().min(1_000).max(1_000_000_000),
  maxDocuments: z.coerce.number().int().min(0).max(1_000_000),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  isActive: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

export const enterpriseModuleToggleSchema = z.object({
  isEnabled: z.coerce.boolean(),
});

export const enterpriseDepartmentSchema = z.object({
  departmentCode: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  labelFr: z.string().trim().min(2).max(160),
  labelEn: z.string().trim().min(2).max(160),
  descriptionFr: z.string().max(800).optional().or(z.literal("")),
  descriptionEn: z.string().max(800).optional().or(z.literal("")),
  responsibleUserId: z.string().max(160).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const enterprisePositionSchema = z.object({
  positionCode: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  labelFr: z.string().trim().min(2).max(160),
  labelEn: z.string().trim().min(2).max(160),
  descriptionFr: z.string().max(1000).optional().or(z.literal("")),
  descriptionEn: z.string().max(1000).optional().or(z.literal("")),
  departmentId: z.string().max(160).optional().or(z.literal("")),
  hierarchyLevel: z.coerce.number().int().min(1).max(100).default(50),
  isKeyPosition: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  permissions: z.array(z.string().min(3).max(120)).max(100).default([]),
});

export const enterpriseWorkflowSchema = z.object({
  workflowCode: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  labelFr: z.string().trim().min(3).max(180),
  labelEn: z.string().trim().min(3).max(180),
  descriptionFr: z.string().max(1600).optional().or(z.literal("")),
  descriptionEn: z.string().max(1600).optional().or(z.literal("")),
  category: z.string().max(120).optional().or(z.literal("")),
  departmentId: z.string().max(160).optional().or(z.literal("")),
  responsibleUserIds: z.array(z.string().min(1).max(160)).max(50).default([]),
  recipientUserIds: z.array(z.string().min(1).max(160)).max(100).default([]),
  steps: z.string().max(4000).optional().or(z.literal("")),
  recommendedDelay: z.string().max(120).optional().or(z.literal("")),
  documents: z.string().max(1000).optional().or(z.literal("")),
  comment: z.string().max(1000).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE", "SHARED", "ARCHIVED"]).default("ACTIVE"),
  isEnabled: z.coerce.boolean().default(true),
});

export const enterpriseSettingsSchema = z.object({
  displayName: z.string().trim().min(2).max(180),
  logoUrl: z.string().url().max(600).optional().or(z.literal("")),
  primaryColor: z.string().max(40).optional().or(z.literal("")),
  country: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  address: z.string().max(240).optional().or(z.literal("")),
  phone: z.string().max(80).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  defaultLanguage: z.enum(["fr", "en"]).default("fr"),
  timezone: z.string().max(80).default("Africa/Kinshasa"),
  establishmentType: z.enum(["CABINET", "CLINIC", "HOSPITAL", "MEDICAL_CENTER"]).default("CLINIC"),
  patientPrefix: z.string().max(20).default("PAT-"),
  invoicePrefix: z.string().max(20).default("FAC-"),
  activeServices: z.string().max(1200).optional().or(z.literal("")),
  enhancedMedicalPrivacy: z.coerce.boolean().default(true),
  medicalRecordRoles: z.string().max(800).optional().or(z.literal("")),
  closeConsultationRoles: z.string().max(800).optional().or(z.literal("")),
  reopenConsultationRoles: z.string().max(800).optional().or(z.literal("")),
  labValidationRoles: z.string().max(800).optional().or(z.literal("")),
  consultationLockHours: z.coerce.number().int().min(0).max(8760).default(48),
  pharmacyAlertOptions: z.string().max(1200).optional().or(z.literal("")),
  laboratoryAlertOptions: z.string().max(1200).optional().or(z.literal("")),
  criticalIncidentOptions: z.string().max(1200).optional().or(z.literal("")),
  pharmacyType: z.string().max(120).optional().or(z.literal("")),
  pharmacyCurrency: z.string().max(12).optional().or(z.literal("")),
  pharmacySalePrefix: z.string().max(20).optional().or(z.literal("")),
  pharmacyOrderPrefix: z.string().max(20).optional().or(z.literal("")),
  pharmacyReceiptPrefix: z.string().max(20).optional().or(z.literal("")),
  pharmacyExpiryAlertDays: z.coerce.number().int().min(1).max(730).default(90),
  pharmacyFefoEnabled: z.coerce.boolean().default(true),
  pharmacyNegativeStockBlocked: z.coerce.boolean().default(true),
});

export const enterpriseAdministrationMutationSchema = z.discriminatedUnion("entityType", [
  enterpriseDepartmentSchema.extend({ entityType: z.literal("department") }),
  enterprisePositionSchema.extend({ entityType: z.literal("position") }),
  enterpriseWorkflowSchema.extend({ entityType: z.literal("workflow") }),
  enterpriseSettingsSchema.extend({ entityType: z.literal("settings") }),
]);

export const enterpriseMemberInviteSchema = z.object({
  email: z.string().email().max(180).transform((email) => email.toLowerCase()),
  role: z.enum(["MANAGER", "MEMBER", "GUEST"]).default("MEMBER"),
  message: z.string().max(800).optional().or(z.literal("")),
});

export const enterpriseActivityRequestSchema = z.object({
  blockCode: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(5).max(2500),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  assignedToUserId: z.string().max(160).optional().or(z.literal("")),
  metadata: z.record(z.string(), z.string().max(1000)).default({}),
});

const enterpriseHealthcareRecordBaseSchema = z.object({
  moduleCode: z.enum([
    "PATIENTS",
    "APPOINTMENTS",
    "CONSULTATIONS",
    "MEDICAL_RECORDS",
    "CARE_TEAM",
    "LABORATORY",
    "INTERNAL_PHARMACY",
    "MEDICAL_BILLING",
    "INSURANCE_COVERAGE",
    "QUALITY_INCIDENTS",
    "MEDICAL_CONFIDENTIALITY",
    "MEDICAL_DOCUMENTS",
    "HEALTH_SETTINGS",
    "HEALTH_REPORTS",
  ]),
  recordType: z.enum([
    "PATIENT_PROFILE",
    "APPOINTMENT",
    "CONSULTATION",
    "MEDICAL_RECORD",
    "CARE_TEAM_MEMBER",
    "LAB_REQUEST",
    "PHARMACY_ITEM",
    "MEDICAL_INVOICE",
    "INSURANCE_COVERAGE",
    "QUALITY_INCIDENT",
    "CONFIDENTIALITY_RULE",
    "MEDICAL_DOCUMENT",
    "HEALTH_SETTING",
    "HEALTH_REPORT",
  ]),
  title: z.string().trim().min(3).max(180),
  summary: z.string().max(1200).optional().or(z.literal("")),
  status: z.enum([
    "DRAFT",
    "ACTIVE",
    "INACTIVE",
    "ARCHIVED",
    "DECEASED",
    "SCHEDULED",
    "CONFIRMED",
    "WAITING",
    "IN_PROGRESS",
    "DONE",
    "CANCELLED",
    "NO_SHOW",
    "PENDING_EXAMS",
    "REVIEW",
    "CLOSED",
    "REQUESTED",
    "SAMPLED",
    "ANALYZING",
    "RESULT_AVAILABLE",
    "VALIDATED",
    "LOW_STOCK",
    "OUT_OF_STOCK",
    "EXPIRED",
    "ISSUED",
    "PARTIAL_PAID",
    "PAID",
    "REFUNDED",
    "SUBMITTED",
    "APPROVED",
    "PARTIAL_APPROVED",
    "REJECTED",
    "OPEN",
    "ANALYSIS",
    "RESOLVED",
    "CONVERTED",
    "STOCK_IN",
    "STOCK_OUT",
    "ADJUSTED",
  ]).default("ACTIVE"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  assignedToUserId: z.string().max(160).optional().or(z.literal("")),
  patientRecordId: z.string().max(160).optional().or(z.literal("")),
  appointmentRecordId: z.string().max(160).optional().or(z.literal("")),
  consultationRecordId: z.string().max(160).optional().or(z.literal("")),
  departmentId: z.string().max(160).optional().or(z.literal("")),
  positionId: z.string().max(160).optional().or(z.literal("")),
  patientCode: z.string().max(80).optional().or(z.literal("")),
  patientName: z.string().max(160).optional().or(z.literal("")),
  contactPhone: z.string().max(80).optional().or(z.literal("")),
  appointmentDate: z.string().max(80).optional().or(z.literal("")),
  appointmentType: z.string().max(120).optional().or(z.literal("")),
  careTeam: z.string().max(500).optional().or(z.literal("")),
  incidentType: z.string().max(140).optional().or(z.literal("")),
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  confidentialityLevel: z.enum(["STANDARD", "CONFIDENTIAL", "RESTRICTED"]).default("CONFIDENTIAL"),
  insuranceProvider: z.string().max(140).optional().or(z.literal("")),
  sex: z.string().max(60).optional().or(z.literal("")),
  birthDateOrAge: z.string().max(80).optional().or(z.literal("")),
  address: z.string().max(240).optional().or(z.literal("")),
  emergencyContact: z.string().max(160).optional().or(z.literal("")),
  emergencyPhone: z.string().max(80).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  profession: z.string().max(140).optional().or(z.literal("")),
  maritalStatus: z.string().max(80).optional().or(z.literal("")),
  bloodGroup: z.string().max(40).optional().or(z.literal("")),
  allergies: z.string().max(1200).optional().or(z.literal("")),
  medicalHistory: z.string().max(2000).optional().or(z.literal("")),
  linkedRecordId: z.string().max(160).optional().or(z.literal("")),
  healthProfessional: z.string().max(160).optional().or(z.literal("")),
  vitalSigns: z.string().max(1200).optional().or(z.literal("")),
  symptoms: z.string().max(2000).optional().or(z.literal("")),
  clinicalExam: z.string().max(2000).optional().or(z.literal("")),
  provisionalDiagnosis: z.string().max(1200).optional().or(z.literal("")),
  finalDiagnosis: z.string().max(1200).optional().or(z.literal("")),
  treatmentPlan: z.string().max(2000).optional().or(z.literal("")),
  prescription: z.string().max(2000).optional().or(z.literal("")),
  requestedExams: z.string().max(1600).optional().or(z.literal("")),
  recommendations: z.string().max(1600).optional().or(z.literal("")),
  service: z.string().max(140).optional().or(z.literal("")),
  amountRequested: z.string().max(80).optional().or(z.literal("")),
  amountApproved: z.string().max(80).optional().or(z.literal("")),
  invoiceLines: z.string().max(3000).optional().or(z.literal("")),
  totalAmount: z.string().max(80).optional().or(z.literal("")),
  paymentMethod: z.string().max(100).optional().or(z.literal("")),
  stockQuantity: z.string().max(80).optional().or(z.literal("")),
  stockThreshold: z.string().max(80).optional().or(z.literal("")),
  expiryDate: z.string().max(80).optional().or(z.literal("")),
  documentType: z.string().max(120).optional().or(z.literal("")),
  fileReference: z.string().max(500).optional().or(z.literal("")),
  settingKey: z.string().max(120).optional().or(z.literal("")),
  settingValue: z.string().max(1000).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const enterpriseHealthcareRecordSchema = enterpriseHealthcareRecordBaseSchema;

export const enterpriseHealthcareRecordUpdateSchema = enterpriseHealthcareRecordBaseSchema.partial().extend({
  action: z.enum(["confirm", "cancel", "mark_absent", "convert_consultation", "close", "reopen", "submit", "approve", "reject", "validate", "stock_in", "stock_out", "adjust", "resolve"]).optional(),
  actionReason: z.string().max(600).optional().or(z.literal("")),
});

const enterprisePharmacyRecordBaseSchema = z.object({
  moduleCode: z.enum([
    "MEDICINES_PRODUCTS",
    "BATCH_EXPIRY",
    "STOCK_INVENTORY",
    "STOCK_RECEIPTS",
    "SALES_DISPENSATION",
    "PRESCRIPTIONS",
    "SUPPLIERS_ORDERS",
    "CASH_INVOICES_PAYMENTS",
    "RETURNS_ADJUSTMENTS_LOSSES",
    "ALERTS_EXPIRY_LOW_STOCK",
    "QUALITY_PHARMACOVIGILANCE",
    "PHARMACY_DOCUMENTS",
    "PHARMACY_REPORTS",
    "PHARMACY_SETTINGS",
  ]),
  recordType: z.enum([
    "PHARMACY_PRODUCT",
    "PHARMACY_BATCH",
    "PHARMACY_INVENTORY",
    "PHARMACY_RECEIPT",
    "PHARMACY_SALE",
    "PHARMACY_PRESCRIPTION",
    "PHARMACY_SUPPLIER_ORDER",
    "PHARMACY_CASH",
    "PHARMACY_ADJUSTMENT",
    "PHARMACY_ALERT",
    "PHARMACY_QUALITY_INCIDENT",
    "PHARMACY_DOCUMENT",
    "PHARMACY_REPORT",
    "PHARMACY_SETTING",
  ]),
  title: z.string().trim().min(2).max(180),
  summary: z.string().max(1600).optional().or(z.literal("")),
  status: z.string().trim().min(2).max(80).default("DRAFT"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  assignedToUserId: z.string().max(160).optional().or(z.literal("")),
  productId: z.string().max(160).optional().or(z.literal("")),
  batchId: z.string().max(160).optional().or(z.literal("")),
  supplierId: z.string().max(160).optional().or(z.literal("")),
  purchaseOrderId: z.string().max(160).optional().or(z.literal("")),
  receiptId: z.string().max(160).optional().or(z.literal("")),
  saleId: z.string().max(160).optional().or(z.literal("")),
  prescriptionId: z.string().max(160).optional().or(z.literal("")),
  departmentId: z.string().max(160).optional().or(z.literal("")),
  responsibleUserId: z.string().max(160).optional().or(z.literal("")),
  recordKind: z.string().max(100).optional().or(z.literal("")),
  internalCode: z.string().max(100).optional().or(z.literal("")),
  genericName: z.string().max(180).optional().or(z.literal("")),
  barcode: z.string().max(160).optional().or(z.literal("")),
  category: z.string().max(140).optional().or(z.literal("")),
  pharmaceuticalForm: z.string().max(140).optional().or(z.literal("")),
  dosage: z.string().max(120).optional().or(z.literal("")),
  unit: z.string().max(80).optional().or(z.literal("")),
  batchNumber: z.string().max(140).optional().or(z.literal("")),
  expiryDate: z.string().max(80).optional().or(z.literal("")),
  transactionDate: z.string().max(80).optional().or(z.literal("")),
  quantity: z.coerce.number().min(0).max(1_000_000_000).default(0),
  availableQuantity: z.coerce.number().min(0).max(1_000_000_000).default(0),
  minStock: z.coerce.number().min(0).max(1_000_000_000).default(0),
  maxStock: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  unitPrice: z.coerce.number().min(0).max(1_000_000_000).default(0),
  totalAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  currency: z.string().max(12).default("USD"),
  location: z.string().max(180).optional().or(z.literal("")),
  paymentMethod: z.string().max(100).optional().or(z.literal("")),
  customerName: z.string().max(180).optional().or(z.literal("")),
  reason: z.string().max(1600).optional().or(z.literal("")),
  notes: z.string().max(2500).optional().or(z.literal("")),
  documentUrl: z.string().max(600).optional().or(z.literal("")),
  prescriptionRequired: z.coerce.boolean().default(false),
  controlledProduct: z.coerce.boolean().default(false),
  pharmacistValidationRequired: z.coerce.boolean().default(false),
});

export const enterprisePharmacyRecordSchema = enterprisePharmacyRecordBaseSchema;
export const enterprisePharmacyRecordUpdateSchema = enterprisePharmacyRecordBaseSchema.partial().extend({
  action: z.enum(["submit", "validate", "receive", "pay", "cancel", "close", "resolve", "quarantine", "recall", "archive"]).optional(),
  actionReason: z.string().max(800).optional().or(z.literal("")),
});

const optionalProductNumber = z.union([z.literal(""), z.coerce.number().min(0)]).optional().nullable();
const pharmacyProductBaseSchema = z.object({
  name: z.string().trim().min(2).max(180),
  genericName: z.string().trim().max(180).optional().or(z.literal("")),
  internalCode: z.string().trim().min(1).max(100),
  barcode: z.string().trim().max(160).optional().or(z.literal("")),
  manufacturer: z.string().trim().max(180).optional().or(z.literal("")),
  brand: z.string().trim().max(180).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(1000).optional().or(z.literal("")),
  category: z.enum(PHARMACY_PRODUCT_CATEGORIES),
  subcategory: z.string().trim().max(140).optional().or(z.literal("")),
  pharmaceuticalForm: z.enum(PHARMACY_PRODUCT_FORMS),
  dosage: z.string().trim().max(120).optional().or(z.literal("")),
  saleUnit: z.enum(PHARMACY_PRODUCT_UNITS),
  stockUnit: z.enum(PHARMACY_PRODUCT_UNITS),
  packaging: z.string().trim().max(180).optional().or(z.literal("")),
  administrationRoute: z.enum(PHARMACY_ADMINISTRATION_ROUTES).optional().or(z.literal("")),
  prescriptionRequired: z.coerce.boolean().default(false),
  pharmacistValidationRequired: z.coerce.boolean().default(false),
  controlledProduct: z.coerce.boolean().default(false),
  otcAllowed: z.coerce.boolean().default(true),
  maxQuantityPerSale: z.union([z.literal(""), z.coerce.number().int().min(1).max(1_000_000)]).optional().nullable(),
  genericSubstitutionAllowed: z.coerce.boolean().default(false),
  saleWarningMessage: z.string().trim().max(1000).optional().or(z.literal("")),
  stockTrackingEnabled: z.coerce.boolean().default(true),
  minStock: z.coerce.number().min(0).max(1_000_000_000).default(0),
  maxStock: optionalProductNumber,
  safetyStock: optionalProductNumber,
  defaultLocation: z.string().trim().max(180).optional().or(z.literal("")),
  shelf: z.string().trim().max(120).optional().or(z.literal("")),
  unitsPerPackage: optionalProductNumber,
  storageType: z.enum(PHARMACY_STORAGE_TYPES).optional().or(z.literal("")),
  tempMin: z.union([z.literal(""), z.coerce.number().min(-100).max(100)]).optional().nullable(),
  tempMax: z.union([z.literal(""), z.coerce.number().min(-100).max(100)]).optional().nullable(),
  lightSensitive: z.coerce.boolean().default(false),
  humiditySensitive: z.coerce.boolean().default(false),
  refrigerated: z.coerce.boolean().default(false),
  storageNotes: z.string().trim().max(1200).optional().or(z.literal("")),
  referencePurchasePrice: optionalProductNumber,
  referenceSalePrice: optionalProductNumber,
  currency: z.enum(PHARMACY_CURRENCIES).default("USD"),
  targetMargin: z.union([z.literal(""), z.coerce.number().min(0).max(10000)]).optional().nullable(),
  taxRate: z.union([z.literal(""), z.coerce.number().min(0).max(100)]).optional().nullable(),
  priceEditableAtSale: z.coerce.boolean().default(false),
  discountAllowed: z.coerce.boolean().default(true),
  maxDiscountRate: z.union([z.literal(""), z.coerce.number().min(0).max(100)]).optional().nullable(),
  status: z.enum(PHARMACY_PRODUCT_STATUSES).default("ACTIVE"),
  deactivationReason: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function validPharmacyProductRanges(data: z.infer<typeof pharmacyProductBaseSchema>) {
  const maxStockValid = data.maxStock === "" || data.maxStock === null || data.maxStock === undefined || data.maxStock > data.minStock;
  const temperatureValid = data.tempMin === "" || data.tempMin === null || data.tempMin === undefined || data.tempMax === "" || data.tempMax === null || data.tempMax === undefined || data.tempMin < data.tempMax;
  return maxStockValid && temperatureValid;
}

export const pharmacyProductSchema = pharmacyProductBaseSchema.refine(validPharmacyProductRanges, {
  message: "Le stock maximal doit dépasser le stock minimal et la température maximale doit dépasser la minimale.",
});
export const pharmacyProductUpdateSchema = pharmacyProductBaseSchema.partial().refine((data) => {
  if (data.minStock === undefined || data.maxStock === undefined || data.maxStock === "" || data.maxStock === null) return true;
  return data.maxStock > data.minStock;
}, { message: "Le stock maximal doit dépasser le stock minimal." }).refine((data) => {
  if (data.tempMin === undefined || data.tempMax === undefined || data.tempMin === "" || data.tempMin === null || data.tempMax === "" || data.tempMax === null) return true;
  return data.tempMin < data.tempMax;
}, { message: "La température maximale doit dépasser la température minimale." });

const optionalBatchNumber = z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)]).optional().nullable();
const optionalBatchDate = z.union([z.literal(""), z.coerce.date()]).optional().nullable();
const optionalBatchUrl = z.string().trim().max(2000).optional().or(z.literal(""));
const pharmacyBatchBaseSchema = z.object({
  productId: z.string().min(1),
  supplierId: z.string().max(120).optional().or(z.literal("")),
  purchaseOrderId: z.string().max(120).optional().or(z.literal("")),
  receiptId: z.string().max(120).optional().or(z.literal("")),
  batchNumber: z.string().trim().min(1).max(160),
  serialNumber: z.string().trim().max(160).optional().or(z.literal("")),
  barcode: z.string().trim().max(160).optional().or(z.literal("")),
  internalReference: z.string().trim().max(160).optional().or(z.literal("")),
  manufacturerReference: z.string().trim().max(160).optional().or(z.literal("")),
  manufacturingDate: optionalBatchDate,
  expiryDate: z.coerce.date(),
  receivedAt: optionalBatchDate,
  stockEntryDate: optionalBatchDate,
  receivedById: z.string().max(120).optional().or(z.literal("")),
  receivedQuantity: z.coerce.number().gt(0).max(1_000_000_000),
  availableQuantity: z.coerce.number().min(0).max(1_000_000_000),
  reservedQuantity: z.coerce.number().min(0).max(1_000_000_000).default(0),
  damagedQuantity: z.coerce.number().min(0).max(1_000_000_000).default(0),
  unit: z.string().trim().min(1).max(80),
  minQuantityAlert: optionalBatchNumber,
  expiryAlertDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(3650)]).optional().nullable(),
  location: z.string().trim().max(180).optional().or(z.literal("")),
  shelf: z.string().trim().max(120).optional().or(z.literal("")),
  zone: z.string().trim().max(120).optional().or(z.literal("")),
  storageConditions: z.enum(PHARMACY_BATCH_STORAGE_CONDITIONS).optional().or(z.literal("")),
  tempMin: z.union([z.literal(""), z.coerce.number().min(-100).max(100)]).optional().nullable(),
  tempMax: z.union([z.literal(""), z.coerce.number().min(-100).max(100)]).optional().nullable(),
  storageNotes: z.string().trim().max(1200).optional().or(z.literal("")),
  purchasePrice: optionalBatchNumber,
  salePrice: optionalBatchNumber,
  currency: z.enum(PHARMACY_CURRENCIES).default("USD"),
  status: z.enum(PHARMACY_BATCH_MANUAL_STATUSES).default("ACTIVE"),
  quarantine: z.coerce.boolean().default(false),
  recall: z.coerce.boolean().default(false),
  quarantineReason: z.string().trim().max(1200).optional().or(z.literal("")),
  recallReason: z.string().trim().max(1200).optional().or(z.literal("")),
  recallDate: optionalBatchDate,
  statusReason: z.string().trim().max(1200).optional().or(z.literal("")),
  decisionResponsibleId: z.string().max(120).optional().or(z.literal("")),
  supplierInvoiceRef: z.string().trim().max(180).optional().or(z.literal("")),
  deliveryNoteRef: z.string().trim().max(180).optional().or(z.literal("")),
  qualityDocumentUrl: optionalBatchUrl,
  supplierInvoiceUrl: optionalBatchUrl,
  deliveryNoteUrl: optionalBatchUrl,
  certificateUrl: optionalBatchUrl,
  notes: z.string().trim().max(3000).optional().or(z.literal("")),
});

function validPharmacyBatch(data: z.infer<typeof pharmacyBatchBaseSchema>) {
  const quantitiesValid = data.availableQuantity + data.reservedQuantity + data.damagedQuantity <= data.receivedQuantity;
  const datesValid = !data.manufacturingDate || data.manufacturingDate === "" || data.expiryDate > data.manufacturingDate;
  const temperaturesValid = data.tempMin === "" || data.tempMin === null || data.tempMin === undefined || data.tempMax === "" || data.tempMax === null || data.tempMax === undefined || data.tempMin < data.tempMax;
  return quantitiesValid && datesValid && temperaturesValid;
}

export const pharmacyBatchSchema = pharmacyBatchBaseSchema.refine(validPharmacyBatch, {
  message: "Vérifiez les quantités, les dates et les températures du lot.",
});
export const pharmacyBatchUpdateSchema = pharmacyBatchBaseSchema.partial().refine((data) => {
  if (data.receivedQuantity === undefined) return true;
  return (data.availableQuantity || 0) + (data.reservedQuantity || 0) + (data.damagedQuantity || 0) <= data.receivedQuantity;
}, { message: "Les quantités disponibles, réservées et endommagées dépassent la quantité reçue." }).refine((data) => {
  return !data.manufacturingDate || data.manufacturingDate === "" || !data.expiryDate || data.expiryDate > data.manufacturingDate;
}, { message: "La date de péremption doit être postérieure à la fabrication." });
export const pharmacyBatchActionSchema = z.object({
  reason: z.string().trim().min(3).max(1200),
  decisionResponsibleId: z.string().max(120).optional().or(z.literal("")),
});

const internalCalendarAvailabilityBaseSchema = z.object({
  collaboratorId: z.string().min(1),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  specificDate: z.coerce.date().optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  availabilityStatus: z.enum(["Disponible", "Occupé", "Absent", "Congé", "Télétravail", "Sur site", "Mission", "Formation", "Indisponible"]).default("Disponible"),
  recurrenceType: z.enum(["Aucune", "Quotidienne", "Hebdomadaire", "Mensuelle"]).default("Hebdomadaire"),
  recurrenceStart: z.coerce.date().optional().nullable(),
  recurrenceUntil: z.coerce.date().optional().nullable(),
  recurrenceInterval: z.coerce.number().int().min(1).max(12).default(1),
  locationMode: z.enum(["Site DTSC", "Télétravail", "Externe", "Mission", "Non défini"]).default("Non défini"),
  notes: z.string().max(800).optional().or(z.literal("")),
});

function hasValidAvailabilityTimeRange(data: { startTime?: string; endTime?: string }) {
  return !data.startTime || !data.endTime || data.endTime > data.startTime;
}

function hasValidAvailabilitySchedule(data: { recurrenceType?: string; dayOfWeek?: number | null; specificDate?: Date | null }) {
  if (data.recurrenceType === "Aucune") {
    return Boolean(data.specificDate);
  }
  if (data.recurrenceType === "Hebdomadaire") {
    return typeof data.dayOfWeek === "number";
  }
  return true;
}

export const internalCalendarAvailabilitySchema = internalCalendarAvailabilityBaseSchema.refine(hasValidAvailabilityTimeRange, {
  message: "L'heure de fin doit être après l'heure de début.",
  path: ["endTime"],
}).refine(hasValidAvailabilitySchedule, {
  message: "Choisissez une date précise ou le jour requis pour la fréquence sélectionnée.",
  path: ["specificDate"],
});

export const internalCalendarAvailabilityUpdateSchema = z.object({
  collaboratorId: z.string().min(1).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  specificDate: z.coerce.date().optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  availabilityStatus: z.enum(["Disponible", "Occupé", "Absent", "Congé", "Télétravail", "Sur site", "Mission", "Formation", "Indisponible"]).optional(),
  recurrenceType: z.enum(["Aucune", "Quotidienne", "Hebdomadaire", "Mensuelle"]).optional(),
  recurrenceStart: z.coerce.date().optional().nullable(),
  recurrenceUntil: z.coerce.date().optional().nullable(),
  recurrenceInterval: z.coerce.number().int().min(1).max(12).optional(),
  locationMode: z.enum(["Site DTSC", "Télétravail", "Externe", "Mission", "Non défini"]).optional(),
  notes: z.string().max(800).optional().or(z.literal("")),
}).refine(hasValidAvailabilityTimeRange, {
  message: "L'heure de fin doit être après l'heure de début.",
  path: ["endTime"],
});

const internalCalendarEventBaseSchema = z.object({
  title: z.string().min(3).max(180),
  description: z.string().max(2000).optional().or(z.literal("")),
  eventType: z.enum(["Tâche", "Réunion", "Mission", "Absence", "Congé", "Télétravail", "Présence sur site", "Appel audio", "Appel vidéo", "Formation", "Blocage", "Deadline", "Autre"]).default("Tâche"),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  status: z.enum(["Planifié", "En cours", "Terminé", "Reporté", "Annulé"]).default("Planifié"),
  priority: z.enum(["Faible", "Normale", "Élevée", "Critique"]).default("Normale"),
  locationMode: z.enum(["Site DTSC", "Télétravail", "Externe", "Mission", "Non défini"]).default("Non défini"),
  physicalLocation: z.string().max(180).optional().or(z.literal("")),
  meetingLink: z.string().url().max(500).optional().or(z.literal("")),
  sourceModule: z.string().max(80).optional().or(z.literal("")),
  sourceEntityType: z.string().max(80).optional().or(z.literal("")),
  sourceEntityId: z.string().max(120).optional().or(z.literal("")),
  ownerCollaboratorId: z.string().optional().or(z.literal("")),
  departmentId: z.string().optional().or(z.literal("")),
  visibility: z.enum(["Privé", "Département", "Participants", "Direction", "Public interne"]).default("Participants"),
  participantIds: z.array(z.string().min(1)).max(50).default([]),
  allowConflicts: z.coerce.boolean().default(false),
});

function hasValidInternalCalendarRange(data: { startDateTime?: Date; endDateTime?: Date }) {
  return !data.startDateTime || !data.endDateTime || data.endDateTime > data.startDateTime;
}

export const internalCalendarEventSchema = internalCalendarEventBaseSchema.refine(hasValidInternalCalendarRange, {
  message: "La fin doit être après le début.",
  path: ["endDateTime"],
});

export const internalCalendarEventUpdateSchema = internalCalendarEventBaseSchema
  .partial()
  .extend({
    participantIds: z.array(z.string().min(1)).max(50).optional(),
    allowConflicts: z.coerce.boolean().default(false),
  })
  .refine(hasValidInternalCalendarRange, {
    message: "La fin doit être après le début.",
    path: ["endDateTime"],
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
  replyToId: z.string().min(1).max(120).optional().or(z.literal("")),
});

export const ticketMessageUpdateSchema = z.object({
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

export const collaborationCallStartSchema = z.object({
  callType: z.enum(["AUDIO", "VIDEO"]),
  meetingId: z.string().max(120).optional().nullable().or(z.literal("")),
});

export const collaborationCallParticipantSchema = z.object({
  microphoneEnabled: z.coerce.boolean().optional(),
  cameraEnabled: z.coerce.boolean().optional(),
});

export const collaborationCallEventSchema = z.object({
  eventType: z.enum(["CALL_INTERRUPTED", "CALL_RECONNECTED"]),
});

export const announcementCopySchema = z.object({
  titlePrefix: z.string().max(40).default("Copie de"),
});

export const announcementTransferSchema = z.object({
  recipientIds: z.array(z.string().min(5)).min(1).max(25),
  message: z.string().max(800).optional().or(z.literal("")),
});

export const announcementReportSchema = z.object({
  reason: z.enum(["INAPPROPRIATE", "SPAM", "CONFIDENTIAL", "ERROR", "OTHER"]),
  description: z.string().max(1200).optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
});

export const announcementStatusSchema = z.object({
  action: z.enum(["ARCHIVE", "RESTORE", "PIN", "UNPIN"]),
});

export const collaborationGroupSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(800).optional().or(z.literal("")),
  groupType: z.enum(["COMPANY", "PROJECT", "DTSC_SUPPORT", "INTERNAL", "CLIENT", "CROSS_ORGANIZATION", "PRIVATE_NETWORK", "OTHER"]).default("PROJECT"),
  visibility: z.enum(["PRIVATE", "COMPANY", "INTERNAL"]).default("PRIVATE"),
});

export const collaborationGroupUpdateSchema = collaborationGroupSchema.partial().extend({
  status: z.enum(["ACTIVE", "ARCHIVED", "SUSPENDED"]).optional(),
});

const optionalStringArray = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      return [value];
    }
    return [];
  },
  z.array(z.string().min(5)).max(50).default([])
);

const optionalEmailArray = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean);
    }
    return [];
  },
  z.array(z.string().email().max(180)).max(50).default([])
);

export const collaborationInvitationSchema = z.object({
  invitedUserId: z.string().min(5).optional().or(z.literal("")),
  invitedUserIds: optionalStringArray,
  invitedEmail: z.string().email().max(180).optional().or(z.literal("")),
  invitedEmails: optionalEmailArray,
  invitationMessage: z.string().max(800).optional().or(z.literal("")),
  expiresAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((value) => value ? new Date(value) : undefined),
}).refine((value) => Boolean(value.invitedUserId || value.invitedUserIds.length || value.invitedEmail || value.invitedEmails.length), {
  message: "Au moins un utilisateur ou un email est obligatoire.",
});

export const collaborationInvitationResponseSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE", "CANCEL"]),
});

export const collaborationMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  messageType: z.enum(["TEXT", "CHATBOT_SHARE", "SYSTEM", "FILE", "LINK"]).default("TEXT"),
  replyToId: z.string().max(120).optional().or(z.literal("")),
  sharedChatbotConversationId: z.string().max(120).optional().or(z.literal("")),
  mentionedUserIds: z.array(z.string().min(5)).max(30).default([]),
});

export const collaborationMessageUpdateSchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  status: z.enum(["SENT", "EDITED", "DELETED", "ARCHIVED"]).optional(),
  mentionedUserIds: z.array(z.string().min(5)).max(30).default([]),
});

export const commentMentionSchema = z.object({
  entityType: z.string().min(2).max(80),
  entityId: z.string().min(5),
  content: z.string().min(2).max(2000),
  mentionedUserIds: z.array(z.string().min(5)).max(30).default([]),
});

export const adminSettingsSchema = z.object({
  defaultDailyMessageLimit: z.coerce.number().int().min(1).max(1000),
  defaultDailyTokenLimit: z.coerce.number().int().min(1000).max(2_000_000),
  chatbotEnabled: z.coerce.boolean(),
  publicAgentEnabled: z.coerce.boolean(),
  allowNonClientPublicationDrafts: z.coerce.boolean(),
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

const adminBlockSchema = z.enum(["overview", "settings", "publications", "users", "hrCfo", "sco", "coo", "ceo", "mpo", "cto", "la", "visits", "activity", "audits"]);

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

export const laSchemas = {
  cases: z.object({
    title: z.string().min(2).max(180),
    caseType: z.enum(["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "CONSULTING_CONTRACT", "EMPLOYMENT_CONTRACT", "AGREEMENT", "PARTNERSHIP", "NDA", "ADMINISTRATIVE_DOCUMENT", "DISPUTE", "COMPLIANCE", "SENSITIVE_DATA", "INTELLECTUAL_PROPERTY", "PROJECT_LEGAL_RISK", "TECHNICAL_LEGAL_RISK", "OTHER"]).default("OTHER"),
    requesterDepartmentId: optionalText(120),
    requesterEmployeeId: optionalText(120),
    responsibleLegalId: optionalText(120),
    subject: optionalText(220),
    description: optionalText(2400),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    status: z.enum(["DRAFT", "SUBMITTED", "ANALYSIS", "DRAFTING", "LEGAL_REVIEW", "TO_CORRECT", "LEGAL_VALIDATED", "REJECTED", "WAITING_CEO", "SIGNED", "ARCHIVED", "CANCELED"]).default("SUBMITTED"),
    dueDate: optionalDate,
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    attachmentUrl: optionalText(600),
    legalDecision: optionalText(2200),
    ceoValidationRequired: z.coerce.boolean().default(false),
    comments: optionalText(1800),
  }),
  contracts: z.object({
    title: z.string().min(2).max(180),
    contractType: z.enum(["SERVICE_CONTRACT", "CONSULTING_CONTRACT", "PARTNERSHIP_AGREEMENT", "NDA", "OFFICIAL_LETTER", "MANDATE", "MOU", "DATA_PROTECTION_CLAUSE", "IP_CLAUSE", "INTERNAL_CONFIDENTIALITY", "TERMINATION_CLAUSE", "SUPPLIER_CONTRACT", "EMPLOYMENT_CONTRACT", "OTHER"]).default("SERVICE_CONTRACT"),
    counterparty: optionalText(180),
    requesterDepartmentId: optionalText(120),
    internalResponsibleId: optionalText(120),
    startDate: optionalDate,
    endDate: optionalDate,
    duration: optionalText(120),
    amount: money.optional(),
    currency: z.string().min(3).max(8).default("USD"),
    status: z.enum(["DRAFT", "DRAFTING", "LEGAL_REVIEW", "TO_CORRECT", "LEGAL_VALIDATED", "WAITING_SIGNATURE", "SIGNED", "EXPIRED", "TERMINATED", "ARCHIVED"]).default("DRAFT"),
    version: optionalText(60),
    documentUrl: optionalText(600),
    legalCaseId: optionalText(120),
    legalValidation: optionalText(1800),
    ceoValidationRequired: z.coerce.boolean().default(false),
    comments: optionalText(1800),
  }),
  templates: z.object({
    name: z.string().min(2).max(180),
    templateType: z.enum(["SERVICE_CONTRACT_TEMPLATE", "CONSULTING_CONTRACT_TEMPLATE", "PARTNERSHIP_AGREEMENT_TEMPLATE", "NDA_TEMPLATE", "OFFICIAL_LETTER_TEMPLATE", "MANDATE_TEMPLATE", "MOU_TEMPLATE", "DATA_PROTECTION_CLAUSE", "IP_CLAUSE", "INTERNAL_CONFIDENTIALITY_CLAUSE", "TERMINATION_CLAUSE", "SUPPLIER_CONTRACT_TEMPLATE"]).default("SERVICE_CONTRACT_TEMPLATE"),
    description: optionalText(1200),
    content: optionalText(8000),
    version: optionalText(60),
    status: z.enum(["DRAFT", "REVISION", "VALIDATED", "ARCHIVED"]).default("DRAFT"),
    authorId: optionalText(120),
    comments: optionalText(1800),
  }),
  risks: z.object({
    title: z.string().min(2).max(180),
    source: optionalText(180),
    departmentId: optionalText(120),
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    description: optionalText(2400),
    potentialImpact: optionalText(1800),
    probability: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    correctiveMeasure: optionalText(1800),
    responsibleEmployeeId: optionalText(120),
    status: z.enum(["OPEN", "ANALYSIS", "PROCESSING", "ESCALATED", "RESOLVED", "ARCHIVED", "CANCELED"]).default("OPEN"),
    dueDate: optionalDate,
    ceoEscalation: z.coerce.boolean().default(false),
    comments: optionalText(1800),
  }),
  documents: z.object({
    title: z.string().min(2).max(180),
    documentType: z.enum(["STATUTES", "RCCM", "ADMINISTRATIVE_DOCUMENT", "SIGNED_CONTRACT", "AGREEMENT", "MANDATE", "OFFICIAL_LETTER", "MINUTES", "AUTHORIZATION", "TAX_SOCIAL_DOCUMENT", "COMPLIANCE_DOCUMENT", "INSTITUTIONAL_LETTER"]).default("ADMINISTRATIVE_DOCUMENT"),
    reference: optionalText(120),
    documentDate: optionalDate,
    expirationDate: optionalDate,
    requesterDepartmentId: optionalText(120),
    legalCaseId: optionalText(120),
    fileUrl: optionalText(600),
    status: z.enum(["ACTIVE", "EXPIRED", "ARCHIVED", "CANCELED"]).default("ACTIVE"),
    confidentialityLevel: z.enum(["INTERNAL_PUBLIC", "CONFIDENTIAL", "VERY_CONFIDENTIAL", "CEO_ONLY", "LA_CEO_ONLY"]).default("CONFIDENTIAL"),
    comments: optionalText(1800),
  }),
  disputes: z.object({
    title: z.string().min(2).max(180),
    counterparty: optionalText(180),
    disputeType: z.enum(["CLIENT", "SUPPLIER", "EMPLOYEE", "PARTNER", "ADMINISTRATION", "TECHNICAL", "FINANCIAL", "OTHER"]).default("OTHER"),
    departmentId: optionalText(120),
    description: optionalText(2400),
    potentialAmount: money.optional(),
    currency: z.string().min(3).max(8).default("USD"),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    followUpResponsibleId: optionalText(120),
    status: z.enum(["OPEN", "ANALYSIS", "DISCUSSION", "NEGOTIATION", "WAITING_DECISION", "RESOLVED", "CLOSED", "ARCHIVED"]).default("OPEN"),
    nextAction: optionalText(1600),
    dueDate: optionalDate,
    documentUrl: optionalText(600),
    comments: optionalText(1800),
  }),
  requests: z.object({
    subject: z.string().min(2).max(180),
    requesterDepartmentId: optionalText(120),
    requesterEmployeeId: optionalText(120),
    requestType: z.enum(["HR_CONTRACT", "FINANCIAL_COMMITMENT", "OPERATIONAL_RISK", "PROJECT_CONTRACT", "NDA", "IP_DATA", "TECH_LICENSE", "SUPPLIER_CONTRACT", "DISPUTE", "OFFICIAL_NOTE", "OTHER"]).default("OTHER"),
    description: optionalText(2400),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    desiredDueDate: optionalDate,
    documentUrl: optionalText(600),
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    status: z.enum(["SUBMITTED", "ANALYSIS", "MISSING_INFORMATION", "PROCESSING", "DONE", "REJECTED", "ARCHIVED"]).default("SUBMITTED"),
    legalResponse: optionalText(2400),
    comments: optionalText(1800),
  }),
  reports: z.object({
    title: z.string().min(2).max(180),
    reportType: z.enum(["WEEKLY_LA", "MONTHLY_LA", "CONTRACTS", "LEGAL_RISKS", "DISPUTES", "EXPIRING_DOCUMENTS", "REQUESTS_BY_DEPARTMENT"]).default("WEEKLY_LA"),
    periodStart: optionalDate,
    periodEnd: optionalDate,
    departmentId: optionalText(120),
    responsibleLegalId: optionalText(120),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    content: optionalText(5000),
    recommendations: optionalText(2400),
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
    meetingMode: z.enum(["COMMENTS_ONLY", "AUDIO", "VIDEO"]).default("COMMENTS_ONLY"),
    meetingDate: optionalDate,
    meetingTime: optionalText(20),
    departmentId: optionalText(120),
    participants: optionalText(1200),
    agenda: optionalText(1800),
    decisions: optionalText(1800),
    generatedTasks: optionalText(1200),
    reportOwnerEmployeeId: z.string().min(5),
    status: z.enum(["PLANNED", "HELD", "POSTPONED", "CANCELED", "MINUTES_PUBLISHED", "CLOSED"]).default("PLANNED"),
    minutes: optionalText(2400),
    attachmentUrl: optionalText(600),
    linkedEntityType: optionalText(120),
    linkedEntityId: optionalText(120),
    collaborationGroupId: optionalText(120),
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

export const newsletterSubscriberAdminSchema = z.object({
  id: z.string().min(5),
  status: z.enum(["new_ai_lead", "NEW", "TO_QUALIFY", "ACTIVE_PROSPECT", "CONTACTED", "INTERESTED", "CONVERTED", "UNSUBSCRIBED", "ARCHIVED"]),
  internalNotes: z.string().max(2000).optional().or(z.literal("")),
  convertedUserId: z.string().max(120).optional().or(z.literal("")),
  action: z.enum(["UPDATE", "CONVERT_EXISTING", "ARCHIVE", "UNSUBSCRIBE"]).default("UPDATE"),
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

const agentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1_500),
});

export const publicDtscAgentSchema = z.object({
  messages: z.array(agentMessageSchema).min(1).max(20),
  leadSubmitted: z.boolean().default(false),
  conversationId: z.string().max(120).optional().or(z.literal("")),
});

export const publicDtscLeadSchema = z.object({
  fullName: z.string().min(2).max(120),
  organization: z.string().max(160).optional().or(z.literal("")),
  email: z.string().email().max(180).transform((email) => email.toLowerCase()),
  phone: z.string().max(40).optional().or(z.literal("")),
  role: z.string().max(120).optional().or(z.literal("")),
  requestedService: z.string().min(2).max(180),
  needDescription: z.string().min(10).max(2_500),
  urgency: z.string().max(80).optional().or(z.literal("")),
  estimatedBudget: z.string().max(120).optional().or(z.literal("")),
  preferredContactChannel: z.string().max(120).optional().or(z.literal("")),
  summary: z.string().max(1_000).optional().or(z.literal("")),
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
