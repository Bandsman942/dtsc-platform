import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

type RetailGuideCode = "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE";

const fr: Record<RetailGuideCode, ContextualUserGuide> = {
  RETAIL_POS: {
    code: "RETAIL_POS",
    title: "Guide d’onboarding Shop & Point de vente",
    summary: "Mettre une entreprise Shop en service de l’offre à la première journée contrôlée : structure, catalogue, stock, Finance, taux de change, caisse, POS, Mobile Money, Télécom, reporting et clôture.",
    audience: "Administrateur entreprise, gérant, responsable ventes, vendeur, caissier et contrôleur",
    updatedAt: "2026-08-07",
    capabilities: ["Onboarding STARTER / BUSINESS / ENTERPRISE", "Checklist Mise en service du Shop", "Panier multi-articles", "Recherche catalogue/SKU", "Prix catalogue protégés côté serveur", "Dérogation de prix/remise réservée aux responsables avec motif", "Paiements cash, Mobile Money, banque ou carte", "Paiement fractionné", "Sortie de stock atomique", "Taux de change Finance datés et auditables", "Consolidation multi-devise au taux historique", "Ticket imprimable/partageable", "Annulation auditée"],
    steps: [
      { title: "Choisir l’offre", description: "STARTER prépare catalogue/clients/documents. BUSINESS est le minimum opérationnel recommandé pour POS, stock, Finance, Mobile Money, Télécom et clôture. ENTERPRISE reprend ce cœur et ajoute l’échelle et la gouvernance du plan.", cautions: ["Ne vendez pas STARTER comme un POS opérationnel complet."] },
      { title: "Créer l’entreprise et appliquer le template Shop", description: "Depuis la Console DTSC, créez l’organisation CLIENT, choisissez COMMERCE_RETAIL, le plan et l’administrateur, puis appliquez le template sectoriel.", actions: ["Faire accepter l’invitation administrateur", "Vérifier le profil RETAIL_TELCO_MOBILE_MONEY", "Contrôler les modules autorisés par le plan"] },
      { title: "Structurer l’équipe", description: "Affectez les départements et postes Shop avant l’exploitation afin que chaque collaborateur dispose uniquement de ses permissions métier.", actions: ["Nommer le gérant", "Affecter vendeurs/caissiers/agents", "Nommer le responsable achats", "Prévoir un contrôleur indépendant"] },
      { title: "Créer site, dépôt, catalogue et stock", description: "Le POS réutilise les référentiels ERP communs. Créez le site réel, le dépôt, les articles avec prix/devise, puis chargez le stock initial via les mouvements d’inventaire.", actions: ["Créer le site et le dépôt", "Renseigner prix/SKU/devise", "Créer les articles d’inventaire", "Contrôler le disponible"] },
      { title: "Configurer Finance et les devises", description: "Définissez la devise fonctionnelle, la devise de présentation si nécessaire et les vrais comptes CASH/MOBILE_MONEY/BANK/CLEARING.", cautions: ["DTSC ne crée aucun faux compte ni faux solde."] },
      { title: "Configurer les taux de change", description: "Dans Finance > Trésorerie > Taux de change et consolidation multi-devise, saisissez les paires sous la forme 1 SOURCE = RATE TARGET avec date d’effet et source.", actions: ["Créer les paires nécessaires", "Vérifier la devise de présentation/fonctionnelle", "Ouvrir le rapport consolidé Shop"], cautions: ["Un taux publié n’est pas réécrit : désactivez-le avec motif puis créez une nouvelle version.", "Si un taux historique manque, DTSC refuse d’afficher un total consolidé partiel."] },
      { title: "Mapper wallets et réseaux", description: "Reliez M-Pesa/Orange Money/Airtel Money/Afrimoney à leurs floats Mobile Money et Vodacom/Orange/Airtel/Africell à leurs floats Télécom.", cautions: ["Wallet Mobile Money et réseau Télécom sont deux concepts distincts."] },
      { title: "Vérifier la mise en service", description: "Le bandeau Mise en service du Shop indique les prérequis réellement persistés, y compris la disponibilité de la consolidation FX.", actions: ["Vérifier le profil Shop", "Vérifier le dépôt", "Vérifier le catalogue", "Vérifier la caisse", "Vérifier la consolidation multi-devise"] },
      { title: "Ouvrir sa caisse", description: "Avant un paiement cash, ouvrez votre session de caisse. Le POS et Mobile Money réutilisent ensuite automatiquement cette caisse.", actions: ["Choisir la caisse physique", "Compter le fonds d’ouverture", "Confirmer l’ouverture"] },
      { title: "Construire le premier panier", description: "Recherchez les produits par nom, code ou SKU et ajoutez plusieurs articles au même ticket.", actions: ["Choisir le dépôt", "Rechercher les articles", "Ajouter au panier", "Ajuster les quantités"] },
      { title: "Encaisser et tester les contrôles", description: "Le serveur vérifie le prix catalogue, les permissions de dérogation, le total des paiements et le stock avant validation.", actions: ["Choisir le mode de paiement", "Tester un paiement fractionné si utilisé", "Vérifier qu’un vendeur ne peut pas imposer un autre prix", "Encaisser"] },
      { title: "Tester les services opérateurs", description: "Effectuez un dépôt et un retrait Mobile Money puis une recharge Télécom SUCCESS et FAILED, avec confirmation du numéro et référence opérateur unique.", actions: ["Tester l’anti-doublon", "Contrôler les floats", "Vérifier les marges Télécom"] },
      { title: "Contrôler le reporting multi-devise", description: "Le rapport consolidé convertit chaque opération au taux applicable à sa date. Les agrégats dans les devises d’origine restent toujours séparés.", actions: ["Tester CDF et USD", "Contrôler les taux effectivement utilisés", "Corriger toute paire manquante dans Finance"] },
      { title: "Clôturer la première journée", description: "Comptez cash et floats, justifiez les écarts, soumettez la clôture et faites-la valider par une autre personne autorisée.", actions: ["Compter les coupures", "Déclarer les floats", "Soumettre", "Faire approuver indépendamment"] },
      { title: "Remettre le ticket et conserver les preuves", description: "Après succès, le numéro du ticket, les lignes, le total, les références opérateurs, les taux utilisés et les audits restent traçables selon leur domaine.", actions: ["Imprimer ou partager le ticket", "Contrôler les historiques"] },
    ],
    limitations: ["Une taxe ou remise manuelle qui diffère du catalogue est traitée comme une dérogation et exige un responsable autorisé avec motif.", "L’exécution chez les opérateurs Mobile Money/Télécom reste externe tant qu’une API partenaire n’est pas connectée.", "La configuration d’un taux décrit sa provenance mais n’effectue pas automatiquement un appel temps réel à une banque centrale ou au marché."],
  },
  MOBILE_MONEY_AGENCY: {
    code: "MOBILE_MONEY_AGENCY",
    title: "Guide Agence Mobile Money",
    summary: "Gérer dépôts et retraits avec une caisse ouverte, un wallet Mobile Money configuré et une référence opérateur unique.",
    audience: "Gérant, agent Mobile Money, caissier et contrôleur",
    updatedAt: "2026-08-07",
    capabilities: ["M-Pesa, Orange Money, Airtel Money et Afrimoney pré-provisionnés comme wallets Mobile Money", "Float résolu automatiquement", "Numéro normalisé", "Confirmation avant validation", "Référence opérateur obligatoire", "Protection anti-doublon", "Dépôts et retraits", "Frais et commissions séparés", "Annulation contrôlée"],
    steps: [
      { title: "Mapper les wallets", description: "Les wallets sont créés automatiquement. Un responsable les relie une seule fois aux vrais comptes de float.", actions: ["Ouvrir Configuration", "Choisir le compte MOBILE_MONEY correspondant", "Enregistrer"], cautions: ["DTSC ne crée ni faux compte ni faux solde."] },
      { title: "Ouvrir la caisse", description: "L’agent n’a plus à choisir un compte cash pendant chaque opération : la session ouverte est utilisée automatiquement." },
      { title: "Préparer l’opération", description: "Choisissez Dépôt ou Retrait, le wallet, le téléphone, le montant, les frais/commissions et la référence opérateur." },
      { title: "Vérifier puis confirmer", description: "Une étape de confirmation affiche le téléphone normalisé et le montant avant écriture.", cautions: ["Une référence opérateur déjà utilisée est refusée."] },
      { title: "Annuler avec preuve", description: "N’annulez dans DTSC qu’après inversion réelle chez le fournisseur lorsque cela est requis." },
    ],
    limitations: ["DTSC enregistre et rapproche l’opération ; l’exécution chez M-Pesa, Orange Money, Airtel Money ou Afrimoney reste externe tant qu’une API partenaire n’est pas connectée."],
  },
  TELCO_TOPUPS: {
    code: "TELCO_TOPUPS",
    title: "Guide Télécom & forfaits",
    summary: "Vendre crédit et forfaits en distinguant l’opérateur réseau du wallet Mobile Money utilisé ailleurs dans le Shop.",
    audience: "Gérant, responsable ventes, vendeur et agent Télécom",
    updatedAt: "2026-08-07",
    capabilities: ["Vodacom, Orange, Airtel et Africell pré-provisionnés comme opérateurs réseau", "Séparation Vodacom / M-Pesa et réseau / wallet", "Float Télécom résolu automatiquement", "Numéro normalisé", "Confirmation avant exécution", "Référence opérateur obligatoire si SUCCESS", "Protection anti-doublon", "Coût et marge", "SUCCESS/FAILED", "Annulation auditée"],
    steps: [
      { title: "Préparer les opérateurs réseau", description: "Vodacom, Orange, Airtel et Africell sont distincts des wallets M-Pesa, Orange Money, Airtel Money et Afrimoney.", actions: ["Ouvrir Configuration", "Relier chaque réseau utilisé à son vrai compte de float Télécom", "Vérifier la devise"] },
      { title: "Préparer les forfaits", description: "Les offres fréquentes peuvent être enregistrées comme services du catalogue avec prix et coût indicatifs." },
      { title: "Préparer la recharge", description: "Choisissez le réseau, saisissez le numéro, l’offre, le prix, le coût et le statut d’exécution." },
      { title: "Vérifier le numéro", description: "L’écran de confirmation montre le numéro normalisé avant la validation finale.", cautions: ["Une opération SUCCESS exige une référence fournisseur unique."] },
    ],
    limitations: ["La recharge est actuellement exécutée sur le canal opérateur externe ; DTSC tient l’enregistrement, le float, la marge et le rapprochement."],
  },
  RETAIL_DAILY_CLOSE: {
    code: "RETAIL_DAILY_CLOSE",
    title: "Guide Clôture cash & float",
    summary: "Compter la caisse, déclarer les floats par devise, justifier les écarts et faire valider la clôture par une autre personne.",
    audience: "Caissier, agent Mobile Money, gérant et contrôleur",
    updatedAt: "2026-08-07",
    capabilities: ["Clôture multi-comptes", "Comptage des coupures", "Solde théorique de la session", "Floats par devise", "Écart motivé", "Validation indépendante", "Posting Finance des écarts approuvés", "Historique"],
    steps: [
      { title: "Terminer les opérations", description: "Vérifiez qu’aucune opération n’est en cours puis relevez cash et wallets." },
      { title: "Déclarer", description: "Pour CASH, les coupures doivent totaliser exactement le montant déclaré. Les devises restent séparées." },
      { title: "Soumettre", description: "La session passe en attente de validation et ne doit plus recevoir de nouveaux mouvements." },
      { title: "Faire valider", description: "Le validateur doit être une autre personne autorisée ; il approuve ou refuse avec motif." },
    ],
  },
};

const en: Record<RetailGuideCode, ContextualUserGuide> = {
  RETAIL_POS: {
    ...fr.RETAIL_POS,
    title: "Shop onboarding & Point of Sale guide",
    summary: "Bring a Shop company from plan selection to its first controlled operating day: organization, catalog, inventory, Finance, exchange rates, till, POS, Mobile Money, Telco, reporting and closing.",
    audience: "Company administrator, store manager, sales manager, seller, cashier and controller",
    capabilities: ["STARTER / BUSINESS / ENTERPRISE onboarding", "Shop activation checklist", "Multi-item basket", "Catalog/SKU search", "Server-protected catalog prices", "Manager-only price/discount override with reason", "Cash, Mobile Money, bank or card payments", "Split payment", "Atomic stock issue", "Dated and auditable Finance exchange rates", "Historical FX multi-currency consolidation", "Printable/shareable receipt", "Audited reversal"],
    steps: [
      { title: "Choose the offer", description: "STARTER prepares catalog/customers/documents. BUSINESS is the recommended operational minimum for POS, inventory, Finance, Mobile Money, Telco and closing. ENTERPRISE keeps the same Shop core and adds plan-level scale and governance.", cautions: ["Do not sell STARTER as a full operational POS."] },
      { title: "Create the company and apply the Shop template", description: "From the DTSC Console, create the CLIENT organization, choose COMMERCE_RETAIL, the plan and administrator, then apply the sector template.", actions: ["Have the administrator accept the invitation", "Verify RETAIL_TELCO_MOBILE_MONEY", "Check plan entitlements"] },
      { title: "Set up people, locations, catalog and stock", description: "Assign Shop roles, create the physical site/warehouse, build the catalog with prices/currencies and load opening stock through canonical inventory movements." },
      { title: "Configure Finance and currencies", description: "Set the functional currency, optional presentation currency and real CASH/MOBILE_MONEY/BANK/CLEARING accounts.", cautions: ["DTSC never invents accounts or balances."] },
      { title: "Configure exchange rates", description: "In Finance > Treasury > Exchange rates and multi-currency consolidation, save each required pair as 1 SOURCE = RATE TARGET with its effective date and source.", cautions: ["Published rates are not overwritten. Deactivate with a reason, then create a new dated version.", "If a historical rate is missing, DTSC withholds the consolidated total."] },
      { title: "Map wallets and telecom networks", description: "Map Mobile Money wallets to their float accounts and telecom networks to their own float/clearing accounts." },
      { title: "Open the till and run the first POS sale", description: "Count opening cash, open the session, build a multi-item basket, test price controls and collect payment." },
      { title: "Test Mobile Money and Telco", description: "Run deposit/withdrawal and successful/failed top-up scenarios, including phone confirmation and duplicate-reference rejection." },
      { title: "Validate multi-currency reporting", description: "Run CDF and USD activity, verify native aggregates, historical FX consolidation and the rates actually used." },
      { title: "Close the first operating day", description: "Count cash/floats, explain variances, submit the close and have a different authorized person validate it." },
    ],
    limitations: ["Manual tax/discount values that differ from catalog rules are treated as controlled overrides.", "Operator-side Mobile Money/Telco execution remains external until a partner API is connected.", "Rate source codes describe provenance; this version does not automatically call a live central-bank or market API."],
  },
  MOBILE_MONEY_AGENCY: { ...fr.MOBILE_MONEY_AGENCY, title: "Mobile Money Agency guide", summary: "Run deposits and withdrawals with an open till, configured Mobile Money wallet and unique provider reference." },
  TELCO_TOPUPS: { ...fr.TELCO_TOPUPS, title: "Telco & top-ups guide", summary: "Sell airtime and bundles while keeping the telecom network distinct from Mobile Money wallets." },
  RETAIL_DAILY_CLOSE: { ...fr.RETAIL_DAILY_CLOSE, title: "Cash & float daily close guide", summary: "Count cash, declare floats by currency, explain variances and require independent validation." },
};

export function getRetailUserGuide(code: string, locale: string): ContextualUserGuide {
  const resolved = (code in fr ? code : "RETAIL_POS") as RetailGuideCode;
  return locale === "en" ? en[resolved] : fr[resolved];
}
