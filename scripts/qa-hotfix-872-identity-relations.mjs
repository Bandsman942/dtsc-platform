import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const contract = read("lib/enterprise/identity-links/contracts.ts");
const sql = read("prisma/migrations/20261017150000_identity_relation_types_check_alignment/migration.sql");
const http = read("lib/enterprise/identity-links/http.ts");
const panel = read("components/enterprise/identity-links/enterprise-identity-user-panel.tsx");
const benefit = read("lib/enterprise/relationship-benefits/contracts.ts");
const resolver = read("lib/enterprise/relationship-benefits/enforcement.ts");
const typesBlock = contract.match(/ENTERPRISE_IDENTITY_RELATION_TYPES = \[([\s\S]*?)\] as const/);
if (!typesBlock) throw new Error("Missing canonical relationship types");
const types = [...typesBlock[1].matchAll(/"([A-Z_]+)"/g)].map((entry) => entry[1]);
if (types.length !== 23 || new Set(types).size !== types.length) throw new Error("Unexpected canonical relationship type list");
for (const value of types) {
  const sqlMarker = "'" + value + "'";
  if (sql.split(sqlMarker).length !== 3) throw new Error("Missing relation SQL CHECK coverage for " + value);
}
for (const marker of ["EnterpriseIdentityLink_relationType_check", "EnterprisePersonBusinessReference_relationType_check", "VALIDATE CONSTRAINT", "NOT VALID"]) if (!sql.includes(marker)) throw new Error("Missing migration marker: " + marker);
for (const marker of ["notifyToast(message, \"error\")", "notifyToast(message, \"success\")", "IDENTITY_REQUEST_ALREADY_EXISTS", "IDENTITY_LINK_ORGANIZATION_NOT_FOUND", "aria-busy", "supportReference"]) if (!panel.includes(marker)) throw new Error("Missing frontend feedback: " + marker);
if (http.includes('console.error("Enterprise identity link operation failed", error)')) throw new Error("Raw Prisma exceptions can leak form values to logs");
for (const marker of ["supportReference", "IDENTITY_LINK_RELATION_CONFIGURATION_OUTDATED"]) if (!http.includes(marker)) throw new Error("Missing diagnostic mapping");
if (!benefit.includes("z.enum(ENTERPRISE_IDENTITY_RELATION_TYPES)") || !resolver.includes("audience.relationType === link.requestedRelationType")) throw new Error("Relationship benefits must use the same canonical audience contract");
console.log("Hotfix #872 identity relation DB checks, safe errors, toasts and benefits contract: PASS");
