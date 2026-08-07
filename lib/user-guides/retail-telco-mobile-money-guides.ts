import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

type RetailGuideCode = "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE";

const fr: Record<RetailGuideCode, ContextualUserGuide> = {
  RETAIL_POS: {
    code: "RETAIL_POS",
    title: "Guide du Point de vente",
    summary: "Créer un panier multi-articles, encaisser avec les comptes réellement configurés, mettre le stock à jour et conserver un ticket audité.",
    audience: "Gérant, responsable ventes, vendeur et caissier",
    updatedAt: "2026-08-07",
    capabilities: ["Panier multi-articles", "Recherche catalogue/SKU", "Prix catalogue protégés côté serveur", "Dérogation de prix/remise réservée aux responsables avec motif", "Paiements cash, Mobile Money, banque ou carte", "Paiement fractionné", "Sortie de stock atomique", "Ticket imprimable/partageable", "Annulation auditée"],
    steps: [
      { title: "Vérifier la mise en service", description: "Le bandeau Mise en service du Shop indique les prérequis réellement persistés.", actions: ["Vérifier le profil Shop", "Vérifier le dépôt", "Vérifier le catalogue", "Vérifier la caisse"] },
      { title: "Ouvrir sa caisse", description: "Avant un paiement cash, ouvrez votre session de caisse. Le POS réutilise ensuite automatiquement cette caisse.", actions: ["Choisir la caisse physique", "Compter le fonds d’ouverture", "Confirmer l’ouverture"] },
      { title: "Construire le panier", description: "Recherchez les produits par nom, code ou SKU et ajoutez plusieurs articles au même ticket.", actions: ["Choisir le dépôt", "Rechercher l’article", "Ajouter au panier", "Ajuster les quantités"] },
      { title: "Encaisser", description: "Le serveur vérifie le prix catalogue, les permissions de dérogation, le total des paiements et le stock avant validation.", actions: ["Choisir le mode de paiement", "Vérifier le total", "Ajouter un second paiement si nécessaire", "Encaisser"] },
      { title: "Remettre le ticket", description: "Après succès, le numéro du ticket, les lignes et le total restent disponibles.", actions: ["Imprimer ou partager le ticket", "Contrôler l’historique"] },
    ],
    limitations: ["Une taxe ou remise manuelle qui diffère du catalogue est traitée comme une dérogation et exige un responsable autorisé avec motif."],
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
  RETAIL_POS: { ...fr.RETAIL_POS, title: "Point of Sale guide", summary: "Build a multi-item basket, collect payment from configured accounts, update inventory and preserve an audited receipt." },
  MOBILE_MONEY_AGENCY: { ...fr.MOBILE_MONEY_AGENCY, title: "Mobile Money Agency guide", summary: "Run deposits and withdrawals with an open till, configured Mobile Money wallet and unique provider reference." },
  TELCO_TOPUPS: { ...fr.TELCO_TOPUPS, title: "Telco & top-ups guide", summary: "Sell airtime and bundles while keeping the telecom network distinct from Mobile Money wallets." },
  RETAIL_DAILY_CLOSE: { ...fr.RETAIL_DAILY_CLOSE, title: "Cash & float daily close guide", summary: "Count cash, declare floats by currency, explain variances and require independent validation." },
};

export function getRetailUserGuide(code: string, locale: string): ContextualUserGuide {
  const resolved = (code in fr ? code : "RETAIL_POS") as RetailGuideCode;
  return locale === "en" ? en[resolved] : fr[resolved];
}
