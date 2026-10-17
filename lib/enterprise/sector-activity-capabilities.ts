/** #876 — explicit legacy sector activity capabilities.
 *
 * Historical SectorTemplateActivityBlock codes are identifiers, not commands.
 * REQUEST means only EnterpriseActivityRequest + canonical EnterpriseRequest.
 * UNAVAILABLE must NEVER send a request, mutate an ERP object or pretend to
 * upload documents. No runtime dispatch from a DB module code is permitted.
 * Health/Pharmacy/Gaming dedicated paths remain with their existing owners.
 */
import type { BusinessActivityField } from "@/lib/enterprise/enterprise-activity-form-contract";

export type SectorActivityCapability = {
  mode: "REQUEST" | "UNAVAILABLE";
  fields: BusinessActivityField[];
  reasonFr?: string;
  reasonEn?: string;
};
const F: Record<string, BusinessActivityField> = {
  reference: { name: "reference", label: "Référence communiquée (non liée automatiquement)", labelEn: "Supplied reference (not automatically linked)", placeholder: "Référence ou numéro indiqué sur le dossier", placeholderEn: "Reference or number shown on the case", type: "text", required: true },
  caseRef: { name: "caseReference", label: "Référence du dossier", labelEn: "Case reference", placeholder: "Identifiant communiqué par le service responsable", placeholderEn: "Reference provided by the relevant service", type: "text", required: true },
  claimRef: { name: "claimReference", label: "Référence sinistre", labelEn: "Claim reference", placeholder: "Numéro du sinistre concerné", placeholderEn: "Claim number", type: "text", required: true },
  coverageRef: { name: "coverageReference", label: "Référence prise en charge", labelEn: "Coverage reference", placeholder: "Numéro de demande ou d'assurance communiqué", placeholderEn: "Supplied insurance or authorization reference", type: "text", required: true },
  provider: { name: "providerName", label: "Prestataire concerné", labelEn: "Provider", placeholder: "Nom du prestataire, sans données personnelles médicales", placeholderEn: "Provider name, without private medical data", type: "text", required: true },
  period: { name: "period", label: "Période concernée", labelEn: "Period", placeholder: "Date ou période du rapport", placeholderEn: "Reporting date or period", type: "text", required: true },
  eventDate: { name: "eventDate", label: "Date du fait", labelEn: "Event date", placeholder: "Date du constat", placeholderEn: "Date of observation", type: "date", required: true },
  severity: { name: "severity", label: "Criticité", labelEn: "Severity", placeholder: "Niveau de gravité", placeholderEn: "Severity level", type: "select", options: ["LOW","MEDIUM","HIGH","CRITICAL"], required: true },
  incident: { name: "incidentDetails", label: "Description de l'incident", labelEn: "Incident details", placeholder: "Faits vérifiés et impact observé", placeholderEn: "Observed facts and impact", type: "textarea", required: true },
  action: { name: "requestedAction", label: "Suite demandée", labelEn: "Requested follow-up", placeholder: "Action souhaitée par le destinataire", placeholderEn: "Follow-up requested from the recipient", type: "textarea", required: true },
  observations: { name: "observations", label: "Constats détaillés", labelEn: "Findings", placeholder: "Informations factuelles", placeholderEn: "Factual observations", type: "textarea", required: true },
  reason: { name: "reason", label: "Motif de la demande", labelEn: "Reason", placeholder: "Justification et contexte", placeholderEn: "Reason and context", type: "textarea", required: true },
  resource: { name: "resourceName", label: "Ressource concernée", labelEn: "Resource", placeholder: "Désignation exacte de la ressource", placeholderEn: "Exact resource name", type: "text", required: true },
  quantity: { name: "quantity", label: "Quantité demandée", labelEn: "Requested quantity", placeholder: "Nombre supérieur à zéro", placeholderEn: "Number greater than zero", type: "number", required: true },
  reportedQty: { name: "reportedQuantity", label: "Quantité constatée", labelEn: "Observed quantity", placeholder: "Quantité relevée, sans modifier le stock", placeholderEn: "Observed quantity; does not modify inventory", type: "number", required: true },
  customerRef: { name: "customerReference", label: "Référence client communiquée", labelEn: "Supplied customer reference", placeholder: "Référence fournie par le client, sans liaison CRM automatique", placeholderEn: "Reference supplied by customer; no automatic CRM linkage", type: "text", required: true },
  studentRef: { name: "studentReference", label: "Référence élève ou classe", labelEn: "Student or class reference", placeholder: "Code utilisé dans l'établissement, sans dossier scolaire lié", placeholderEn: "School code; no direct academic record link", type: "text", required: true },
  classRef: { name: "classReference", label: "Classe concernée", labelEn: "Class", placeholder: "Classe / promotion concernée", placeholderEn: "Affected class or grade", type: "text", required: true },
  meetingDate: { name: "meetingDate", label: "Date proposée", labelEn: "Suggested date", placeholder: "Date envisagée, non réservée automatiquement", placeholderEn: "Suggested date; not scheduled automatically", type: "date", required: true },
  team: { name: "teamName", label: "Équipe / service", labelEn: "Team / department", placeholder: "Équipe ou service concerné", placeholderEn: "Affected team or department", type: "text", required: true },
  projectRef: { name: "projectReference", label: "Référence projet", labelEn: "Project reference", placeholder: "Projet communiqué, sans liaison automatique", placeholderEn: "Supplied project reference; no automatic link", type: "text", required: true },
  missionRef: { name: "missionReference", label: "Référence mission", labelEn: "Mission reference", placeholder: "Numéro de mission communiqué", placeholderEn: "Supplied mission reference", type: "text", required: true },
  contractRef: { name: "contractReference", label: "Référence contrat", labelEn: "Contract reference", placeholder: "Référence du contrat existant", placeholderEn: "Reference for an existing contract", type: "text", required: true },
  deliveryRef: { name: "deliveryReference", label: "Référence livraison", labelEn: "Delivery reference", placeholder: "Numéro de la livraison concernée", placeholderEn: "Reference of affected delivery", type: "text", required: true },
  vehicleRef: { name: "vehicleReference", label: "Véhicule / immatriculation", labelEn: "Vehicle / registration", placeholder: "Référence du véhicule sans modification de flotte", placeholderEn: "Vehicle reference; does not update fleet", type: "text", required: true },
  location: { name: "location", label: "Lieu concerné", labelEn: "Location", placeholder: "Site, chantier, agence ou localité", placeholderEn: "Site, jobsite, branch or locality", type: "text", required: true },
  machineRef: { name: "machineReference", label: "Référence équipement", labelEn: "Equipment reference", placeholder: "Code machine ou équipement, non lié automatiquement", placeholderEn: "Machine or asset code; not automatically linked", type: "text", required: true },
  productRef: { name: "productReference", label: "Référence article", labelEn: "Product reference", placeholder: "Code ou désignation de l'article", placeholderEn: "Product code or description", type: "text", required: true },
  batchRef: { name: "batchReference", label: "Lot de production", labelEn: "Production batch", placeholder: "Identifiant du lot communiqué", placeholderEn: "Supplied batch identifier", type: "text", required: true },
  budgetRef: { name: "budgetReference", label: "Référence ligne budgétaire", labelEn: "Budget line reference", placeholder: "Référence budgétaire communiquée, sans mouvement financier", placeholderEn: "Budget line supplied; no financial movement", type: "text", required: true },
  amount: { name: "requestedAmount", label: "Montant proposé", labelEn: "Proposed amount", placeholder: "Montant indicatif, sans mouvement financier", placeholderEn: "Indicative amount, no financial transaction", type: "number", required: true },
  reportedAmount: { name: "reportedAmount", label: "Montant déclaré", labelEn: "Reported amount", placeholder: "Valeur informative, ne modifie pas la caisse", placeholderEn: "Informational amount; does not change cash balance", type: "number", required: true },
  currency: { name: "currencyCode", label: "Devise indiquée", labelEn: "Indicated currency", placeholder: "Devise du montant communiqué", placeholderEn: "Currency of the supplied amount", type: "text", required: true },
  salesRef: { name: "salesReference", label: "Référence vente", labelEn: "Sales reference", placeholder: "Référence communiquée, sans encaissement", placeholderEn: "Supplied reference, no payment recorded", type: "text", required: true },
  discount: { name: "discountPercent", label: "Remise proposée (%)", labelEn: "Proposed discount (%)", placeholder: "Pourcentage demandé, sans modifier les prix", placeholderEn: "Proposed percentage, does not update pricing", type: "number", required: true },
  urgency: { name: "urgency", label: "Urgence", labelEn: "Urgency", placeholder: "Niveau de priorité demandé", placeholderEn: "Requested priority", type: "select", options: ["LOW","MEDIUM","HIGH","CRITICAL"], required: true },
  indicator: { name: "indicatorName", label: "Indicateur", labelEn: "Indicator", placeholder: "Nom de l'indicateur concerné", placeholderEn: "Affected indicator name", type: "text", required: true },
  proposedValue: { name: "proposedValue", label: "Valeur proposée", labelEn: "Proposed value", placeholder: "Valeur et unité, sans mise à jour automatique", placeholderEn: "Value and unit; no automatic update", type: "text", required: true },
  quality: { name: "qualityProblem", label: "Problème de qualité", labelEn: "Quality issue", placeholder: "Écart, symptômes et impact", placeholderEn: "Defect, symptoms and impact", type: "textarea", required: true },
  deadline: { name: "requestedDeadline", label: "Échéance souhaitée", labelEn: "Requested deadline", placeholder: "Date demandée, pas une programmation automatique", placeholderEn: "Requested date; not scheduled automatically", type: "date", required: true },
  route: { name: "routeDescription", label: "Trajet ou itinéraire", labelEn: "Route / itinerary", placeholder: "Origine et destination concernées", placeholderEn: "Origin and destination", type: "text", required: true },
  supportTicket: { name: "ticketReference", label: "Référence ticket", labelEn: "Ticket reference", placeholder: "Référence existante si disponible", placeholderEn: "Existing ticket reference, when available", type: "text", required: false },
  environment: { name: "environmentName", label: "Environnement concerné", labelEn: "Affected environment", placeholder: "Application ou environnement concerné", placeholderEn: "Affected app or environment", type: "text", required: true },
  reproduce: { name: "reproductionSteps", label: "Étapes pour reproduire", labelEn: "Reproduction steps", placeholder: "Étapes concrètes et résultat obtenu", placeholderEn: "Specific steps and observed result", type: "textarea", required: true },
  proposedSlot: { name: "proposedSlot", label: "Créneau souhaité", labelEn: "Preferred slot", placeholder: "Créneau de rencontre proposé, non confirmé", placeholderEn: "Proposed meeting time; not booked", type: "text", required: true },
  decisionRef: { name: "decisionReference", label: "Référence décision", labelEn: "Decision reference", placeholder: "Référence de décision ou demande", placeholderEn: "Decision or request reference", type: "text", required: true },
  beneficiary: { name: "beneficiaryGroup", label: "Groupe concerné", labelEn: "Affected group", placeholder: "Équipe, bénéficiaires ou population concernés", placeholderEn: "Affected team, beneficiaries or population", type: "text", required: true },
};

const CAPABILITIES: Record<string, Record<string, SectorActivityCapability>> = {
  INSURANCE: {
    SUBMIT_CLAIM_FILE: { mode: "UNAVAILABLE", fields: [], reasonFr: "Le dépôt d'un dossier sinistre nécessite un module documentaire sécurisé et un rattachement vérifié.", reasonEn: "Claim files require secure documents and validated case linking." },
    REQUEST_COVERAGE_VALIDATION: { mode: "REQUEST", fields: [F.coverageRef, F.provider, F.reason, F.action] },
    REPORT_INCOMPLETE_FILE: { mode: "REQUEST", fields: [F.claimRef, F.observations, F.action] },
    REQUEST_CLAIM_AUDIT: { mode: "REQUEST", fields: [F.claimRef, F.reason, F.action] },
    ANSWER_COMPLIANCE_REQUEST: { mode: "REQUEST", fields: [F.caseRef, F.reference, F.observations] },
    SUBMIT_PROVIDER_REPORT: { mode: "REQUEST", fields: [F.provider, F.period, F.observations] },
  },
  EDUCATION: {
    REPORT_ABSENCE: { mode: "REQUEST", fields: [F.studentRef, F.classRef, F.eventDate, F.reason] },
    SUBMIT_CLASS_REPORT: { mode: "REQUEST", fields: [F.classRef, F.period, F.observations] },
    ENTER_GRADES: { mode: "UNAVAILABLE", fields: [], reasonFr: "La saisie des notes doit enregistrer des résultats académiques dans le module sécurisé de notes.", reasonEn: "Grade entry must write to the authorized academic grading module." },
    REQUEST_PARENT_MEETING: { mode: "REQUEST", fields: [F.studentRef, F.meetingDate, F.proposedSlot, F.reason] },
    REPORT_DISCIPLINE_INCIDENT: { mode: "REQUEST", fields: [F.studentRef, F.eventDate, F.severity, F.incident, F.action] },
    REQUEST_ACADEMIC_VALIDATION: { mode: "REQUEST", fields: [F.classRef, F.reference, F.reason, F.action] },
  },
  COMMERCE_RETAIL: {
    REPORT_STOCKOUT: { mode: "REQUEST", fields: [F.productRef, F.reportedQty, F.urgency, F.action] },
    REQUEST_REPLENISHMENT: { mode: "REQUEST", fields: [F.productRef, F.quantity, F.deadline, F.reason] },
    SUBMIT_SALES_REPORT: { mode: "REQUEST", fields: [F.period, F.reportedAmount, F.currency, F.observations] },
    SUBMIT_CASH_REPORT: { mode: "REQUEST", fields: [F.period, F.reportedAmount, F.currency, F.observations] },
    REPORT_CUSTOMER_ANOMALY: { mode: "REQUEST", fields: [F.customerRef, F.eventDate, F.incident, F.action] },
    REQUEST_DISCOUNT_VALIDATION: { mode: "REQUEST", fields: [F.salesRef, F.discount, F.reason, F.action] },
  },
  PROFESSIONAL_SERVICES: {
    SUBMIT_DELIVERABLE: { mode: "UNAVAILABLE", fields: [], reasonFr: "Les livrables et fichiers doivent être envoyés via Documents et la validation canonique du projet.", reasonEn: "Deliverable files require canonical project and private-document handling." },
    SEND_MISSION_REPORT: { mode: "REQUEST", fields: [F.missionRef, F.period, F.observations, F.action] },
    REQUEST_CLIENT_VALIDATION: { mode: "REQUEST", fields: [F.customerRef, F.projectRef, F.reason, F.action] },
    REQUEST_CONTRACT_REVIEW: { mode: "REQUEST", fields: [F.contractRef, F.reason, F.deadline] },
    DECLARE_TIME_WORKED: { mode: "UNAVAILABLE", fields: [], reasonFr: "Le temps travaillé doit être enregistré et approuvé dans le module Temps, et non dans une demande libre.", reasonEn: "Worked time must use the canonical timesheet and approval workflow." },
    REPORT_MISSION_BLOCKER: { mode: "REQUEST", fields: [F.missionRef, F.severity, F.incident, F.action] },
  },
  NGO_ASBL: {
    SUBMIT_FIELD_REPORT: { mode: "REQUEST", fields: [F.projectRef, F.location, F.period, F.observations] },
    SUBMIT_SUPPORTING_DOCUMENT: { mode: "UNAVAILABLE", fields: [], reasonFr: "Les justificatifs exigent un téléversement privé lié au projet et à ses permissions Documents.", reasonEn: "Supporting evidence requires private project document upload and permissions." },
    REPORT_FIELD_INCIDENT: { mode: "REQUEST", fields: [F.projectRef, F.location, F.eventDate, F.incident, F.action] },
    REQUEST_ACTIVITY_VALIDATION: { mode: "REQUEST", fields: [F.projectRef, F.reference, F.reason, F.action] },
    UPDATE_INDICATOR: { mode: "REQUEST", fields: [F.projectRef, F.indicator, F.proposedValue, F.reason] },
    REQUEST_PROJECT_DISBURSEMENT: { mode: "REQUEST", fields: [F.projectRef, F.budgetRef, F.amount, F.currency, F.reason] },
  },
  TRANSPORT_LOGISTICS: {
    SUBMIT_MISSION_REPORT: { mode: "REQUEST", fields: [F.missionRef, F.vehicleRef, F.period, F.observations] },
    REPORT_BREAKDOWN: { mode: "REQUEST", fields: [F.vehicleRef, F.location, F.eventDate, F.severity, F.incident] },
    DECLARE_DELIVERY_INCIDENT: { mode: "REQUEST", fields: [F.deliveryRef, F.route, F.eventDate, F.incident, F.action] },
    REQUEST_FUEL: { mode: "REQUEST", fields: [F.vehicleRef, F.route, F.quantity, F.reason] },
    REQUEST_MAINTENANCE: { mode: "REQUEST", fields: [F.vehicleRef, F.severity, F.incident, F.deadline] },
    CONFIRM_DELIVERY: { mode: "UNAVAILABLE", fields: [], reasonFr: "La confirmation de livraison exige un bon canonique et sa transition de statut contrôlée.", reasonEn: "Delivery confirmation must use the canonical delivery record and state transition." },
  },
  CONSTRUCTION_REAL_ESTATE: {
    SUBMIT_SITE_REPORT: { mode: "REQUEST", fields: [F.projectRef, F.location, F.period, F.observations] },
    REPORT_SAFETY_INCIDENT: { mode: "REQUEST", fields: [F.location, F.eventDate, F.severity, F.incident, F.action] },
    REQUEST_MATERIALS: { mode: "REQUEST", fields: [F.projectRef, F.productRef, F.quantity, F.deadline, F.reason] },
    VALIDATE_PROGRESS: { mode: "UNAVAILABLE", fields: [], reasonFr: "La validation d'avancement nécessite les jalons et approbations du chantier, pas une simple demande.", reasonEn: "Progress approval needs project milestones and authorized state transitions." },
    SUBMIT_SITE_PHOTO: { mode: "UNAVAILABLE", fields: [], reasonFr: "Les photographies chantier nécessitent un téléversement privé et un lien au dossier technique.", reasonEn: "Jobsite photos require private upload linked to the technical document." },
    REPORT_SUBCONTRACTOR_DELAY: { mode: "REQUEST", fields: [F.projectRef, F.provider, F.deadline, F.incident, F.action] },
  },
  TECH_DIGITAL: {
    REPORT_BUG: { mode: "REQUEST", fields: [F.projectRef, F.environment, F.reproduce, F.severity, F.action] },
    REQUEST_TECH_ESTIMATE: { mode: "REQUEST", fields: [F.projectRef, F.reason, F.deadline, F.action] },
    SUBMIT_TICKET: { mode: "UNAVAILABLE", fields: [], reasonFr: "Un ticket doit être créé via le module Support/Tickets pour préserver numéro, suivi et SLA.", reasonEn: "Tickets must be created through the real Support/Tickets workflow." },
    REQUEST_CODE_REVIEW: { mode: "REQUEST", fields: [F.projectRef, F.reference, F.reason, F.deadline] },
    REPORT_PRODUCTION_INCIDENT: { mode: "REQUEST", fields: [F.environment, F.eventDate, F.severity, F.incident, F.action] },
    SUBMIT_RELEASE_NOTE: { mode: "REQUEST", fields: [F.projectRef, F.reference, F.observations, F.action] },
  },
  MANUFACTURING: {
    DECLARE_PRODUCTION: { mode: "UNAVAILABLE", fields: [], reasonFr: "La déclaration de production doit alimenter les ordres et quantités validées du module Production.", reasonEn: "Production quantities must be recorded against canonical production orders." },
    REPORT_MACHINE_FAILURE: { mode: "REQUEST", fields: [F.machineRef, F.eventDate, F.severity, F.incident, F.action] },
    REPORT_QUALITY_DEFECT: { mode: "REQUEST", fields: [F.batchRef, F.productRef, F.quality, F.action] },
    REQUEST_RAW_MATERIAL: { mode: "REQUEST", fields: [F.productRef, F.quantity, F.deadline, F.reason] },
    SUBMIT_WORKSHOP_REPORT: { mode: "REQUEST", fields: [F.team, F.period, F.observations, F.action] },
    REQUEST_MAINTENANCE: { mode: "REQUEST", fields: [F.machineRef, F.severity, F.incident, F.deadline] },
  },
  AGRI_FOOD: {
    REPORT_INPUT_NEED: { mode: "REQUEST", fields: [F.productRef, F.quantity, F.deadline, F.reason] },
    SUBMIT_FIELD_REPORT: { mode: "REQUEST", fields: [F.location, F.period, F.observations, F.action] },
    DECLARE_HARVEST: { mode: "UNAVAILABLE", fields: [], reasonFr: "Les quantités récoltées doivent être enregistrées dans le registre Récoltes canonique.", reasonEn: "Harvest quantities must be entered in the canonical harvest records." },
    REPORT_QUALITY_PROBLEM: { mode: "REQUEST", fields: [F.batchRef, F.quality, F.location, F.action] },
    REQUEST_PRODUCT_TRANSPORT: { mode: "REQUEST", fields: [F.productRef, F.quantity, F.route, F.deadline] },
    UPDATE_AGRI_STOCK: { mode: "UNAVAILABLE", fields: [], reasonFr: "Le stock agricole ne peut être modifié que par un mouvement de stock validé.", reasonEn: "Agricultural inventory must be updated through validated stock movements." },
  },
  FINANCE_MICROFINANCE: {
    SUBMIT_CREDIT_FILE: { mode: "UNAVAILABLE", fields: [], reasonFr: "Un dossier crédit contient des données sensibles et doit être enregistré dans son module sécurisé.", reasonEn: "Credit dossiers require a dedicated access-controlled credit-file module." },
    REQUEST_CREDIT_VALIDATION: { mode: "REQUEST", fields: [F.caseRef, F.amount, F.currency, F.reason] },
    REPORT_LATE_REPAYMENT: { mode: "REQUEST", fields: [F.caseRef, F.eventDate, F.reportedAmount, F.currency, F.observations] },
    SUBMIT_CASH_REPORT: { mode: "REQUEST", fields: [F.period, F.reportedAmount, F.currency, F.observations] },
    REQUEST_RISK_REVIEW: { mode: "REQUEST", fields: [F.caseRef, F.reason, F.action] },
    REPORT_KYC_ANOMALY: { mode: "REQUEST", fields: [F.caseRef, F.severity, F.incident, F.action] },
  },
  PUBLIC_ADMIN: {
    SUBMIT_CASE: { mode: "UNAVAILABLE", fields: [], reasonFr: "Le dépôt d'un dossier administratif officiel exige un registre avec pièces et numéro sécurisé.", reasonEn: "Official administrative cases need a numbered secure case register." },
    REQUEST_LETTER_VALIDATION: { mode: "REQUEST", fields: [F.reference, F.reason, F.deadline] },
    REPORT_INCOMPLETE_CASE: { mode: "REQUEST", fields: [F.caseRef, F.observations, F.action] },
    SUBMIT_SERVICE_REPORT: { mode: "REQUEST", fields: [F.team, F.period, F.observations, F.action] },
    REQUEST_ARCHIVING: { mode: "REQUEST", fields: [F.caseRef, F.reason, F.action] },
    ESCALATE_DECISION: { mode: "REQUEST", fields: [F.decisionRef, F.severity, F.reason, F.action] },
  },
};

/** Explicit null = unrecognized or unsupported, NEVER a plausible generic form. */
export function getSectorActivityCapability(sectorCode: string | null | undefined, blockCode: string): SectorActivityCapability | null {
  if (!sectorCode) return null;
  return CAPABILITIES[sectorCode]?.[blockCode] || null;
}
export const SECTOR_ACTIVITY_CAPABILITIES = CAPABILITIES;
