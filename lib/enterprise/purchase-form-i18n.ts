import { enterpriseCoreIntlLocale } from "@/lib/enterprise-core-i18n";

const PURCHASE_FORM_GUIDANCE = {
  fr: {
    subject: "Donnez un objet court qui permettra d’identifier cet achat dans les listes, validations et rapports.",
    sourceRequest: "Reliez l’achat à la demande interne d’origine lorsqu’elle existe afin de conserver la traçabilité du besoin.",
    supplier: "Sélectionnez un fournisseur actif de cette entreprise. La référence est contrôlée dans le même espace entreprise.",
    budgetLine: "Choisissez la ligne budgétaire qui doit financer l’achat. Laissez vide uniquement si le processus autorise encore un brouillon non budgété.",
    buyer: "Désignez le collaborateur chargé de suivre la commande, les échanges fournisseur et la réception.",
    department: "Indiquez le département bénéficiaire ou responsable de cet achat.",
    priority: "Définissez l’urgence opérationnelle. Utilisez Critique seulement lorsqu’un retard bloque réellement l’activité.",
    currency: "Choisissez la devise commune à toutes les lignes de ce brouillon afin d’éviter les codes ou variantes saisis manuellement.",
    expectedDelivery: "Indiquez la date à laquelle la livraison ou la prestation est attendue.",
    description: "Précisez le besoin, le contexte et les contraintes utiles à l’approbation et au suivi de l’achat.",
    items: "Ajoutez une ligne par bien ou service pour conserver séparément la quantité, l’unité, le prix et la taxe.",
    lineDescription: "Bien ou service",
    lineDescriptionHelp: "Décrivez précisément ce qui doit être acheté avec un libellé métier compréhensible.",
    quantity: "Quantité",
    quantityHelp: "Indiquez la quantité correspondant exactement à l’unité sélectionnée.",
    unit: "Unité",
    unitHelp: "Choisissez une unité standard afin d’éviter les variantes manuelles comme u, unité, pcs ou autres abréviations incohérentes.",
    unitPrice: "Prix unitaire",
    unitPriceHelp: "Saisissez le prix d’une unité dans la devise sélectionnée. Le total reste recalculé côté serveur.",
    taxRate: "Taxe (%)",
    taxRateHelp: "Indiquez le taux de taxe applicable à cette ligne. Utilisez 0 lorsqu’aucune taxe ne s’applique.",
    approver: "Choisissez la personne chargée de décider sur cette demande d’achat.",
    receiptQuantity: "Indiquez uniquement la quantité réellement reçue pour cette ligne.",
    receiptNotes: "Ajoutez une précision utile sur l’état, l’écart ou les conditions de la réception.",
  },
  en: {
    subject: "Use a short subject that clearly identifies this purchase in lists, approvals and reports.",
    sourceRequest: "Link the purchase to the originating internal request when one exists so the business need remains traceable.",
    supplier: "Select an active supplier from this organization. The reference remains controlled inside the same enterprise workspace.",
    budgetLine: "Choose the budget line that should fund the purchase. Leave it empty only when the workflow still allows an unbudgeted draft.",
    buyer: "Select the collaborator responsible for following the order, supplier exchanges and receipt.",
    department: "Identify the department that benefits from or owns this purchase.",
    priority: "Set the operational urgency. Use Critical only when a delay would genuinely block the activity.",
    currency: "Select one currency for all lines in this draft so users cannot introduce manual codes or inconsistent variants.",
    expectedDelivery: "Enter the date when the delivery or service is expected.",
    description: "Describe the need, context and constraints that approvers and buyers should understand.",
    items: "Add one line per good or service so quantity, unit, price and tax remain explicit and separate.",
    lineDescription: "Good or service",
    lineDescriptionHelp: "Describe precisely what must be purchased using a clear business label.",
    quantity: "Quantity",
    quantityHelp: "Enter the quantity that corresponds exactly to the selected unit.",
    unit: "Unit",
    unitHelp: "Select a standard unit to avoid inconsistent manual variants and abbreviations.",
    unitPrice: "Unit price",
    unitPriceHelp: "Enter the price of one unit in the selected currency. The server remains authoritative for totals.",
    taxRate: "Tax (%)",
    taxRateHelp: "Enter the tax rate that applies to this line. Use 0 when no tax applies.",
    approver: "Select the person responsible for deciding on this purchase request.",
    receiptQuantity: "Enter only the quantity that was actually received for this line.",
    receiptNotes: "Add any useful note about condition, variance or receipt circumstances.",
  },
} as const;

export type PurchaseFormGuidanceKey = keyof typeof PURCHASE_FORM_GUIDANCE.fr;

export function purchaseFormGuidance(locale: string | null | undefined, key: PurchaseFormGuidanceKey) {
  const language = enterpriseCoreIntlLocale(locale).toLowerCase().startsWith("en") ? "en" : "fr";
  return PURCHASE_FORM_GUIDANCE[language][key];
}
