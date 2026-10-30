import { z } from "zod";
import { publicPublicationSchema } from "@/lib/validators";

/** Extend the canonical publication validator with optional SEO fields. */
export const publicPublicationEditorSchema = publicPublicationSchema.extend({
  seoTitle: z.string().trim().max(180).optional(),
  seoDescription: z.string().trim().max(500).optional(),
});
