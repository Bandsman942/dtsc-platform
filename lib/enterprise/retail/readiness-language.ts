export type RetailReadinessLocale = "fr" | "en";

type Detail = Record<string, unknown>;

function asDetail(value: unknown): Detail {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Detail : {};
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function retailReadinessDetail(code: string, detail: unknown, complete: boolean, locale: RetailReadinessLocale) {
  const value = asDetail(detail);
  const en = locale === "en";

  switch (code) {
    case "COUNTRY_PACK": {
      const countryCode = asText(value.countryCode);
      const candidateCount = asCount(value.candidateCount);
      if (complete) return en ? `Country configuration active${countryCode ? ` for ${countryCode}` : ""}.` : `Configuration pays active${countryCode ? ` pour ${countryCode}` : ""}.`;
      if (candidateCount > 1) return en
        ? "Several country configurations are active. Select the country used by this Shop, then save and check the setup."
        : "Plusieurs configurations pays sont actives. Sélectionnez le pays utilisé par ce Shop, puis enregistrez et vérifiez la mise en service.";
      return en
        ? "Activate the country configuration that applies to this company. The step will be checked automatically after activation."
        : "Activez la configuration pays applicable à cette entreprise. L’étape sera cochée automatiquement après l’activation.";
    }
    case "FUNCTIONAL_CURRENCY": {
      const functional = asText(value.functionalCurrencyCode);
      const selected = asText(value.selectedCurrencyCode);
      if (complete) return en ? `Functional currency configured: ${functional || selected}.` : `Devise fonctionnelle configurée : ${functional || selected}.`;
      if (functional && selected && functional !== selected) return en
        ? `Finance uses ${functional}, while this Shop currently selects ${selected}. Select ${functional} here or change the functional currency in Finance configuration.`
        : `Finance utilise ${functional}, alors que ce Shop sélectionne ${selected}. Sélectionnez ${functional} ici ou modifiez la devise fonctionnelle dans la configuration Finance.`;
      return en
        ? "Set the functional currency in Finance overview → Configure Finance. Return here afterwards; the Shop will detect it automatically."
        : "Définissez la devise fonctionnelle dans Vue d’ensemble financière → Configurer Finance. Revenez ensuite ici : le Shop la détectera automatiquement.";
    }
    case "SITE": {
      const name = asText(value.name);
      const candidateCount = asCount(value.candidateCount);
      if (complete) return en ? `Store location selected: ${name}.` : `Point de vente sélectionné : ${name}.`;
      if (candidateCount > 1) return en
        ? `${candidateCount} active locations are available. Select the one used by this Shop in “Point-of-sale setup”, then save.`
        : `${candidateCount} points de vente actifs sont disponibles. Sélectionnez celui utilisé par ce Shop dans « Configuration du point de vente », puis enregistrez.`;
      return en
        ? "Create or reactivate an active site in Sites, warehouses & locations. If exactly one site is active, the Shop will select it automatically."
        : "Créez ou réactivez un site dans Sites, entrepôts et emplacements. S’il n’existe qu’un seul site actif, le Shop le sélectionnera automatiquement.";
    }
    case "WAREHOUSE": {
      const name = asText(value.name);
      const siteName = asText(value.siteName);
      const candidateCount = asCount(value.candidateCount);
      if (complete) return en ? `Stock warehouse selected: ${name}${siteName ? ` · ${siteName}` : ""}.` : `Dépôt de stock sélectionné : ${name}${siteName ? ` · ${siteName}` : ""}.`;
      if (!siteName) return en
        ? "Select the store location first. The Shop can then identify warehouses attached to that site."
        : "Sélectionnez d’abord le point de vente. Le Shop pourra ensuite identifier les dépôts rattachés à ce site.";
      if (candidateCount > 1) return en
        ? `${candidateCount} active warehouses are attached to ${siteName}. Select the warehouse used for Shop stock, then save.`
        : `${candidateCount} dépôts actifs sont rattachés à ${siteName}. Sélectionnez le dépôt utilisé pour le stock du Shop, puis enregistrez.`;
      return en
        ? `Create or reactivate an active warehouse attached to ${siteName}. A location inside the warehouse alone is not sufficient: the Shop needs the warehouse itself.`
        : `Créez ou réactivez un dépôt actif rattaché à ${siteName}. Un emplacement à l’intérieur du dépôt ne suffit pas : le Shop a besoin du dépôt lui-même.`;
    }
    case "CASH_ACCOUNT": {
      const name = asText(value.name);
      const currency = asText(value.currencyCode);
      const siteName = asText(value.siteName);
      const candidateCount = asCount(value.candidateCount);
      if (complete) return en
        ? `Collection account configured: ${name}${currency ? ` (${currency})` : ""}. Closing a till session does not remove this configuration.`
        : `Compte d’encaissement configuré : ${name}${currency ? ` (${currency})` : ""}. Clôturer une session de caisse ne supprime pas cette configuration.`;
      if (candidateCount > 1) return en
        ? `${candidateCount} compatible collection accounts are available. Select the account used by this Shop; you do not need to open a till session to complete this step.`
        : `${candidateCount} comptes d’encaissement compatibles sont disponibles. Sélectionnez celui utilisé par ce Shop ; il n’est pas nécessaire d’ouvrir une session de caisse pour terminer cette étape.`;
      return en
        ? `Create or reactivate a cash collection financial account${currency ? ` in ${currency}` : ""}${siteName ? ` for ${siteName}` : ""}. This step checks the account configuration, not whether a till session is currently open.`
        : `Créez ou réactivez un compte financier d’encaissement de type caisse${currency ? ` en ${currency}` : ""}${siteName ? ` pour ${siteName}` : ""}. Cette étape vérifie le compte configuré, pas l’ouverture actuelle d’une session de caisse.`;
    }
    case "CATALOG": {
      const count = asCount(value.count);
      return complete
        ? (en ? `${count} active sales item${count === 1 ? "" : "s"} available.` : `${count} article${count === 1 ? "" : "s"} actif${count === 1 ? "" : "s"} dans le catalogue de vente.`)
        : (en ? "Add at least one active item to the sales catalog." : "Ajoutez au moins un article actif au catalogue de vente.");
    }
    case "INVENTORY_LINKS": {
      const tracked = asCount(value.trackedCatalogItems);
      const missing = asCount(value.missingInventoryLinks);
      if (complete) return en ? "Every stock-tracked sales item is linked to inventory." : "Tous les articles suivis en stock sont reliés à l’inventaire.";
      return en
        ? `${missing} of ${tracked} stock-tracked item${tracked === 1 ? "" : "s"} still need an inventory record in the selected warehouse.`
        : `${missing} article${missing === 1 ? "" : "s"} sur ${tracked} suivi${tracked === 1 ? "" : "s"} en stock doivent encore être reliés à l’inventaire du dépôt sélectionné.`;
    }
    case "TEAM": {
      const activeMembers = asCount(value.activeMembers);
      return complete
        ? (en ? `${activeMembers} active company member${activeMembers === 1 ? "" : "s"} available.` : `${activeMembers} membre${activeMembers === 1 ? "" : "s"} actif${activeMembers === 1 ? "" : "s"} dans l’entreprise.`)
        : (en ? "Add or activate at least one company member who can use the Shop." : "Ajoutez ou activez au moins un membre de l’entreprise pouvant utiliser le Shop.");
    }
    case "ACCOUNTING": {
      const missingMappings = asCount(value.missingMappings);
      const missingJournals = asCount(value.missingJournals);
      const period = asText(value.fiscalPeriodStatus);
      if (complete) return en ? "Sales accounting is ready for posting." : "Le suivi comptable des ventes est prêt pour la comptabilisation.";
      const parts: string[] = [];
      if (missingMappings) parts.push(en ? `${missingMappings} accounting mapping${missingMappings === 1 ? "" : "s"}` : `${missingMappings} mapping${missingMappings === 1 ? "" : "s"} comptable${missingMappings === 1 ? "" : "s"}`);
      if (missingJournals) parts.push(en ? `${missingJournals} journal${missingJournals === 1 ? "" : "s"}` : `${missingJournals} journal${missingJournals === 1 ? "" : "ux"}`);
      if (period && period !== "OPEN") parts.push(en ? "an open accounting period" : "une période comptable ouverte");
      return parts.length
        ? (en ? `Finance still requires ${parts.join(", ")}. Open the accounting setup to complete these checks.` : `Finance demande encore ${parts.join(", ")}. Ouvrez la mise en service comptable pour terminer ces vérifications.`)
        : (en ? "Open the accounting setup to see the remaining Finance prerequisite." : "Ouvrez la mise en service comptable pour voir le prérequis Finance restant.");
    }
    case "RETAIL_CONFIGURATION":
      return complete
        ? (en ? "Shop settings are active." : "Les paramètres du Shop sont actifs.")
        : (en ? "Save and activate the Shop settings in Point-of-sale setup." : "Enregistrez et activez les paramètres du Shop dans Configuration du point de vente.");
    default:
      return complete
        ? (en ? "Configuration verified." : "Configuration vérifiée.")
        : (en ? "Open this step to complete its configuration." : "Ouvrez cette étape pour terminer sa configuration.");
  }
}
