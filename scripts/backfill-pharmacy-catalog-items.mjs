import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillPharmacyCatalogItems, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillPharmacyCatalogItems(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
