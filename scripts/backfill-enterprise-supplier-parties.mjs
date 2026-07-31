import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const organizationArg = process.argv.find((argument) => argument.startsWith("--organization="));
const organizationId = organizationArg?.split("=")[1] || null;

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function reference(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function main() {
  const suppliers = await prisma.enterpriseSupplier.findMany({
    where: {
      archivedAt: null,
      ...(organizationId ? { organizationId } : {}),
      NOT: { id: { in: (await prisma.enterpriseSupplierPartyLink.findMany({ select: { supplierId: true } })).map((item) => item.supplierId) } },
    },
    orderBy: [{ organizationId: "asc" }, { legalName: "asc" }],
  });

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", organizationId, candidates: suppliers.length }, null, 2));
  if (!apply) {
    for (const supplier of suppliers.slice(0, 100)) {
      console.log(`[dry-run] ${supplier.organizationId} ${supplier.id} ${supplier.legalName}`);
    }
    if (suppliers.length > 100) console.log(`[dry-run] ${suppliers.length - 100} additional candidate(s) omitted.`);
    return;
  }

  let linked = 0;
  for (const supplier of suppliers) {
    await prisma.$transaction(async (tx) => {
      const migrationKey = `supplier:${supplier.id}`;
      let party = await tx.enterpriseBusinessParty.findFirst({
        where: { organizationId: supplier.organizationId, migrationKey, archivedAt: null },
      });
      if (!party) {
        party = await tx.enterpriseBusinessParty.create({
          data: {
            organizationId: supplier.organizationId,
            partyType: "ORGANIZATION",
            legalName: supplier.legalName,
            displayName: supplier.displayName,
            normalizedName: normalizeName(supplier.legalName),
            code: reference("SUP"),
            migrationKey,
            taxIdentifier: supplier.taxIdentifier,
            registrationId: supplier.registrationId,
            primaryEmail: supplier.email,
            primaryPhone: supplier.phone,
            status: supplier.status === "SUSPENDED" ? "INACTIVE" : "ACTIVE",
            notes: supplier.notes,
            createdByUserId: supplier.createdByUserId,
          },
        });
      }
      await tx.enterpriseBusinessPartyRole.upsert({
        where: {
          organizationId_businessPartyId_roleCode: {
            organizationId: supplier.organizationId,
            businessPartyId: party.id,
            roleCode: "SUPPLIER",
          },
        },
        update: { status: "ACTIVE", archivedAt: null },
        create: {
          organizationId: supplier.organizationId,
          businessPartyId: party.id,
          roleCode: "SUPPLIER",
          createdByUserId: supplier.createdByUserId,
        },
      });
      await tx.enterpriseSupplierPartyLink.upsert({
        where: { organizationId_supplierId: { organizationId: supplier.organizationId, supplierId: supplier.id } },
        update: { businessPartyId: party.id, archivedAt: null, revision: { increment: 1 } },
        create: {
          organizationId: supplier.organizationId,
          supplierId: supplier.id,
          businessPartyId: party.id,
          migrationKey,
          createdByUserId: supplier.createdByUserId,
        },
      });
    });
    linked += 1;
  }
  console.log(JSON.stringify({ linked }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
