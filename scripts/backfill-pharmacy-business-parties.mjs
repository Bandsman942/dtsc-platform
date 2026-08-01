import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillPharmacyBusinessParties, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillPharmacyBusinessParties(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
