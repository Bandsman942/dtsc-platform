export type ReferenceChoice = { id: string; label: string };

type LocalizedReferenceChoice = {
  id: string;
  fr: string;
  en: string;
};

export const PAYMENT_METHOD_CODES = ["BANK_TRANSFER", "CASH", "MOBILE_MONEY", "CARD", "CHECK"] as const;
export const REQUEST_TYPE_CODES = ["GENERAL", "INFORMATION", "DOCUMENT", "VALIDATION", "SUPPORT", "ACTION", "MEETING", "FOLLOW_UP", "OTHER"] as const;
export const LEGAL_LINK_ENTITY_TYPE_CODES = ["PROJECT", "SUPPLIER", "CLIENT", "EMPLOYEE", "CONTRACT", "OPERATION", "FINANCE", "TECHNICAL", "SENSITIVE_DATA", "MEDICAL_DATA", "OTHER"] as const;
export const PHARMACY_TYPE_CODES = ["OFFICINE", "CLINIC_INTERNAL", "HOSPITAL", "DEPOT", "WHOLESALE", "MOBILE", "OTHER"] as const;
export const ASSET_INCIDENT_TYPE_CODES = ["DAMAGE"] as const;

export type ControlledReferenceKind = "currency" | "unit" | "paymentMethod" | "requestType" | "linkedEntityType" | "pharmacyType" | "assetIncidentType";

const CURRENCY_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "USD", fr: "Dollar américain (USD)", en: "US dollar (USD)" },
  { id: "CDF", fr: "Franc congolais (CDF)", en: "Congolese franc (CDF)" },
  { id: "EUR", fr: "Euro (EUR)", en: "Euro (EUR)" },
  { id: "GBP", fr: "Livre sterling (GBP)", en: "Pound sterling (GBP)" },
  { id: "CAD", fr: "Dollar canadien (CAD)", en: "Canadian dollar (CAD)" },
  { id: "CHF", fr: "Franc suisse (CHF)", en: "Swiss franc (CHF)" },
  { id: "ZAR", fr: "Rand sud-africain (ZAR)", en: "South African rand (ZAR)" },
  { id: "KES", fr: "Shilling kényan (KES)", en: "Kenyan shilling (KES)" },
  { id: "UGX", fr: "Shilling ougandais (UGX)", en: "Ugandan shilling (UGX)" },
  { id: "TZS", fr: "Shilling tanzanien (TZS)", en: "Tanzanian shilling (TZS)" },
  { id: "RWF", fr: "Franc rwandais (RWF)", en: "Rwandan franc (RWF)" },
  { id: "XAF", fr: "Franc CFA CEMAC (XAF)", en: "CFA franc BEAC (XAF)" },
  { id: "XOF", fr: "Franc CFA UEMOA (XOF)", en: "CFA franc BCEAO (XOF)" },
  { id: "NGN", fr: "Naira nigérian (NGN)", en: "Nigerian naira (NGN)" },
] as const;

const UNIT_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "unit", fr: "Unité", en: "Unit" },
  { id: "box", fr: "Boîte", en: "Box" },
  { id: "pack", fr: "Paquet", en: "Pack" },
  { id: "kg", fr: "Kilogramme (kg)", en: "Kilogram (kg)" },
  { id: "g", fr: "Gramme (g)", en: "Gram (g)" },
  { id: "l", fr: "Litre (L)", en: "Litre (L)" },
  { id: "ml", fr: "Millilitre (mL)", en: "Millilitre (mL)" },
  { id: "m", fr: "Mètre (m)", en: "Metre (m)" },
  { id: "cm", fr: "Centimètre (cm)", en: "Centimetre (cm)" },
  { id: "hour", fr: "Heure", en: "Hour" },
  { id: "day", fr: "Jour", en: "Day" },
  { id: "service", fr: "Prestation / service", en: "Service" },
] as const;

const PAYMENT_METHOD_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "BANK_TRANSFER", fr: "Virement bancaire", en: "Bank transfer" },
  { id: "CASH", fr: "Espèces", en: "Cash" },
  { id: "MOBILE_MONEY", fr: "Mobile Money", en: "Mobile Money" },
  { id: "CARD", fr: "Carte bancaire", en: "Payment card" },
  { id: "CHECK", fr: "Chèque", en: "Cheque" },
] as const;

const REQUEST_TYPE_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "GENERAL", fr: "Demande générale", en: "General request" },
  { id: "INFORMATION", fr: "Information", en: "Information" },
  { id: "DOCUMENT", fr: "Document", en: "Document" },
  { id: "VALIDATION", fr: "Validation", en: "Approval / validation" },
  { id: "SUPPORT", fr: "Support", en: "Support" },
  { id: "ACTION", fr: "Action à réaliser", en: "Action" },
  { id: "MEETING", fr: "Réunion", en: "Meeting" },
  { id: "FOLLOW_UP", fr: "Suivi", en: "Follow-up" },
  { id: "OTHER", fr: "Autre", en: "Other" },
] as const;

const LEGAL_LINK_ENTITY_TYPE_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "PROJECT", fr: "Projet", en: "Project" },
  { id: "SUPPLIER", fr: "Fournisseur", en: "Supplier" },
  { id: "CLIENT", fr: "Client", en: "Customer" },
  { id: "EMPLOYEE", fr: "Collaborateur", en: "Employee" },
  { id: "CONTRACT", fr: "Contrat", en: "Contract" },
  { id: "OPERATION", fr: "Opération", en: "Operation" },
  { id: "FINANCE", fr: "Finance", en: "Finance" },
  { id: "TECHNICAL", fr: "Élément technique", en: "Technical item" },
  { id: "SENSITIVE_DATA", fr: "Données sensibles", en: "Sensitive data" },
  { id: "MEDICAL_DATA", fr: "Données médicales", en: "Medical data" },
  { id: "OTHER", fr: "Autre", en: "Other" },
] as const;

const PHARMACY_TYPE_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "OFFICINE", fr: "Officine", en: "Community pharmacy" },
  { id: "CLINIC_INTERNAL", fr: "Pharmacie interne clinique", en: "Clinic internal pharmacy" },
  { id: "HOSPITAL", fr: "Pharmacie hospitalière", en: "Hospital pharmacy" },
  { id: "DEPOT", fr: "Dépôt pharmaceutique", en: "Pharmaceutical depot" },
  { id: "WHOLESALE", fr: "Grossiste / distribution", en: "Wholesale / distribution" },
  { id: "MOBILE", fr: "Pharmacie mobile", en: "Mobile pharmacy" },
  { id: "OTHER", fr: "Autre", en: "Other" },
] as const;

// Le domaine Actifs ne définit actuellement qu'un type métier explicite : DAMAGE.
// Les anciennes valeurs libres restent lisibles grâce à ReferenceSelect, sans inventer de nouvelle taxonomie.
const ASSET_INCIDENT_TYPE_OPTIONS: readonly LocalizedReferenceChoice[] = [
  { id: "DAMAGE", fr: "Dommage matériel", en: "Asset damage" },
] as const;

const CONTROLLED_REFERENCE_FIELDS: Readonly<Record<string, ControlledReferenceKind>> = {
  currency: "currency",
  currencyCode: "currency",
  unit: "unit",
  unitCode: "unit",
  paymentMethod: "paymentMethod",
  requestType: "requestType",
  linkedEntityType: "linkedEntityType",
  pharmacyType: "pharmacyType",
  incidentType: "assetIncidentType",
};

const GENERIC_FIELD_HELP = {
  fr: {
    currency: "Choisissez la devise utilisée pour enregistrer et afficher les montants. La sélection évite les codes monétaires invalides ou incohérents.",
    unit: "Choisissez l’unité standard correspondant à la quantité. Cela évite les variantes manuelles pour une même unité.",
    status: "Choisissez l’état métier correspondant à la situation actuelle de cet élément.",
    priority: "Choisissez le niveau de priorité qui reflète l’urgence réelle et l’ordre de traitement attendu.",
    type: "Choisissez le type métier correspondant afin de garder des données homogènes et filtrables.",
    category: "Choisissez une catégorie existante lorsqu’un référentiel est proposé ; n’utilisez du texte libre que pour une catégorie réellement personnalisable.",
    paymentMethod: "Choisissez le mode de paiement réellement utilisé afin de fiabiliser le rapprochement et le suivi financier.",
    requestType: "Choisissez le type de demande afin de conserver des demandes homogènes et filtrables.",
    linkedEntityType: "Choisissez la nature de l’élément métier lié ; la référence associée reste l’identifiant de cet élément.",
    pharmacyType: "Choisissez le type d’établissement pharmaceutique déjà supporté par les paramètres Pharmacie.",
    incidentType: "Choisissez un type d’incident d’actif supporté. Les anciennes valeurs restent affichables sans devenir de nouveaux choix.",
  },
  en: {
    currency: "Choose the currency used to record and display amounts. A controlled choice prevents invalid or inconsistent currency codes.",
    unit: "Choose the standard unit matching the quantity. This prevents manual variants for the same unit.",
    status: "Choose the business status that matches the item’s current situation.",
    priority: "Choose the priority level that reflects the real urgency and expected processing order.",
    type: "Choose the matching business type so records remain consistent and filterable.",
    category: "Choose an existing category when a reference list is available; use free text only when the category is genuinely customizable.",
    paymentMethod: "Choose the payment method actually used so reconciliation and financial tracking remain reliable.",
    requestType: "Choose the request type so requests remain consistent and filterable.",
    linkedEntityType: "Choose the business entity kind being linked; the associated reference remains that entity's identifier.",
    pharmacyType: "Choose a pharmacy establishment type already supported by Pharmacy settings.",
    incidentType: "Choose a supported asset incident type. Historical values remain readable without becoming new choices.",
  },
} as const;

const PROFESSIONAL_FIELD_HELP: Record<"fr" | "en", Record<string, string>> = {
  fr: {
    employeeId: "Sélectionnez un dossier collaborateur RH actif. Le poste, le département et le site peuvent être repris automatiquement depuis ce dossier.",
    organizationMemberId: "La liaison à un membre DTSC est facultative : le dossier RH reste la source de vérité de l’emploi.",
    contractType: "Choisissez la nature juridique ou opérationnelle du contrat. Cette valeur est contrôlée et ne doit pas être remplacée par un intitulé libre.",
    jobTitle: "Choisissez le poste officiel du référentiel RH de l’entreprise. Le poste sélectionné doit rester cohérent avec le département.",
    positionId: "Choisissez le poste officiel du référentiel RH de l’entreprise.",
    departmentId: "Choisissez le département de rattachement. Lorsqu’un poste impose un département, la cohérence est vérifiée côté serveur.",
    siteId: "Choisissez le site d’affectation réel. Pour les présences, son fuseau horaire devient la référence métier.",
    managerEmployeeId: "Choisissez un responsable hiérarchique parmi les dossiers RH actifs de la même entreprise.",
    approverUserId: "Choisissez une autre personne active disposant du droit d’approuver ce module. L’auto-validation RH, Temps et Paie est interdite.",
    startDate: "Indiquez la date de début réelle. Elle doit être cohérente avec toute date de fin ou de période d’essai.",
    endDate: "Laissez vide si la période n’a pas de fin prévue ; sinon la date doit être postérieure ou égale au début.",
    probationEndDate: "Indiquez la fin de période d’essai uniquement si elle existe et reste comprise dans la durée du contrat.",
    baseCompensation: "Saisissez la rémunération contractuelle de base. La paie utilisera le contrat actif comme autorité, sans la recalculer depuis les présences.",
    compensationCurrency: "Choisissez la devise contractuelle. Une paie utilisant une autre devise sera refusée.",
    payFrequency: "Choisissez la fréquence contractuelle de rémunération.",
    standardHoursPerWeek: "Indiquez le volume hebdomadaire contractuel attendu. Il ne constitue pas une preuve de temps réellement travaillé.",
    timezone: "Utilisez le fuseau du site de travail. Les heures de présence sont converties côté serveur à partir de cette référence.",
    effectiveFrom: "Date à partir de laquelle cet horaire planifié devient applicable.",
    effectiveUntil: "Date facultative de fin d’application. Clôturer un horaire conserve son historique.",
    attendanceDate: "Date locale du site correspondant à l’observation de présence.",
    observedStart: "Heure locale réellement observée sur le site ; elle ne crée pas automatiquement une feuille de temps.",
    observedEnd: "Heure locale réellement observée sur le site ; elle ne crée pas automatiquement une feuille de temps.",
    leaveType: "Choisissez le type de congé correspondant à la demande réelle.",
    periodStart: "Début de la période couverte par cette opération.",
    periodEnd: "Fin de la période couverte ; elle doit être postérieure ou égale au début.",
    workDate: "Date de l’activité réellement déclarée dans la feuille de temps.",
    projectId: "Rattachez le temps à un projet uniquement lorsque l’activité appartient réellement à ce projet.",
    taskId: "Rattachez l’activité à une tâche existante lorsque cela améliore la traçabilité.",
    serviceDescription: "Décrivez brièvement l’activité réellement effectuée afin que le validateur puisse la contrôler.",
    payrollPeriodId: "Choisissez une période de paie ouverte et non déjà utilisée par un traitement actif.",
    payDate: "Date de paiement prévue. Elle ne signifie pas que la paie est effectivement payée.",
  },
  en: {
    employeeId: "Select an active HR employee record. Position, department and site can then be prefilled from that record.",
    organizationMemberId: "Linking a DTSC member is optional: the HR record remains the employment source of truth.",
    contractType: "Choose the legal or operational contract nature. This is a controlled value and must not be replaced by free text.",
    jobTitle: "Choose an official position from the organization HR reference. The selected position must remain consistent with its department.",
    positionId: "Choose an official position from the organization HR reference.",
    departmentId: "Choose the owning department. When a position implies a department, server-side validation enforces consistency.",
    siteId: "Choose the actual assignment site. For attendance, its timezone becomes the business reference.",
    managerEmployeeId: "Choose a manager among active HR records in the same organization.",
    approverUserId: "Choose another active person who can approve this module. Self-approval is forbidden for HR, Time and Payroll.",
    startDate: "Enter the actual start date. It must be consistent with any end or probation date.",
    endDate: "Leave empty when there is no planned end; otherwise it must be on or after the start date.",
    probationEndDate: "Only enter a probation end when applicable and keep it within the contract period.",
    baseCompensation: "Enter contractual base compensation. Payroll uses the active contract as authority and does not recalculate it from attendance.",
    compensationCurrency: "Choose the contractual currency. Payroll in another currency will be rejected.",
    payFrequency: "Choose the contractual pay frequency.",
    standardHoursPerWeek: "Enter contractual weekly expected hours. They are not evidence of actual worked time.",
    timezone: "Use the work site's timezone. Attendance times are converted server-side using this reference.",
    effectiveFrom: "Date from which this planned schedule becomes effective.",
    effectiveUntil: "Optional end date. Ending a schedule preserves its history.",
    attendanceDate: "Site-local date corresponding to the attendance observation.",
    observedStart: "Actual local arrival time observed at the site; it does not automatically create a timesheet.",
    observedEnd: "Actual local departure time observed at the site; it does not automatically create a timesheet.",
    leaveType: "Choose the leave category matching the actual request.",
    periodStart: "Start of the period covered by this operation.",
    periodEnd: "End of the covered period; it must be on or after the start.",
    workDate: "Date of the activity actually declared in the timesheet.",
    projectId: "Link time to a project only when the activity genuinely belongs to that project.",
    taskId: "Link the activity to an existing task when it improves traceability.",
    serviceDescription: "Briefly describe the actual activity so the approver can review it.",
    payrollPeriodId: "Choose an open payroll period that is not already used by an active run.",
    payDate: "Planned payment date. It does not mean payroll has actually been paid.",
  },
};

function isEnglish(locale: string | null | undefined) {
  return String(locale || "fr").toLowerCase().startsWith("en");
}

function localize(options: readonly LocalizedReferenceChoice[], locale: string | null | undefined): ReferenceChoice[] {
  const english = isEnglish(locale);
  return options.map((item) => ({ id: item.id, label: english ? item.en : item.fr }));
}

export function currencyChoices(locale?: string | null): ReferenceChoice[] {
  return localize(CURRENCY_OPTIONS, locale);
}

export function unitChoices(locale?: string | null): ReferenceChoice[] {
  return localize(UNIT_OPTIONS, locale);
}

export function paymentMethodChoices(locale?: string | null): ReferenceChoice[] {
  return localize(PAYMENT_METHOD_OPTIONS, locale);
}

export function controlledReferenceKind(fieldName: string | null | undefined): ControlledReferenceKind | null {
  if (!fieldName) return null;
  return CONTROLLED_REFERENCE_FIELDS[fieldName] || null;
}

export function controlledReferenceChoices(kind: ControlledReferenceKind, locale?: string | null): ReferenceChoice[] {
  if (kind === "currency") return currencyChoices(locale);
  if (kind === "unit") return unitChoices(locale);
  if (kind === "paymentMethod") return paymentMethodChoices(locale);
  if (kind === "requestType") return localize(REQUEST_TYPE_OPTIONS, locale);
  if (kind === "linkedEntityType") return localize(LEGAL_LINK_ENTITY_TYPE_OPTIONS, locale);
  if (kind === "pharmacyType") return localize(PHARMACY_TYPE_OPTIONS, locale);
  return localize(ASSET_INCIDENT_TYPE_OPTIONS, locale);
}

export function referenceChoiceLabel(kind: ControlledReferenceKind, value: string | null | undefined, locale?: string | null): string {
  if (!value) return "";
  return controlledReferenceChoices(kind, locale).find((item) => item.id === value)?.label || value;
}

export function referenceFieldHelp(fieldName: string | null | undefined, locale?: string | null): string | undefined {
  if (!fieldName) return undefined;
  const language = isEnglish(locale) ? "en" : "fr";
  if (PROFESSIONAL_FIELD_HELP[language][fieldName]) return PROFESSIONAL_FIELD_HELP[language][fieldName];
  if (/^(bonusReason_|deductionReason_)/.test(fieldName)) {
    return language === "en" ? "A non-zero payroll adjustment requires a precise business reason." : "Toute variable de paie non nulle exige un motif métier précis.";
  }
  if (/^(bonus_|deduction_)/.test(fieldName)) {
    return language === "en" ? "Enter only the explicit adjustment amount for this employee; zero means no adjustment." : "Saisissez uniquement le montant explicite de la variable pour ce collaborateur ; zéro signifie aucune variable.";
  }
  const normalized = fieldName === "currencyCode" ? "currency" : fieldName === "unitCode" ? "unit" : fieldName;
  return GENERIC_FIELD_HELP[language][normalized as keyof typeof GENERIC_FIELD_HELP.fr];
}

export const controlledReferenceFieldNames = Object.freeze(Object.keys(CONTROLLED_REFERENCE_FIELDS));