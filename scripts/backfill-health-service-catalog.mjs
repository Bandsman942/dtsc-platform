import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillHealthServiceCatalog, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillHealthServiceCatalog(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
