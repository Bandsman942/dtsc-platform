import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

type RetailGuideCode = "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE";

const fr: Record<RetailGuideCode, ContextualUserGuide> = {
  RETAIL_POS: {
    code: "RETAIL_POS",
    title: "Guide du Point de vente",
    summary: "Encaisser une vente comptoir, décrémenter le stock, répartir les moyens de paiement et annuler un ticket de manière auditée.",
    audience: "Gérant, responsable ventes, vendeur et caissier",
    updatedAt: "2026-08-07",
    capabilities: ["Tickets POS idempotents", "Recherche catalogue/SKU", "Paiements cash, Mobile Money, banque ou carte", "Paiements fractionnés", "Sortie de stock atomique sans stock négatif", "Client facultatif pour une vente comptoir", "Annulation avec retour stock et contre-mouvements de trésorerie", "Historique et indicateurs journaliers"],
    steps: [
      { title: "Préparer la caisse", description: "Avant un encaissement cash, ouvrez votre session de caisse sur le compte physique utilisé.", actions: ["Sélectionner le compte CASH", "Saisir le fonds d’ouverture", "Vérifier que la session apparaît comme ouverte"] },
      { title: "Créer un ticket", description: "Le serveur recalcule les totaux et refuse un paiement qui ne correspond pas au total du ticket.", actions: ["Choisir le dépôt/entrepôt et l’article", "Saisir quantité, prix, remise et taxe", "Choisir un ou plusieurs moyens de paiement", "Valider le ticket"], cautions: ["Un article suivi en stock doit disposer d’un article d’inventaire actif.", "Une sortie qui rendrait le stock négatif est bloquée."] },
      { title: "Contrôler la vente", description: "Le ticket terminé crée en une seule transaction la vente, les lignes, les paiements, les mouvements de stock et les mouvements de trésorerie.", actions: ["Vérifier le numéro POS", "Contrôler le total et la devise", "Vérifier le stock restant", "Vérifier la caisse ou le compte d’encaissement"] },
      { title: "Annuler un ticket", description: "L’annulation est réservée aux personnes autorisées et ne supprime jamais l’historique.", actions: ["Ouvrir le ticket", "Saisir le motif", "Valider l’annulation", "Contrôler le retour en stock et les contre-mouvements financiers"] },
    ],
    limitations: ["Le POS enregistre la vérité opérationnelle stock/trésorerie. La comptabilisation GL détaillée dépend de la configuration Finance de l’entreprise."],
  },
  MOBILE_MONEY_AGENCY: {
    code: "MOBILE_MONEY_AGENCY",
    title: "Guide Agence Mobile Money",
    summary: "Gérer les dépôts et retraits clients avec séparation du cash physique, du float opérateur, des frais et des commissions.",
    audience: "Gérant, agent Mobile Money, caissier et contrôleur",
    updatedAt: "2026-08-07",
    capabilities: ["M-Pesa, Orange Money, Airtel Money et Afrimoney pré-provisionnés", "Opérateurs configurables", "Dépôts et retraits", "Compte CASH distinct du float MOBILE_MONEY", "Frais client séparés", "Commission opérateur suivie séparément", "Référence fournisseur", "Annulation contrôlée", "Historique par opérateur et période"],
    steps: [
      { title: "Finaliser les opérateurs", description: "M-Pesa, Orange Money, Airtel Money et Afrimoney sont créés automatiquement pour un Shop. L’entreprise doit seulement activer ses usages réels et lier ses vrais comptes de float.", actions: ["Créer ou choisir un compte financier MOBILE_MONEY réel", "Ouvrir la section Opérateurs", "Vérifier les opérateurs utilisés par le Shop", "Associer chaque opérateur au bon compte de float"], cautions: ["DTSC ne crée ni faux compte de float ni solde initial à votre place."] },
      { title: "Ouvrir la caisse", description: "Toute opération qui touche le cash exige une session de caisse ouverte par l’agent connecté.", actions: ["Choisir la caisse", "Saisir le fonds initial", "Ouvrir la session"] },
      { title: "Enregistrer un dépôt", description: "Le client remet du cash ; le cash augmente et le float diminue du principal.", actions: ["Choisir Dépôt", "Sélectionner l’opérateur", "Saisir téléphone, montant et référence externe", "Saisir séparément frais et commission", "Valider"] },
      { title: "Enregistrer un retrait", description: "Le client reçoit du cash ; le cash diminue et le float augmente du principal.", actions: ["Choisir Retrait", "Contrôler le cash disponible", "Saisir la référence opérateur", "Valider", "Faire signer ou conserver la preuve selon la procédure du shop"] },
      { title: "Annuler", description: "Une annulation crée les effets inverses et conserve l’opération originale.", cautions: ["N’annulez qu’après confirmation que la transaction fournisseur a réellement été annulée ou inversée."] },
    ],
    limitations: ["DTSC ne déclenche pas lui-même l’API M‑Pesa/Orange/Airtel/Afrimoney dans cette version : la référence externe prouve l’exécution chez l’opérateur et DTSC tient le registre opérationnel."],
  },
  TELCO_TOPUPS: {
    code: "TELCO_TOPUPS",
    title: "Guide Télécom & forfaits",
    summary: "Vendre du crédit, des forfaits internet et des recharges avec coût opérateur, marge, encaissement et float fournisseur.",
    audience: "Gérant, responsable ventes, vendeur et agent télécom",
    updatedAt: "2026-08-07",
    capabilities: ["Providers Shop pré-provisionnés", "Opérateurs configurables", "Forfaits reliables au catalogue", "Prix de vente et coût opérateur", "Marge calculée côté serveur", "Encaissement séparé du float fournisseur", "Statut SUCCESS/FAILED", "Référence opérateur", "Annulation auditée"],
    steps: [
      { title: "Préparer le catalogue", description: "Les forfaits récurrents peuvent être créés comme services dans le catalogue afin de standardiser les prix et libellés.", actions: ["Créer une catégorie Télécom", "Créer les services/forfaits", "Renseigner prix indicatif et coût indicatif", "Ne pas activer le suivi de stock pour un service numérique"] },
      { title: "Finaliser le float opérateur", description: "Les providers standards existent déjà après l’onboarding Shop. Associez ceux réellement utilisés à un compte MOBILE_MONEY ou CLEARING dédié aux recharges.", actions: ["Vérifier le provider", "Choisir le compte de float Télécom réel", "Vérifier la devise"], cautions: ["Aucun compte ou solde opérateur n’est inventé pendant le provisioning."] },
      { title: "Enregistrer la recharge", description: "Le serveur calcule la marge et débite le coût du float seulement si le statut est SUCCESS.", actions: ["Saisir le numéro destinataire", "Choisir ou décrire l’offre", "Saisir prix de vente et coût opérateur", "Choisir le compte d’encaissement", "Ajouter la référence externe", "Confirmer Success ou Failed"] },
    ],
    limitations: ["L’exécution technique de la recharge reste chez le fournisseur/opérateur tant qu’aucune API partenaire n’est connectée."],
  },
  RETAIL_DAILY_CLOSE: {
    code: "RETAIL_DAILY_CLOSE",
    title: "Guide Clôture cash & float",
    summary: "Comparer chaque fin de journée le cash compté et les floats déclarés aux soldes théoriques, puis faire valider la clôture par une autre personne.",
    audience: "Caissier, agent Mobile Money, gérant et contrôleur",
    updatedAt: "2026-08-07",
    capabilities: ["Clôture multi-comptes", "Comptage des coupures cash", "Solde théorique calculé depuis la session de caisse", "Rapprochement des floats opérateurs", "Écarts obligatoirement motivés", "Validation indépendante", "Écarts de caisse transmis au moteur Finance", "Historique de clôture"],
    steps: [
      { title: "Préparer la fin de journée", description: "Terminez les ventes et opérations en cours puis ouvrez Clôture cash & float.", actions: ["Vérifier qu’aucune opération n’est encore en attente", "Compter physiquement la caisse", "Relever le solde de chaque wallet/float opérateur"] },
      { title: "Déclarer les soldes", description: "Pour le cash, le total des coupures doit exactement correspondre au montant déclaré.", actions: ["Ajouter chaque compte à clôturer", "Saisir le montant déclaré", "Pour CASH, détailler les coupures", "Pour chaque écart, saisir une justification"] },
      { title: "Soumettre", description: "La caisse passe en attente de validation et les écarts restent visibles.", actions: ["Contrôler le récapitulatif", "Soumettre la clôture", "Ne plus saisir de mouvements sur la session soumise"] },
      { title: "Faire valider", description: "Le validateur doit être une autre personne autorisée.", actions: ["Examiner le théorique, le déclaré et les écarts", "Approuver ou refuser avec motif", "En cas d’approbation, la session CASH est fermée"] },
    ],
  },
};

const en: Record<RetailGuideCode, ContextualUserGuide> = {
  RETAIL_POS: { ...fr.RETAIL_POS, title: "Point of Sale guide", summary: "Run counter sales, update inventory, split tenders and reverse a receipt with a complete audit trail.", audience: "Store manager, sales manager, seller and cashier", capabilities: ["Idempotent POS receipts", "Catalog/SKU selection", "Cash, Mobile Money, bank or card tenders", "Split tenders", "Atomic stock issue", "Optional walk-in customer", "Audited reversal with inventory return", "Daily history and metrics"], steps: [{ title: "Open the till", description: "Open your cash session before accepting cash.", actions: ["Select a CASH account", "Enter the opening float", "Confirm the session is open"] }, { title: "Create a receipt", description: "The server recalculates totals and rejects mismatched tenders.", actions: ["Select warehouse and item", "Enter quantity and pricing", "Choose one or more tenders", "Confirm the receipt"] }, { title: "Reverse when required", description: "Authorized reversals preserve the original record and create opposite inventory and treasury movements." }] },
  MOBILE_MONEY_AGENCY: { ...fr.MOBILE_MONEY_AGENCY, title: "Mobile Money Agency guide", summary: "Run deposits and withdrawals while keeping physical cash, operator float, fees and commissions separate.", audience: "Store manager, Mobile Money agent, cashier and controller", capabilities: ["M-Pesa, Orange Money, Airtel Money and Afrimoney pre-provisioned", "Configurable providers", "Deposits and withdrawals", "Separate CASH and MOBILE_MONEY accounts", "Separate customer fees", "Separate provider commission", "Provider reference", "Controlled reversal", "History by provider and period"], steps: [{ title: "Finalize providers", description: "Standard Shop providers are created automatically. Link only the providers you actually use to real MOBILE_MONEY float accounts.", cautions: ["DTSC never invents a float account or opening balance."] }, { title: "Open cash", description: "Any operation touching cash requires an open cashier session." }, { title: "Record a deposit", description: "Cash increases while provider float decreases by the principal." }, { title: "Record a withdrawal", description: "Cash decreases while provider float increases by the principal." }, { title: "Reverse carefully", description: "Only reverse in DTSC after the provider-side operation has also been reversed." }] },
  TELCO_TOPUPS: { ...fr.TELCO_TOPUPS, title: "Telco & top-ups guide", summary: "Sell airtime and internet bundles with operator cost, margin, tender and provider float tracking.", audience: "Store manager, sales manager, seller and telco agent", capabilities: ["Standard Shop providers pre-provisioned", "Configurable providers", "Catalog-linked bundles", "Selling price and operator cost", "Server-calculated margin", "Tender separated from provider float", "SUCCESS/FAILED status", "Operator reference", "Audited reversal"], steps: [{ title: "Prepare the catalog", description: "Reusable bundles can be catalog services." }, { title: "Finalize provider float", description: "Standard providers already exist after Shop onboarding. Link the providers you use to a real MOBILE_MONEY or CLEARING account.", cautions: ["Provisioning never invents operator accounts or balances."] }, { title: "Record the top-up", description: "Margin is calculated server-side and provider float is debited only for successful transactions." }] },
  RETAIL_DAILY_CLOSE: { ...fr.RETAIL_DAILY_CLOSE, title: "Cash & float daily close guide", summary: "Compare counted cash and declared provider floats with system balances and require independent validation.", audience: "Cashier, Mobile Money agent, store manager and controller", steps: [{ title: "Prepare close", description: "Finish outstanding operations, count cash and read each provider wallet balance." }, { title: "Declare balances", description: "Cash denominations must equal the declared cash total and every variance needs a reason." }, { title: "Submit", description: "The cash session moves to pending validation." }, { title: "Independent validation", description: "Another authorized user approves or rejects the close." }] },
};

export function getRetailUserGuide(code: string, locale: string): ContextualUserGuide {
  const resolved = (code in fr ? code : "RETAIL_POS") as RetailGuideCode;
  return locale === "en" ? en[resolved] : fr[resolved];
}
