import fs from "node:fs";

const file = "scripts/qa-regression-checks.mjs";
let source = fs.readFileSync(file, "utf8");

function replace(from, to, label) {
  if (source.includes(to)) {
    console.log(`already fixed: ${label}`);
    return;
  }
  if (!source.includes(from)) throw new Error(`Missing QA target: ${label}`);
  source = source.replace(from, to);
  console.log(`updated: ${label}`);
}

replace(
  `  packageJson.scripts?.["qa:regression"] === "node scripts/qa-regression-checks.mjs",`,
  `  String(packageJson.scripts?.["qa:regression"] || "").includes("node scripts/qa-regression-checks.mjs"),`,
  "accept the existing composite qa:regression command while requiring the base suite",
);

replace(
  `  containsAll(pharmacyPurchasesWorkspace, ["Tableau de bord achats pharmacie", "Fournisseurs", "Produits par fournisseur", "Demandes de réapprovisionnement", "Commandes fournisseurs", "Lignes de commande", "Suivi de livraison", "Commandes partiellement reçues", "Documents fournisseurs", "Historique fournisseurs & achats", "Alertes achats", "h-[96dvh]", "CircleHelp", "Créer une réception", "min-w-0", "overflow-x-hidden"])`,
  `  containsAll(pharmacyPurchasesWorkspace, ["Tableau de bord achats pharmacie", "Fournisseurs", "Produits par fournisseur", "Demandes de réapprovisionnement", "Commandes fournisseurs", "Lignes de commande", "Suivi de livraison", "Commandes partiellement reçues", "Documents fournisseurs", "Historique fournisseurs & achats", "Alertes achats", "h-[96dvh]", "CircleHelp", "Créer / ouvrir le brouillon de réception", "min-w-0", "overflow-x-hidden"])`,
  "match the current real pharmacy receipt action label",
);

replace(
  `  containsAll(enterpriseCoreWorkspace, ["Créer un élément", "ListControls", "ActionMenu", "CircleHelp", "Demander une validation", "min-w-0", "overflow-x-hidden"])`,
  `  containsAll(enterpriseCoreWorkspace, ["Créer un élément", "ListControls", "ContextActions", "CircleHelp", "Demander une validation", "min-w-0", "overflow-x-hidden"])`,
  "match the generalized reusable ContextActions contract",
);

fs.writeFileSync(file, source, "utf8");
console.log("Baseline QA assertions synchronized with current main contracts.");
