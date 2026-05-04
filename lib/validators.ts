import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
  companyName: z.string().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
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
