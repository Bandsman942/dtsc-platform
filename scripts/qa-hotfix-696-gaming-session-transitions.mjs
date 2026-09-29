import fs from "node:fs";

const fail = (message) => {
  console.error(`FAIL #696: ${message}`);
  process.exit(1);
};

const expectedActions = [
  "START",
  "PAUSE",
  "RESUME",
  "EXTEND",
  "TRANSFER",
  "END",
  "READY_TO_CHECKOUT",
  "CHECKOUT_OPEN",
  "CHECKOUT_PAID",
  "CHECKOUT_CANCELLED",
  "CHECKOUT_REFUNDED",
];

const read = (path) => fs.readFileSync(path, "utf8");
const domain = read("lib/enterprise/gaming/domain.ts");
const migration = read("prisma/migrations/20260928231500_gaming_session_transition_checkout_actions/migration.sql");
const onboarding = read("lib/enterprise/gaming/onboarding.ts");
const checkoutService = read("lib/enterprise/gaming/checkout-service.ts");
const checkoutCommon = read("lib/enterprise/gaming/checkout-common.ts");
const checkoutCommands = read("lib/enterprise/gaming/checkout-commands.ts");
const sessionCheckout = read("lib/enterprise/gaming/session-checkout-state.ts");
const professionalUi = read("components/enterprise/professional/professional-erp-ui.tsx");
const checkoutHttp = read("lib/enterprise/gaming/checkout-http.ts");
const checkoutCollectionRoute = read("app/api/enterprise/[organizationId]/gaming/checkouts/route.ts");
const checkoutDetailRoute = read("app/api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/route.ts");

for (const action of expectedActions) {
  if (!domain.includes(`"${action}"`)) fail(`GAMING_SESSION_ACTIONS ne contient pas ${action}`);
  if (!migration.includes(`'${action}'`)) fail(`la migration de contrainte n’autorise pas ${action}`);
}

if (!migration.includes('DROP CONSTRAINT IF EXISTS "EnterpriseGamingSessionTransition_action_check"')) {
  fail("la migration doit remplacer explicitement la contrainte historique");
}
if (!migration.includes('ADD CONSTRAINT "EnterpriseGamingSessionTransition_action_check"')) {
  fail("la migration doit recréer la contrainte de transitions");
}
if (/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration)) {
  fail("la migration #696 ne doit supprimer aucune table, colonne, type ou index");
}

for (const [sourcePath, source, required] of [
  ["session-checkout-state.ts", sessionCheckout, ["READY_TO_CHECKOUT"]],
  ["checkout-service.ts", checkoutService, ["CHECKOUT_OPEN"]],
  ["checkout-common.ts", checkoutCommon, ["CHECKOUT_PAID"]],
  ["checkout-commands.ts", checkoutCommands, ["CHECKOUT_CANCELLED", "CHECKOUT_REFUNDED"]],
]) {
  for (const action of required) {
    if (!source.includes(`action: "${action}"`)) fail(`${sourcePath} ne contient plus la transition ${action}`);
  }
}

if (!onboarding.includes("launchBaseline: 5") || !onboarding.includes("stationProfiles.length >= 5")) {
  fail("la baseline commerciale de cinq postes doit rester confinée à l’onboarding");
}
for (const source of [checkoutService, checkoutCommon, checkoutCommands]) {
  if (source.includes("launchBaseline") || source.includes("stationProfiles.length >= 5")) {
    fail("le checkout ne doit pas dépendre de la baseline onboarding de cinq postes");
  }
}

if (!professionalUi.includes("supportReference: string | null")
  || !professionalUi.includes("body?.supportReference")
  || !professionalUi.includes("Support:")) {
  fail("ProfessionalApiError doit préserver et rendre visible la référence support");
}
for (const code of [
  "GAMING_CHECKOUT_PREPARE_FAILED",
  "GAMING_CHECKOUT_COMMAND_FAILED",
  "GAMING_CHECKOUT_READ_FAILED",
  "GAMING_CHECKOUT_RECEIPT_FAILED",
]) {
  if (!checkoutHttp.includes(code)) fail(`checkout-http doit fournir un message inattendu spécifique pour ${code}`);
}
if (!checkoutCollectionRoute.includes('"GAMING_CHECKOUT_PREPARE_FAILED"')) {
  fail("le POST checkout doit classifier explicitement l’échec de préparation");
}
if (!checkoutDetailRoute.includes('"GAMING_CHECKOUT_COMMAND_FAILED"')) {
  fail("les commandes checkout doivent classifier explicitement les incidents inattendus");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (process.env.CI && !databaseUrl) fail("DATABASE_URL est requise en CI pour vérifier la contrainte PostgreSQL réelle");

if (databaseUrl) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.conname = 'EnterpriseGamingSessionTransition_action_check'
        AND t.relname = 'EnterpriseGamingSessionTransition'
      LIMIT 1
    `);
    const definition = Array.isArray(rows) ? String(rows[0]?.definition || "") : "";
    if (!definition) fail("la contrainte PostgreSQL EnterpriseGamingSessionTransition_action_check est introuvable");
    for (const action of expectedActions) {
      if (!definition.includes(`'${action}'`)) fail(`la contrainte PostgreSQL active refuse encore ${action}`);
    }
    console.log("PASS #696 runtime: contrainte PostgreSQL alignée sur toutes les transitions Gaming supportées.");
  } finally {
    await prisma.$disconnect();
  }
} else {
  console.log("PASS #696 static: DATABASE_URL absente hors CI, vérification PostgreSQL différée à la Quality Gate.");
}

console.log("PASS #696 Gaming session transition, five-station boundary and support-reference contracts.");
