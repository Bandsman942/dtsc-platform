import { randomUUID } from "node:crypto";
import fs from "node:fs";

const fail = (message) => {
  console.error(`FAIL #693: ${message}`);
  process.exit(1);
};

const checkoutPath = "lib/enterprise/gaming/checkout-service.ts";
const checkoutSource = fs.readFileSync(checkoutPath, "utf8");
const invoiceStart = checkoutSource.indexOf("const invoice = await tx.enterpriseSalesInvoice.create");
const checkoutStart = checkoutSource.indexOf("const checkout = await tx.enterpriseGamingCheckout.create", invoiceStart);

if (invoiceStart < 0 || checkoutStart < 0) {
  fail("le bloc de création de facture Gaming est introuvable");
}

const invoiceBlock = checkoutSource.slice(invoiceStart, checkoutStart);
const itemsStart = invoiceBlock.indexOf("items:");
if (itemsStart < 0) fail("le nested create des lignes de facture Gaming est introuvable");

const nestedItemsBlock = invoiceBlock.slice(itemsStart);
if (/\borganizationId\s*,/.test(nestedItemsBlock)) {
  fail("les lignes imbriquées EnterpriseSalesInvoice.items.create ne doivent pas recevoir organizationId explicitement");
}
if (!nestedItemsBlock.includes("catalogItemId: service.id")) {
  fail("la ligne de service Gaming doit rester reliée au Catalogue canonique");
}
if (!nestedItemsBlock.includes("...extraLines.map")) {
  fail("les lignes physiques complémentaires doivent rester dans le même nested create Finance");
}

const receivablesSource = fs.readFileSync("lib/enterprise/accounting/receivables-service.ts", "utf8");
if (!receivablesSource.includes("enterpriseSalesInvoice.create")) {
  fail("le service Finance canonique de facturation est introuvable");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (process.env.CI && !databaseUrl) {
  fail("DATABASE_URL est requise en CI pour valider le nested create Prisma/PostgreSQL");
}

if (databaseUrl) {
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const prisma = new PrismaClient();
  class ExpectedRollback extends Error {}
  const organizationId = `qa-693-${randomUUID()}`;

  try {
    try {
      await prisma.$transaction(async (tx) => {
        const invoice = await tx.enterpriseSalesInvoice.create({
          data: {
            organizationId,
            number: `QA-693-${randomUUID()}`,
            businessPartyId: `qa-party-${randomUUID()}`,
            status: "DRAFT",
            invoiceDate: new Date(),
            currencyCode: "CDF",
            subtotal: new Prisma.Decimal("500"),
            discountTotal: new Prisma.Decimal("0"),
            taxTotal: new Prisma.Decimal("0"),
            grandTotal: new Prisma.Decimal("500"),
            outstandingAmount: new Prisma.Decimal("500"),
            createdByUserId: `qa-user-${randomUUID()}`,
            items: {
              create: [{
                description: "Gaming checkout QA #693",
                quantity: new Prisma.Decimal("1"),
                unitPrice: new Prisma.Decimal("500"),
                discountAmount: new Prisma.Decimal("0"),
                netAmount: new Prisma.Decimal("500"),
                taxAmount: new Prisma.Decimal("0"),
                totalAmount: new Prisma.Decimal("500"),
              }],
            },
          },
          include: { items: true },
        });

        if (invoice.items.length !== 1) {
          throw new Error("la facture QA ne contient pas exactement une ligne");
        }
        if (invoice.items[0]?.organizationId !== organizationId) {
          throw new Error("Prisma n’a pas propagé organizationId du parent vers la ligne imbriquée");
        }
        throw new ExpectedRollback();
      });
      fail("la transaction QA devait être rollbackée");
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error;
    }

    console.log("PASS #693 runtime: EnterpriseSalesInvoice.items.create propage organizationId via la relation composite.");
  } finally {
    await prisma.$disconnect();
  }
} else {
  console.log("PASS #693 static: DATABASE_URL absente hors CI, test PostgreSQL différé à la Quality Gate.");
}

console.log("PASS #693 Gaming checkout nested invoice contract.");
