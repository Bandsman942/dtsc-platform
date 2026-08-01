import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillHealthPayments, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillHealthPayments(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
