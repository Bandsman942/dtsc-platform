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
  title: z.string().min(2).max(120),
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
  content: z.string().min(3).max(5_000),
});

export const announcementUpdateSchema = announcementSchema;

export const announcementCommentSchema = z.object({
  content: z.string().min(1).max(1_000),
});

export const announcementCommentUpdateSchema = announcementCommentSchema;

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
  type: z.string().min(2).max(40).default("BROADCAST"),
});

export const massMailSchema = z.object({
  subject: z.string().min(3).max(160),
  content: z.string().min(10).max(6_000),
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
  coverLabel: z.string().max(80).optional().or(z.literal("")),
  published: z.coerce.boolean().default(false),
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
