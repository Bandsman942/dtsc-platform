import { z } from "zod";
const optionalText = z.string().trim().max(1200).optional().or(z.literal(""));
const optionalId = z.string().max(160).optional().or(z.literal(""));
const hasTwoDecimals = (value: number) => Math.round(value * 100) === value * 100;
const money = z.coerce.number().min(0).refine(hasTwoDecimals, "Le montant doit avoir au maximum deux décimales.");
export const pharmacySaleSchema = z.object({
  saleNumber: z.string().trim().max(120).optional().or(z.literal("")),
  saleType: z.enum(["COUNTER", "PRESCRIPTION", "INSURANCE", "CREDIT", "INTERNAL_EXIT", "EXCEPTIONAL_EXIT", "RETURN_CORRECTION", "OTHER"]),
  customerName: z.string().trim().max(180).optional().or(z.literal("")), customerPhone: z.string().trim().max(80).optional().or(z.literal("")), customerType: z.string().trim().max(80).optional().or(z.literal("")),
  prescriptionId: optionalId, prescriberName: z.string().trim().max(180).optional().or(z.literal("")), cashierId: z.string().min(1), departmentId: optionalId, saleDate: z.coerce.date(),
  currency: z.enum(["USD", "CDF", "EUR"]).default("USD"), globalDiscount: z.coerce.number().min(0).max(100).default(0), taxAmount: money.default(0), paidAmount: z.coerce.number().min(0).max(0).refine(hasTwoDecimals, "Le montant doit avoir au maximum deux décimales.").default(0),
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "CARD", "CREDIT", "INSURANCE", "TRANSFER", "OTHER"]).optional().or(z.literal("")),
  paymentReference: z.string().trim().max(180).optional().or(z.literal("")), notes: optionalText,
  lines: z.array(z.object({ productId: z.string().min(1), batchId: z.string().min(1), quantity: z.coerce.number().gt(0), unit: z.string().min(1).max(80), unitPrice: money, lineDiscount: z.coerce.number().min(0).max(100).default(0), notes: optionalText })).min(1).max(100),
});
export const saleActionSchema = z.object({ action: z.enum(["confirm", "pay", "request-validation", "pharmacist-validate", "pharmacist-reject", "cancel", "refund", "resolve-anomaly"]), reason: optionalText, paidAmount: z.coerce.number().min(0).optional(), paymentMethod: z.string().max(80).optional(), refundAmount: z.coerce.number().gt(0).optional(), restockItems: z.coerce.boolean().optional(), anomalyId: optionalId });
