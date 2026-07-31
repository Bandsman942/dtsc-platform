import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillPharmacyPurchases, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillPharmacyPurchases(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
