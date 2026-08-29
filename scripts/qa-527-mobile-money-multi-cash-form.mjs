import fs from "node:fs";

const files = {
  dashboard: "app/api/enterprise/[organizationId]/retail/dashboard/route.ts",
  manager: "components/enterprise/professional/mobile-money-cash-session-manager.tsx",
  workspace: "components/enterprise/professional/mobile-money-agency-workspace.tsx",
  service: "lib/enterprise/retail/service.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => {
    if (!fs.existsSync(path)) {
      console.error(`Fichier introuvable: ${path}`);
      process.exit(1);
    }
    return [key, fs.readFileSync(path, "utf8")];
  }),
);

const failures = [];

function requireSource(name, condition, message) {
  if (!condition) failures.push(`${name}: ${message}`);
}

requireSource(
  "dashboard",
  source.dashboard.includes("cashSessions: dashboard.cashSessions"),
  "le dashboard Retail n'expose pas toutes les sessions de caisse autorisées",
);

requireSource(
  "manager",
  source.manager.includes("overflow-x-auto") && source.manager.includes("snap-x") && source.manager.includes("snap-start") && source.manager.includes("shrink-0"),
  "les cartes de caisses ouvertes ne sont pas rendues en rail horizontal scrollable avec snap",
);
requireSource(
  "manager",
  source.manager.includes("useTill") && source.manager.includes("value={selectedSessionId}") && source.manager.includes("onSelectSession(event.target.value)"),
  "la combobox de sélection de caisse ouverte n'est pas synchronisée avec la session active",
);
requireSource(
  "manager",
  source.manager.includes("openSessions.map((session)") && source.manager.includes("session.financialAccount.currencyCode"),
  "les sessions ouvertes ne sont pas toutes projetées avec leur devise",
);

requireSource(
  "workspace",
  source.workspace.includes("eligibleProviders = providers.filter((provider) => provider.accounts.some((mapping) => mapping.currencyCode === currency))"),
  "les opérateurs ne sont pas filtrés par la devise de la caisse sélectionnée",
);
requireSource(
  "workspace",
  source.workspace.includes("formWallet = formProvider?.accounts.find((mapping) => mapping.currencyCode === currency)")
    && source.workspace.includes("value={formWallet?.financialAccountId || \"\"}")
    && source.workspace.includes("walletAutomatic"),
  "le wallet opérateur de même devise n'est pas sélectionné et affiché automatiquement dans le formulaire",
);
requireSource(
  "workspace",
  source.workspace.includes("pendingWallet = pending ? pendingProvider?.accounts.find((mapping) => mapping.currencyCode === pending.currencyCode)"),
  "le wallet opérateur de même devise n'est pas conservé dans la prévisualisation de confirmation",
);
requireSource(
  "workspace",
  source.workspace.includes("noValidate") && source.workspace.includes("phone.length < 5") && source.workspace.includes("customerFeeAmount < 0") && source.workspace.includes("providerCommissionAmount < 0"),
  "le formulaire d'opération dépend encore d'une validation navigateur silencieuse au lieu de sa validation métier explicite",
);
requireSource(
  "workspace",
  source.workspace.includes("setOperationError(copy.tillRequired)") && source.workspace.includes("formError(copy.tillRequired)"),
  "l'absence de caisse ne produit pas à la fois une erreur locale et un toast global",
);
requireSource(
  "workspace",
  source.workspace.includes("setOperationError(copy.missingWallet)") && source.workspace.includes("formError(copy.missingWallet)"),
  "l'absence de wallet dans la devise de la caisse ne produit pas de feedback métier explicite",
);
requireSource(
  "workspace",
  source.workspace.includes("setOperationError(copy.selectProvider)") && source.workspace.includes("formError(copy.selectProvider)"),
  "l'absence d'opérateur compatible ne produit pas de feedback métier explicite",
);
requireSource(
  "workspace",
  source.workspace.includes("setOperationError(copy.invalidOperation)") && source.workspace.includes("formError(copy.invalidOperation)"),
  "les données d'opération invalides ne produisent pas de feedback métier explicite",
);
requireSource(
  "workspace",
  source.workspace.includes('disabled={Boolean(busyAction) || configurationBusy}')
    && !source.workspace.includes('disabled={Boolean(busyAction) || !activeCash || !eligibleProviders.length}'),
  "le CTA Vérifier l'opération peut encore rester muet derrière des préconditions désactivantes",
);
requireSource(
  "workspace",
  source.workspace.includes("notifyToast(message, \"error\")"),
  "les erreurs de mutation/configuration ne remontent pas dans le toast global",
);

requireSource(
  "service",
  source.service.includes("resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, input.currencyCode)"),
  "le serveur ne re-résout pas canoniquement le wallet opérateur par tenant + provider + devise",
);
requireSource(
  "service",
  source.service.includes("assertOpenCashSession(tx, organizationId, cashAccount.id, actorUserId)"),
  "le serveur ne revalide pas que la caisse choisie appartient à une session ouverte de l'utilisateur",
);

if (failures.length) {
  console.error("FAIL qa-527-mobile-money-multi-cash-form");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-527-mobile-money-multi-cash-form");
console.log("- toutes les caisses ouvertes sont exposées et sélectionnables");
console.log("- les cartes de caisses utilisent un rail horizontal scrollable et synchronisé avec la combobox");
console.log("- provider/devise/wallet restent cohérents, visibles et re-résolus côté serveur");
console.log("- Vérifier l'opération utilise une validation métier explicite avec erreur inline + toast global");
