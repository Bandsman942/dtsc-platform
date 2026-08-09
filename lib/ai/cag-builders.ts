import { registerSectorCagBuilder } from "@/lib/ai/cag-registry";
import { getEffectivePharmacySettings } from "@/lib/pharmacy-settings";
import { prisma } from "@/lib/prisma";

let registered = false;

export function registerBuiltInCagBuilders() {
  if (registered) return;
  registered = true;

  registerSectorCagBuilder("PHARMACY", async (context) => {
    if (!context.organization) return { code: "sector:PHARMACY", version: "2", content: "" };
    const settings = await getEffectivePharmacySettings(context.organization.id, "system");
    const safeSettings = {
      general: settings.sections.general,
      expiryFefo: settings.sections["expiry-fefo"],
      alerts: settings.sections["alerts-notifications"],
      cash: settings.sections["cash-payments"],
      quality: settings.sections.quality,
    };
    return {
      code: "sector:PHARMACY",
      version: "2",
      content: [
        "Secteur PHARMACY: appliquer FEFO et ne jamais présenter comme vendable un lot expiré, rappelé, en quarantaine ou bloqué.",
        "Toute vente, sortie de stock, clôture de caisse, commande ou validation reste une action métier à confirmer et exécuter via les routes autorisées.",
        `Paramètres opérationnels minimisés: ${JSON.stringify(safeSettings)}.`,
      ].join("\n"),
    };
  });

  registerSectorCagBuilder("HEALTH_CARE", async (context) => {
    if (!context.organization) return { code: "sector:HEALTH_CARE", version: "2", content: "" };
    const activeMembers = await prisma.organizationMember.count({ where: { organizationId: context.organization.id, status: "ACTIVE", removedAt: null } });
    return {
      code: "sector:HEALTH_CARE",
      version: "2",
      content: [
        "Secteur HEALTH_CARE: ce CAG de base reste organisationnel et non clinique.",
        "Ne jamais inventer, déduire ou révéler des données patient, diagnostics, consultations ou dossiers médicaux absents d'une source explicitement autorisée.",
        context.canReadClinicalData
          ? "Un droit de lecture du module dossier médical est résolu, mais aucune donnée clinique n'est injectée automatiquement dans ce CAG."
          : "Aucun droit clinique n'est résolu pour ce tour: rester strictement sur le contexte non clinique.",
        `Collaborateurs actifs: ${activeMembers}.`,
      ].join("\n"),
    };
  });

  registerSectorCagBuilder("COMMERCE_RETAIL", async (context) => ({
    code: "sector:COMMERCE_RETAIL",
    version: "1",
    content: [
      "Secteur COMMERCE_RETAIL / SHOP: raisonner uniquement à partir des stocks, ventes, caisse, clients, fournisseurs et réapprovisionnements réellement disponibles.",
      "Ne jamais présenter un stock, un prix, une vente ou un encaissement comme confirmé sans donnée backend autorisée.",
      "Toute mutation commerciale passe par les routes métier DTSC et leurs contrôles de confirmation, permission et idempotence.",
      `Modules lisibles: ${context.activeModuleCodes.join(", ") || "aucun"}.`,
    ].join("\n"),
  }));
}
