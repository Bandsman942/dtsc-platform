/**
 * Form fields used by self-service enterprise activity *requests*.
 * They never mutate a Gaming, Finance or CRM business object directly.
 * The server validates every selected reference in the same organization.
 */
export type BusinessActivityField = {
  name: string;
  label: string;
  labelEn: string;
  placeholder: string;
  placeholderEn: string;
  type?: "text" | "textarea" | "number" | "date" | "select";
  source?: "gamingStations" | "gamingBookings" | "gamingSessions" | "gamingCloses" | "businessParties";
  options?: string[];
  required?: boolean;
};
type FieldArgs = Omit<BusinessActivityField, "labelEn" | "placeholderEn"> &
  Pick<BusinessActivityField, "labelEn" | "placeholderEn">;
const f = (field: FieldArgs): BusinessActivityField => field;
const priority = f({name:"severity",label:"Criticité",labelEn:"Severity",placeholder:"Choisissez la criticité",placeholderEn:"Choose severity",type:"select",options:["LOW","MEDIUM","HIGH","CRITICAL"],required:true});
const station = f({name:"gamingStationId",label:"Poste de jeu",labelEn:"Gaming station",placeholder:"Sélectionnez un poste existant",placeholderEn:"Select an existing station",source:"gamingStations"});
const booking = f({name:"gamingBookingId",label:"Réservation existante",labelEn:"Existing booking",placeholder:"Choisissez une réservation",placeholderEn:"Select a booking",source:"gamingBookings"});
const session = f({name:"gamingSessionId",label:"Session de jeu existante",labelEn:"Existing gaming session",placeholder:"Choisissez une session",placeholderEn:"Select a session",source:"gamingSessions"});
const closing = f({name:"gamingCloseId",label:"Clôture Gaming existante",labelEn:"Existing gaming daily close",placeholder:"Sélectionnez une clôture",placeholderEn:"Select a daily close",source:"gamingCloses"});
const party = f({name:"businessPartyId",label:"Client CRM",labelEn:"CRM customer",placeholder:"Choisissez un client existant",placeholderEn:"Select an existing customer",source:"businessParties"});
const period = f({name:"period",label:"Période concernée",labelEn:"Reporting period",placeholder:"Jour, semaine ou mois",placeholderEn:"Day, week or month",required:true});
const observed = f({name:"observations",label:"Constats",labelEn:"Findings",placeholder:"Décrivez les faits observés",placeholderEn:"Describe your findings",type:"textarea",required:true});
const issue = f({name:"incidentDescription",label:"Incident constaté",labelEn:"Incident description",placeholder:"Décrivez le problème",placeholderEn:"Describe the issue",type:"textarea",required:true});
const requested = f({name:"expectedAction",label:"Action attendue",labelEn:"Requested action",placeholder:"Précisez le résultat attendu",placeholderEn:"Explain the desired outcome",type:"textarea",required:true});
const quantity = f({name:"quantity",label:"Quantité",labelEn:"Quantity",placeholder:"Quantité demandée",placeholderEn:"Requested quantity",type:"number",required:true});
const date = f({name:"occurredOn",label:"Date de l'événement",labelEn:"Event date",placeholder:"Date réelle",placeholderEn:"Actual date",type:"date"});
const recommendations = f({name:"recommendations",label:"Actions proposées",labelEn:"Suggested actions",placeholder:"Prochaines actions",placeholderEn:"Next actions",type:"textarea"});
const common: Record<string, BusinessActivityField[]> = {
  SUBMIT_SECTOR_REPORT: [period, observed, recommendations],
  REPORT_SECTOR_INCIDENT: [date, priority, issue, requested],
  REQUEST_OPERATION_VALIDATION: [f({name:"operationType",label:"Opération à valider",labelEn:"Operation to approve",placeholder:"Décrivez l'opération",placeholderEn:"Describe the operation",required:true}), requested],
  REQUEST_RESOURCE: [f({name:"resourceType",label:"Ressource demandée",labelEn:"Requested resource",placeholder:"Matériel, personnel, service...",placeholderEn:"Equipment, staff, service...",required:true}),quantity,requested],
  UPDATE_SECTOR_INDICATOR: [period,f({name:"indicatorName",label:"Indicateur concerné",labelEn:"Indicator",placeholder:"Nom de l'indicateur",placeholderEn:"Indicator name",required:true}),f({name:"proposedValue",label:"Valeur proposée",labelEn:"Suggested value",placeholder:"Valeur et unité",placeholderEn:"Value and unit",required:true}),requested],
};
const hospitality: Record<string, BusinessActivityField[]> = {
  CONFIRM_BOOKING: [f({name:"bookingReference",label:"Référence réservation",labelEn:"Booking reference",placeholder:"Référence connue",placeholderEn:"Known reference",required:true}),requested],
  REPORT_CUSTOMER_INCIDENT: [date,priority,issue,requested],
  REQUEST_KITCHEN_STOCK: [f({name:"resourceType",label:"Produit cuisine",labelEn:"Kitchen item",placeholder:"Désignation du produit",placeholderEn:"Item name",required:true}),quantity,requested],
  SUBMIT_CASH_REPORT: [period,f({name:"reportedAmount",label:"Montant déclaré",labelEn:"Declared amount",placeholder:"Montant (sans modifier la caisse)",placeholderEn:"Amount (does not modify cash balance)",type:"number",required:true}),observed],
  REQUEST_EXTRA_STAFF: [period,f({name:"positionRequested",label:"Poste demandé",labelEn:"Required position",placeholder:"Fonction recherchée",placeholderEn:"Required role",required:true}),quantity,requested],
  REPORT_ROOM_SERVICE_PROBLEM: [date,priority,issue,requested],
};
const gaming: Record<string, BusinessActivityField[]> = {
  SUBMIT_SECTOR_REPORT: [period,station,session,observed,recommendations],
  REPORT_SECTOR_INCIDENT: [station,session,date,priority,issue,requested],
  REQUEST_OPERATION_VALIDATION: [session,station,requested],
  REQUEST_RESOURCE: [station,f({name:"resourceType",label:"Ressource pour le poste",labelEn:"Station resource",placeholder:"Console, manette, écran, maintenance...",placeholderEn:"Console, controller, display, maintenance...",required:true}),quantity,requested],
  UPDATE_SECTOR_INDICATOR: [period,f({name:"indicatorName",label:"Indicateur Gaming",labelEn:"Gaming indicator",placeholder:"Sessions, occupation, disponibilité...",placeholderEn:"Sessions, occupancy, availability...",required:true}),f({name:"proposedValue",label:"Valeur proposée",labelEn:"Suggested value",placeholder:"Valeur et unité",placeholderEn:"Value and unit",required:true}),requested],
  CONFIRM_BOOKING: [booking,station,requested],
  REPORT_CUSTOMER_INCIDENT: [party,booking,station,date,priority,issue],
  SUBMIT_CASH_REPORT: [period,closing,observed,recommendations],
  REPORT_ROOM_SERVICE_PROBLEM: [station,priority,issue,requested],
  REQUEST_EXTRA_STAFF: [period,f({name:"positionRequested",label:"Profil de renfort",labelEn:"Staff role",placeholder:"Animateur Gaming, accueil...",placeholderEn:"Gaming attendant, reception...",required:true}),quantity,requested],
};
/** Request forms for business sectors. Health and Pharmacy retain dedicated domain forms. */
export function getBusinessActivityFields(sectorCode: string | null | undefined, subtypeCode: string | null | undefined, blockCode: string): BusinessActivityField[] {
  if (sectorCode === "HEALTH_CARE" || sectorCode === "PHARMACY") return [];
  if (sectorCode === "HOSPITALITY_EVENTS" && subtypeCode === "GAMING_LOUNGE" && gaming[blockCode]) return gaming[blockCode];
  if (sectorCode === "HOSPITALITY_EVENTS" && hospitality[blockCode]) return hospitality[blockCode];
  if (common[blockCode]) return common[blockCode];
  // No invented business CRUD: other sector activities remain requests, but their
  // fields describe the distinct business intent rather than a fictitious validation.
  if (blockCode.startsWith("REPORT_") || blockCode.startsWith("DECLARE_")) return [date, priority, issue, recommendations];
  if (blockCode.startsWith("SUBMIT_") || blockCode.startsWith("SEND_")) return [period, observed, recommendations];
  if (blockCode.startsWith("REQUEST_")) return [requested];
  if (blockCode.startsWith("CONFIRM_")) return [requested];
  if (blockCode.startsWith("UPDATE_")) return [period, observed];
  return [observed];
}
export const GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS = new Set(["REQUEST_KITCHEN_STOCK"]);
