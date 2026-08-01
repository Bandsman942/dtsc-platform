import { parseSectorBackfillArgs } from "./lib/sector-backfill.mjs";
import { backfillHealthInvoices, disconnectSectorBackfillPrisma } from "./lib/sector-backfill-handlers.mjs";

backfillHealthInvoices(parseSectorBackfillArgs())
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(disconnectSectorBackfillPrisma);
