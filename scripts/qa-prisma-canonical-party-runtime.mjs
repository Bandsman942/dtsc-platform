import { Prisma } from "@prisma/client";

const failures = [];
const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));

function requireFields(modelName, fields) {
  const model = models.get(modelName);
  if (!model) {
    failures.push(`Prisma Client ne contient pas le modèle ${modelName}.`);
    return;
  }
  const available = new Set(model.fields.map((field) => field.name));
  for (const field of fields) if (!available.has(field)) failures.push(`Prisma Client ${modelName}: champ ${field} absent.`);
}

requireFields("EnterpriseBusinessParty", ["organizationId", "partyType", "legalName", "normalizedName", "code", "roles", "contacts", "addresses"]);
requireFields("EnterpriseBusinessPartyRole", ["organizationId", "businessPartyId", "roleCode", "status"]);
requireFields("EnterpriseBusinessPartyContact", ["organizationId", "businessPartyId", "contactType", "normalizedValue"]);
requireFields("EnterpriseBusinessPartyAddress", ["organizationId", "businessPartyId", "line1", "countryCode"]);
requireFields("EnterpriseSupplier", ["organizationId", "legalName", "status"]);
requireFields("EnterpriseSupplierPartyLink", ["organizationId", "supplierId", "businessPartyId", "complianceStatus"]);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL PRISMA PARTY RUNTIME: ${failure}`);
  process.exit(1);
}
console.log("PASS PRISMA PARTY RUNTIME: le client généré expose le contrat Tiers/Procurement attendu.");
