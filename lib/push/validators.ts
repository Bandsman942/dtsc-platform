import { z } from "zod";

export const pushSubscriptionCreateSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(10).max(500),
  }),
  deviceLabel: z.string().trim().max(120).optional().or(z.literal("")),
}).strict();

export const pushSubscriptionDeleteSchema = z.object({
  endpoint: z.string().url().max(2000),
}).strict();
