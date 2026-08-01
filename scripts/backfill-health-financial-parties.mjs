import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillHealthFinancialParties, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillHealthFinancialParties(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
