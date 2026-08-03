import { runAudit } from "./lib/erp-final-consolidation-audit.mjs";
const mode = process.argv[2] || "all";
const allowed = new Set(["all", "cross-module-consolidation", "canonical-entity-ownership", "workflows", "deep-links", "documents", "comments", "notifications", "permissions", "idempotence", "financial-integrity", "sector-integrity", "plan-module-alignment", "navigation", "user-guides", "french-language", "mobile", "commercial-readiness"]);
if (!allowed.has(mode)) throw new Error(`Mode QA ERP final inconnu: ${mode}`);
await runAudit(mode);
