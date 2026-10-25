import { z } from "zod";
import { retailReturnProductConditions, retailReturnStockDispositions } from "@/lib/enterprise/retail/commercial-schemas";

const id = z.string().trim().min(1).max(240);

export const omnichannelReturnRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(180),
  reason: z.string().trim().min(5).max(1200),
  validatorUserId: id,
  lines: z.array(z.object({
    salesOrderItemId: id,
    quantity: z.coerce.number().finite().positive().max(1_000_000).refine(
      (value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001,
    ),
    productCondition: z.enum(retailReturnProductConditions),
    stockDisposition: z.enum(retailReturnStockDispositions),
  })).min(1).max(200),
}).superRefine((input, context) => {
  const seen = new Set<string>();
  for (const [index, item] of input.lines.entries()) {
    if (seen.has(item.salesOrderItemId)) {
      context.addIssue({ code: "custom", path: ["lines", index], message: "L'article ne peut apparaître qu'une fois." });
    }
    seen.add(item.salesOrderItemId);
    if (item.stockDisposition === "RESTOCK" && item.productCondition !== "SELLABLE") {
      context.addIssue({ code: "custom", path: ["lines", index, "stockDisposition"], message: "Un produit non revendable ne peut pas retourner dans le stock disponible." });
    }
  }
});

export const omnichannelReturnDecisionSchema = z.object({
  revision: z.number().int().positive(),
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(5).max(1200),
});

export const omnichannelReturnRevisionSchema = z.object({ revision: z.number().int().positive() });

export const omnichannelReturnSettlementSchema = z.object({
  revision: z.number().int().positive(),
  receivedAndInspected: z.literal(true),
  inspectionNotes: z.string().trim().min(5).max(1200),
});
