import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillPharmacyFinancialLinks, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillPharmacyFinancialLinks(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
