import { z } from "zod";

export const retailOfflineSnapshotQuerySchema = z.object({
  siteId: z.string().trim().min(1).max(240),
  warehouseId: z.string().trim().min(1).max(240),
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  maxItems: z.coerce.number().int().min(1).max(500).optional().default(250),
});

export const retailOfflineSyncSchema = z.object({
  operationUuid: z.string().uuid(),
  snapshotVersion: z.string().trim().min(8).max(120),
  siteId: z.string().trim().min(1).max(240),
  warehouseId: z.string().trim().min(1).max(240),
  payload: z.unknown(),
});
