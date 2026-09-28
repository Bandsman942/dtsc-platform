import fs from "node:fs";

const fail = (message) => {
  console.error(`FAIL #690: ${message}`);
  process.exit(1);
};

const gamingDir = "lib/enterprise/gaming";
const gamingFiles = fs.readdirSync(gamingDir)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `${gamingDir}/${name}`);

for (const sourcePath of gamingFiles) {
  const source = fs.readFileSync(sourcePath, "utf8");
  if (/\$queryRaw(?:Unsafe)?[\s\S]{0,220}pg_advisory_xact_lock/.test(source)) {
    fail(`${sourcePath} utilise encore $queryRaw pour pg_advisory_xact_lock`);
  }
}

for (const sourcePath of [
  "lib/enterprise/gaming/bookings.ts",
  "lib/enterprise/gaming/checkout-service.ts",
  "lib/enterprise/gaming/daily-close.ts",
]) {
  const source = fs.readFileSync(sourcePath, "utf8");
  if (!source.includes("$executeRaw") || !source.includes("pg_advisory_xact_lock")) {
    fail(`${sourcePath} doit conserver le verrou Gaming via $executeRaw`);
  }
}

const professionalUi = fs.readFileSync("components/enterprise/professional/professional-erp-ui.tsx", "utf8");
if (!professionalUi.includes("notify = true") || !professionalUi.includes("useToastMessage(notify ? message : null")) {
  fail("ProfessionalError doit pouvoir afficher une erreur inline sans dupliquer le toast global");
}

const bookingsUi = fs.readFileSync("components/enterprise/gaming/enterprise-gaming-bookings-workspace.tsx", "utf8");
if (!bookingsUi.includes('<ProfessionalError message={message} notify={false} />')) {
  fail("le formulaire Réservations Gaming doit conserver l’erreur inline sans deuxième toast");
}
if (!bookingsUi.includes("notifyError={Boolean(conversionError)}")) {
  fail("la conversion Booking doit distinguer erreur de lookup et erreur déjà notifiée");
}

const commonHttp = fs.readFileSync("lib/enterprise/common/http.ts", "utf8");
const checkoutHttp = fs.readFileSync("lib/enterprise/gaming/checkout-http.ts", "utf8");
if (!commonHttp.includes("enterpriseSupportReference") || !commonHttp.includes("supportReference")) {
  fail("le fallback ERP doit exposer une référence support sûre lorsqu’elle existe");
}
if (!checkoutHttp.includes("enterpriseSupportReference") || !checkoutHttp.includes("[gaming] unexpected operation failure")) {
  fail("le fallback Gaming doit journaliser une référence support sans erreur Prisma brute");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (process.env.CI && !databaseUrl) {
  fail("DATABASE_URL est requise en CI pour exercer réellement le verrou PostgreSQL");
}

if (databaseUrl) {
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const lockKey = `qa-690-gaming-advisory-lock:${process.env.GITHUB_RUN_ID || process.pid}`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);
      const rows = await tx.$queryRaw(Prisma.sql`SELECT 1::int AS "ok"`);
      if (!Array.isArray(rows) || Number(rows[0]?.ok) !== 1) {
        throw new Error("la transaction n’est plus exploitable après acquisition du verrou");
      }
    });
    console.log("PASS #690 runtime: pg_advisory_xact_lock exécuté via $executeRaw sur PostgreSQL.");
  } finally {
    await prisma.$disconnect();
  }
} else {
  console.log("PASS #690 static: DATABASE_URL absente hors CI, exercice PostgreSQL différé à la Quality Gate.");
}

console.log("PASS #690 Gaming advisory lock, toast et support-reference contracts.");
