import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

const BUSINESS_ERROR_MESSAGES: Record<string, { fr: string; en: string }> = {
  INVENTORY_LOT_RECALLED:{fr:"Ce lot est rappelé. Sa remise en circulation ou sa recréation est interdite.",en:"This batch is recalled. It cannot be released or recreated."},
  INVENTORY_LOT_RECALL_FORBIDDEN:{fr:"Le rappel multisite exige le droit d’administration globale du stock.",en:"A multi-site recall requires company-wide stock administration."},
  INVENTORY_LOT_QUALITY_REASON_REQUIRED:{fr:"Renseignez le constat qualité ou le motif du changement de statut.",en:"Provide the quality findings or reason for the status change."},
  INVENTORY_LOT_RELEASE_FORBIDDEN:{fr:"La levée de quarantaine exige un autre administrateur du stock et des dates inchangées.",en:"Release requires another inventory administrator and unchanged dates."},
  INVENTORY_LOT_RELEASE_LOSS_PENDING:{fr:"Une demande de perte est en cours pour ce lot. Traitez-la avant toute remise en vente.",en:"A loss request is pending for this batch. Resolve it before release."},
  INVENTORY_LOT_DATES_LOCKED:{fr:"Les dates d’un lot déjà mouvementé sont verrouillées. Une correction documentée est nécessaire.",en:"Dates on a batch with movement history are locked. A documented correction is required."},
  INVENTORY_LOT_CONFLICT:{fr:"Le lot a changé ou une opération concurrente a été détectée. Actualisez avant de réessayer.",en:"The batch has changed or a concurrent operation occurred. Refresh and retry."},
  STOCK_LOSS_BATCH_REQUIRED: {fr:"Sélectionnez un article suivi et un lot identifié.",en:"Select a tracked item and identified batch."},
  STOCK_LOSS_NOT_EXPIRED: {fr:"Ce lot n’est pas encore périmé. Vérifiez le motif de perte.",en:"This batch has not expired. Check the loss reason."},
  STOCK_LOSS_ISOLATE_FIRST: {fr:"Bloquez ou mettez le lot en quarantaine avant de soumettre sa destruction.",en:"Block or quarantine the batch before submitting disposal."},
  STOCK_LOSS_INDEPENDENT_APPROVAL: {fr:"La destruction exige un validateur indépendant du demandeur.",en:"Disposal requires an independent approver."},
  STOCK_LOSS_IDEMPOTENCY_CONFLICT: {fr:"Cette référence de demande correspond à une autre opération.",en:"This request key belongs to another operation."},
  STOCK_LOSS_APPROVAL_REQUIRED: {fr:"Une demande de perte approuvée est obligatoire.",en:"An approved loss request is required."},
  STOCK_LOSS_VALUATION_REQUIRED: {fr:"Vérifiez les couches de coût, la devise, les comptes Stock et Charges ainsi que la période comptable. Aucune sortie n’a été enregistrée.",en:"Check cost layers, currency, Inventory and Expense mappings and accounting period. No stock was removed."},
  STOCK_LOT_EXPIRED: { fr: "Ce lot suivi est périmé. Il ne peut pas être vendu, réintégré en stock vendable ou consommé en production.", en: "This expiry-tracked batch has expired and cannot be sold, restocked for sale or consumed in production." },
  INVENTORY_RESERVATION_FULFILLMENT_EXCEEDED: { fr: "Les quantités réservées ne suffisent pas pour cette livraison. Réservez les lots nécessaires dans le dépôt sélectionné.", en: "Reserved quantities are insufficient for delivery. Reserve the required batches in the selected warehouse." },
  INVENTORY_RESERVATION_TRACKED_ITEM_REQUIRED: { fr: "Choisissez un article actif suivi par lots ou par péremption.", en: "Select an active batch- or expiry-tracked item." },
  INVENTORY_RESERVATION_RETAIL_MANAGED: { fr: "Cette commande est pilotée par RETAIL. Utilisez ses opérations pour modifier les réservations.", en: "This order is managed by RETAIL. Use its workflow to change reservations." },
  INVENTORY_RESERVATION_ACCOUNTING_NOT_READY: { fr: "La valorisation comptable du stock n’est pas prête. Vérifiez les comptes et les coûts avant de confirmer la livraison.", en: "Stock valuation is not ready. Check accounts and costs before confirming delivery." },
  INVENTORY_RESERVATION_PERMISSION_DENIED: { fr: "Un droit d’écriture Stock est nécessaire pour la livraison des lots.", en: "Inventory write permission is required to deliver tracked batches." },
  INVENTORY_RESERVATION_PRODUCT_DELIVERY_REQUIRED: { fr: "Pour livrer un article suivi par lots, choisissez une livraison de produits et le dépôt réservé.", en: "Choose product delivery and the reserved warehouse for batch-tracked items." },
  INVENTORY_RESERVATION_SECTOR_AUTHORITY: { fr: "Cet article dépend d’un registre sectoriel. Utilisez son circuit de traçabilité spécialisé.", en: "This item belongs to a sector ledger. Use its specialized traceability workflow." },
  RESERVATION_EXCEEDS_ORDER_REMAINING: { fr: "La quantité déjà livrée ou réservée et cette demande dépassent la quantité commandée.", en: "Delivered and reserved quantities plus this request exceed the order quantity." },
  INVENTORY_RESERVATION_EXPIRY_INVALID: { fr: "La date de fin de réservation doit être future.", en: "The reservation expiry must be in the future." },
  INVENTORY_RESERVATION_INSUFFICIENT: { fr: "Quantité vendable insuffisante après déduction des réservations, retenues et lots indisponibles.", en: "Insufficient sellable quantity after reservations, holds and unavailable batches." },
  INVENTORY_RESERVATION_STOCK_HELD: { fr: "Ce stock est réservé à une commande client. Réduisez la quantité ou utilisez un autre lot.", en: "This stock is reserved for a customer order. Reduce the quantity or use another batch." },
  INVENTORY_RESERVATION_REALLOCATION_REQUIRED: { fr: "Le lot réservé n'est plus utilisable ou la réservation n'a pas de lot identifié. Libérez le reliquat puis réservez des lots valides.", en: "A reserved batch is no longer usable or the reservation has no identified batch. Release the remainder and reserve eligible batches again." },
  INVENTORY_RESERVATION_ALLOCATION_INVALID: { fr: "La réservation par lot doit correspondre aux quantités physiques. Actualisez ou contactez le support si elle est incohérente.", en: "Batch reservation quantities must match physical stock. Refresh or contact support if inconsistent." },
  STOCK_RECLASS_ALLOCATION_INVALID: { fr: "Vérifiez les numéros réels, dates et quantités de lots, sans doublon.", en: "Check actual batch numbers, dates and quantities, without duplicates." },
  STOCK_RECLASS_QUANTITY_MISMATCH: { fr: "La répartition doit couvrir exactement le stock historique sélectionné.", en: "The allocation must exactly match the selected historical balance." },
  STOCK_RECLASS_SOURCE_INVALID: { fr: "Ce stock historique ou son dépôt n’est plus disponible.", en: "This historical balance or its warehouse is unavailable." },
  STOCK_RECLASS_SOURCE_CHANGED: { fr: "Le stock ou les règles ont changé. Actualisez avant une nouvelle demande.", en: "Stock or rules changed. Refresh before submitting again." },
  STOCK_RECLASS_PERMISSION_DENIED: { fr: "La régularisation exige une autorisation globale de stock et un validateur distinct.", en: "Reclassification requires company-wide stock access and an independent approver." },
  STOCK_RECLASS_SECTOR_AUTHORITY: { fr: "Cet article dépend d’un registre sectoriel. Utilisez son circuit de traçabilité spécialisé.", en: "This item belongs to a sector ledger. Use its specialized traceability workflow." },
  STOCK_RECLASS_OPEN_OPERATIONS: { fr: "Clôturez les opérations, réservations ou retenues de cet article avant sa répartition.", en: "Resolve stock operations, reservations or holds for this item before allocation." },
  STOCK_RECLASS_LOT_CONFLICT: { fr: "Le lot existe avec des coordonnées ou des dates incompatibles. Vérifiez sa fiche.", en: "The batch already exists with incompatible coordinates or dates. Review its details." },
  STOCK_RECLASS_IDEMPOTENCY_COLLISION: { fr: "Ce numéro de demande est déjà utilisé pour une autre opération.", en: "This request key has already been used for another operation." },
  STOCK_RECLASS_ALREADY_PENDING: { fr: "Une répartition est déjà en attente de validation pour ce stock.", en: "An allocation is already awaiting approval for this balance." },
  STOCK_RECLASS_REASON_REQUIRED: { fr: "Précisez le motif du rejet.", en: "Enter a reason for rejection." },
  RECEIPT_BATCH_LINE_INVALID: { fr: "Les lots doivent correspondre à des lignes de cette réception, sans doublon.", en: "Batches must match receipt lines, without duplicates." },
  RECEIPT_BATCH_SERVICE_INVALID: { fr: "Une prestation de service ne possède pas de lot physique.", en: "A service does not have a physical batch." },
  RECEIPT_BATCH_REQUIRED: { fr: "Renseignez les lots réellement reçus pour cet article.", en: "Enter the batches actually received for this item." },
  RECEIPT_BATCH_POLICY_REQUIRED: { fr: "Activez le suivi des lots dans Stock & logistique avant cette réception.", en: "Enable batch tracking in Inventory & logistics before receiving this item." },
  RECEIPT_BATCH_QUANTITY_INVALID: { fr: "La somme des quantités par lot doit correspondre à la quantité reçue, sans numéro en double.", en: "The total batch quantities must match the received quantity, without duplicate batch numbers." },
  RECEIPT_BATCH_EXPIRY_REQUIRED: { fr: "La date réelle de péremption est obligatoire pour chaque lot.", en: "The actual expiry date is required for every batch." },
  RECEIPT_BATCH_DATES_INVALID: { fr: "La date de fabrication doit précéder ou correspondre à la péremption.", en: "The production date must be on or before the expiry date." },
  RECEIPT_BATCH_METADATA_CONFLICT: { fr: "Ce lot existe avec des dates, un emplacement ou un statut différent. Vérifiez sa fiche dans Stock & logistique.", en: "This batch already exists with different dates, location or status. Review it in Inventory & logistics." },
  STOCK_TRANSFER_NOT_IN_TRANSIT: { fr: "Ce transfert ne peut pas être réceptionné : il n'est pas en cours de transport ou il a déjà été reçu.", en: "This transfer cannot be received: it is not in transit or has already been received." },
  STOCK_TRANSFER_REVISION_CONFLICT: { fr: "Ce transfert a changé depuis votre dernière lecture. Actualisez sa fiche.", en: "This transfer changed since you last viewed it. Refresh its details." },
  STOCK_TRANSFER_SOURCE_LOT_NOT_FOUND: { fr: "Le lot d'origine de ce transfert est introuvable. Contactez le responsable du stock avant réception.", en: "The original transfer batch is missing. Contact the stock manager before receiving." },
  STOCK_TRANSFER_DESTINATION_LOT_CONFLICT: { fr: "Un lot du même numéro existe à destination avec des dates différentes. Vérifiez les lots avant de réceptionner.", en: "A batch with this number exists at the destination with different dates. Check the batches before receiving." },
  EMPLOYMENT_CONTRACT_NOT_FOUND: { fr: "Ce contrat n’est plus disponible dans cette entreprise. Actualisez la liste.", en: "This contract is no longer available in your company. Refresh the list." },
  EMPLOYMENT_CONTRACT_ARCHIVE_NOT_FOUND: { fr: "Ce contrat n’est plus archivé. Actualisez les archives avant de le restaurer.", en: "This contract is no longer archived. Refresh the archive before restoring it." },
  EMPLOYMENT_CONTRACT_ACTIVE_ARCHIVE_FORBIDDEN: { fr: "Un contrat actif ne peut pas être archivé. Terminez-le par le processus RH avant l’archivage.", en: "An active contract cannot be archived. End it through the HR process first." },
  EMPLOYMENT_CONTRACT_ACTIVE_RESTORE_FORBIDDEN: { fr: "Un contrat actif historique ne peut pas être restauré sans nouveau circuit de validation.", en: "A historical active contract cannot be restored without a new approval workflow." },
  EMPLOYMENT_CONTRACT_ARCHIVE_FAILED: { fr: "L’archivage du contrat a échoué. Vérifiez son état et sa révision, puis recommencez.", en: "Contract archiving failed. Check its status and revision, then try again." },
  EMPLOYMENT_CONTRACT_RESTORE_FAILED: { fr: "La restauration du contrat a échoué. Actualisez l’archive et réessayez.", en: "Contract restore failed. Refresh the archive and try again." },
  EMPLOYEE_NOT_FOUND: { fr: "Ce dossier collaborateur est introuvable ou n’est plus disponible dans cette entreprise. Actualisez le registre RH.", en: "This employee record is unavailable in your company. Refresh the HR register." },

  EMPLOYEE_SELF_LINK_REQUIRED: { fr: "Votre compte n’est pas encore associé à un dossier salarié actif. Demandez au service RH de vérifier votre rattachement.", en: "Your account is not linked to an active employee record. Ask HR to verify the association." },
  EMPLOYEE_CLOCK_ALREADY_RUNNING: { fr: "Un pointage est déjà en cours. Terminez-le avant de commencer une nouvelle session.", en: "A clock-in is already running. Stop it before starting another session." },
  EMPLOYEE_CLOCK_NOT_RUNNING: { fr: "Aucune session de travail active à clôturer. Actualisez votre suivi de temps.", en: "No active work session to stop. Refresh your time tracking." },
  EMPLOYEE_CLOCK_FAILED: { fr: "Le pointage n’a pas pu être enregistré. Actualisez vos sessions et réessayez.", en: "The clock entry could not be saved. Refresh your sessions and try again." },
  EMPLOYEE_WORK_REPORT_FAILED: { fr: "Le rapport de travail n’a pas été soumis. Vérifiez les périodes, le validateur et les heures déclarées.", en: "The work report was not submitted. Check dates, approver and declared minutes." },
  EMPLOYEE_TIMESHEET_NOT_OWNED: { fr: "Vous ne pouvez soumettre une feuille de temps que pour votre propre dossier salarié.", en: "You can submit a timesheet only for your own employee record." },
  EMPLOYEE_ARCHIVE_NOT_FOUND: { fr: "Ce dossier ne se trouve plus dans les archives. Actualisez les dossiers archivés.", en: "This employee record is no longer archived. Refresh the archived records." },
  EMPLOYEE_ARCHIVE_DEPENDENCIES: { fr: "L’archivage est bloqué : clôturez les contrats actifs, faites traiter les feuilles de temps en attente et réaffectez les collaborateurs encadrés.", en: "Archiving is blocked: close active contracts, resolve pending timesheets and reassign direct reports." },
  EMPLOYEE_CANNOT_MANAGE_SELF: { fr: "Un collaborateur ne peut pas être son propre responsable. Sélectionnez un autre responsable.", en: "An employee cannot be their own manager. Select another manager." },
  EMPLOYEE_MANAGER_CYCLE: { fr: "Cette affectation créerait une boucle hiérarchique. Choisissez un responsable qui ne dépend pas de ce collaborateur.", en: "This assignment would create a reporting cycle. Select a manager who does not report to this employee." },
  EMPLOYEE_MANAGER_HIERARCHY_TOO_DEEP: { fr: "La chaîne hiérarchique est trop longue pour être vérifiée. Réorganisez les responsables avant de réessayer.", en: "The reporting hierarchy is too deep to validate. Reorganize managers before trying again." },
  EMPLOYEE_POSITION_NOT_FOUND: { fr: "Le poste sélectionné n’est plus actif. Actualisez les postes puis choisissez un poste officiel.", en: "The selected position is no longer active. Refresh positions and select an official position." },
  EMPLOYEE_DEPARTMENT_NOT_FOUND: { fr: "Le département sélectionné n’est plus actif. Actualisez la liste des départements.", en: "The selected department is no longer active. Refresh the department list." },
  EMPLOYEE_POSITION_DEPARTMENT_MISMATCH: { fr: "Le poste ne correspond pas au département choisi. Utilisez le département du poste ou sélectionnez un autre poste.", en: "The position does not match the department. Use the position's department or choose another position." },
  MANAGER_EMPLOYEE_NOT_FOUND: { fr: "Le responsable choisi n’est plus un employé actif de cette entreprise. Actualisez la liste des collaborateurs.", en: "The selected manager is not an active employee of this company. Refresh the employee list." },
  EMPLOYEE_MEMBER_ALREADY_LINKED: { fr: "Un dossier RH est déjà associé à ce collaborateur de l’entreprise. Ouvrez le dossier existant.", en: "An HR record is already associated with this company member. Open the existing record." },
  RETAIL_FULFILLMENT_ACCOUNTING_NOT_READY: { fr: "La livraison a été annulée sans mouvement de stock : sa valorisation comptable est incomplète. Vérifiez les couches de coût, les comptes de stock et de coût des ventes, ainsi que la configuration Finance, puis réessayez.", en: "Delivery was cancelled with no stock movement: inventory valuation is not ready. Check cost layers, Inventory and Cost of Sales accounts, and Finance configuration before retrying." },
  ORGANIZATION_NOT_ACTIVE: { fr: "Cette entreprise n’est pas active. Réactivez-la ou choisissez une autre entreprise.", en: "This organization is not active. Reactivate it or select another organization." },
  ORGANIZATION_TIMEZONE_INVALID: { fr: "Le fuseau horaire de cette entreprise est invalide. Corrigez-le dans Administration entreprise avant de continuer.", en: "This organization has an invalid timezone. Correct it in Company administration before continuing." },
  ENTERPRISE_CURRENCY_CONFIGURATION_REQUIRED: { fr: "La devise fonctionnelle de l’entreprise n’est pas configurée. Configurez Finance et le référentiel des devises avant de continuer.", en: "The organization's functional currency is not configured. Configure Finance and the currency registry before continuing." },
  ORGANIZATION_MEMBER_NOT_FOUND: { fr: "Le collaborateur sélectionné n’est plus actif dans Administration entreprise. Actualisez les collaborateurs puis choisissez une personne ayant accepté l’invitation.", en: "The selected collaborator is no longer active in Company administration. Refresh collaborators and select someone who accepted the invitation." },
  EMPLOYEE_NOT_ACTIVE: { fr: "Le dossier RH lié à ce collaborateur n’est plus actif. Vérifiez son statut dans Administration entreprise et la gouvernance RH avant de créer le contrat.", en: "The HR record linked to this collaborator is no longer active. Check the collaborator in Company administration and HR governance before creating the contract." },
  EMPLOYMENT_CONTRACT_POSITION_NOT_FOUND: { fr: "Le poste officiel sélectionné n’est plus actif. Actualisez les postes de l’entreprise puis choisissez un poste disponible.", en: "The selected official position is no longer active. Refresh company positions and select an available position." },
  EMPLOYMENT_CONTRACT_DEPARTMENT_NOT_FOUND: { fr: "Le département sélectionné n’est plus actif. Actualisez les départements de l’entreprise puis réessayez.", en: "The selected department is no longer active. Refresh company departments and try again." },
  EMPLOYMENT_CONTRACT_POSITION_DEPARTMENT_MISMATCH: { fr: "Le poste officiel et le département sélectionné ne correspondent pas. Conservez le département du poste ou choisissez une affectation cohérente.", en: "The official position and selected department do not match. Keep the position department or choose a consistent assignment." },
  BUSINESS_PARTY_NOT_FOUND: { fr: "Le tiers sélectionné est introuvable ou n’est plus actif. Actualisez la liste puis réessayez.", en: "The selected business party is unavailable or inactive. Refresh the list and try again." },
  BUSINESS_PARTY_NOT_COMMERCIAL: { fr: "Ce tiers n’est pas encore classé comme prospect ou client actif. Mettez à jour ses rôles dans Tiers, prospects et clients avant de démarrer une prospection.", en: "This business party is not yet classified as an active prospect or customer. Update its roles in Business parties, prospects and customers before starting prospecting." },
  LEAD_ACTIVE_ALREADY_EXISTS: { fr: "Une prospection active existe déjà pour ce tiers. Ouvrez le lead existant dans CRM et pipeline au lieu d’en créer un second.", en: "An active prospecting process already exists for this business party. Open the existing lead in CRM and pipeline instead of creating another one." },
  LEAD_CANONICAL_PARTY_REQUIRES_SELECTION: { fr: "Un tiers correspondant existe déjà. Utilisez la fiche existante pour démarrer la prospection afin d’éviter un doublon d’identité.", en: "A matching business party already exists. Use the existing record to start prospecting and avoid creating a duplicate identity." },
  UNIT_OF_MEASURE_NOT_FOUND: { fr: "L’unité de mesure sélectionnée n’est plus disponible. Actualisez le catalogue puis choisissez-en une autre.", en: "The selected unit is no longer available. Refresh the catalog and choose another one." },
  CATALOG_CATEGORY_NOT_FOUND: { fr: "La catégorie sélectionnée n’est plus disponible. Actualisez la liste puis réessayez.", en: "The selected category is no longer available. Refresh the list and try again." },
  CATALOG_PARENT_CATEGORY_NOT_FOUND: { fr: "La catégorie parente sélectionnée n’est plus disponible. Actualisez la liste puis réessayez.", en: "The selected parent category is no longer available. Refresh the list and try again." },
  CATALOG_ITEM_NOT_FOUND: { fr: "Un produit ou service sélectionné est introuvable ou inactif. Actualisez le catalogue puis réessayez.", en: "A selected product or service is unavailable or inactive. Refresh the catalog and try again." },
  SITE_NOT_FOUND: { fr: "Le site sélectionné est introuvable ou inactif. Actualisez les sites puis réessayez.", en: "The selected site is unavailable or inactive. Refresh sites and try again." },
  SITE_MANAGER_NOT_MEMBER: { fr: "Le responsable du site n’est plus un collaborateur actif de cette entreprise. Actualisez les collaborateurs puis réessayez.", en: "The site manager is no longer an active member of this organization. Refresh members and try again." },
  WAREHOUSE_NOT_FOUND: { fr: "L’entrepôt sélectionné est introuvable ou inactif. Actualisez les entrepôts puis réessayez.", en: "The selected warehouse is unavailable or inactive. Refresh warehouses and try again." },
  RETAIL_SITE_ACCESS_DENIED: { fr: "Vous n’avez pas l’autorisation requise pour cette boutique. Demandez au responsable de vérifier votre affectation et vos droits.", en: "You do not have the required permission for this store. Ask the manager to check your assignment and access." },
  RETAIL_SITE_REQUIRED: { fr: "Cette opération doit être associée à une boutique autorisée. Vérifiez le site de destination.", en: "This operation must belong to an authorized store. Check its destination site." },
  RECEIPT_IDEMPOTENCY_KEY_CONFLICT: { fr: "Cette référence de réception a déjà été utilisée pour une autre opération. Actualisez puis réessayez.", en: "This receipt reference was already used for a different operation. Refresh and try again." },
  WAREHOUSE_MANAGER_NOT_MEMBER: { fr: "Le responsable de l’entrepôt n’est plus un collaborateur actif de cette entreprise. Actualisez les collaborateurs puis réessayez.", en: "The warehouse manager is no longer an active member of this organization. Refresh members and try again." },
  STORAGE_LOCATION_NOT_FOUND: { fr: "L’emplacement de stockage sélectionné est introuvable ou inactif. Actualisez les emplacements puis réessayez.", en: "The selected storage location is unavailable or inactive. Refresh storage locations and try again." },
  PARENT_STORAGE_LOCATION_NOT_FOUND: { fr: "L’emplacement parent sélectionné est introuvable ou incohérent avec cet entrepôt. Actualisez les emplacements puis réessayez.", en: "The selected parent storage location is unavailable or inconsistent with this warehouse. Refresh storage locations and try again." },
  OPPORTUNITY_NOT_FOUND: { fr: "L’opportunité sélectionnée est introuvable. Actualisez le CRM puis réessayez.", en: "The selected opportunity was not found. Refresh CRM and try again." },
  REVISION_CONFLICT: { fr: "Cette fiche a été modifiée par un autre utilisateur. Actualisez-la avant de réessayer.", en: "This record was changed by another user. Refresh it before trying again." },
  SELF_APPROVAL_FORBIDDEN: { fr: "Vous ne pouvez pas valider votre propre demande. Choisissez un autre approbateur autorisé.", en: "You cannot approve your own request. Select another authorized approver." },
  CONTRACT_APPROVER_NOT_MEMBER: { fr: "L’approbateur sélectionné n’est plus un collaborateur actif de cette entreprise.", en: "The selected approver is no longer an active member of this organization." },
  LEAD_DUPLICATE_PARTY_REQUIRES_SELECTION: { fr: "Une fiche similaire existe déjà. Sélectionnez-la ou confirmez explicitement la création d’une nouvelle fiche.", en: "A similar record already exists. Select it or explicitly confirm creation of a new record." },
};

const PLAIN_DOMAIN_ERROR_STATUS: Record<string, number> = {
  BUSINESS_PARTY_NOT_FOUND: 404,
  UNIT_OF_MEASURE_NOT_FOUND: 404,
  CATALOG_CATEGORY_NOT_FOUND: 404,
  CATALOG_PARENT_CATEGORY_NOT_FOUND: 404,
  CATALOG_ITEM_NOT_FOUND: 404,
  SITE_NOT_FOUND: 404,
  WAREHOUSE_NOT_FOUND: 404,
  STORAGE_LOCATION_NOT_FOUND: 404,
  PARENT_STORAGE_LOCATION_NOT_FOUND: 404,
  OPPORTUNITY_NOT_FOUND: 404,
  SITE_MANAGER_NOT_MEMBER: 409,
  WAREHOUSE_MANAGER_NOT_MEMBER: 409,
  REVISION_CONFLICT: 409,
};

const DUPLICATE_ERRORS: Record<string, { code: string; fr: string; en: string }> = {
  BUSINESS_PARTY_CREATE_FAILED: { code: "BUSINESS_PARTY_DUPLICATE", fr: "Un tiers avec le même code ou les mêmes informations uniques existe déjà.", en: "A business party with the same code or unique information already exists." },
  CATALOG_ITEM_CREATE_FAILED: { code: "CATALOG_ITEM_DUPLICATE", fr: "Un produit ou service avec le même code ou SKU existe déjà dans ce catalogue.", en: "A product or service with the same code or SKU exists in this catalog." },
  LEAD_CREATE_FAILED: { code: "LEAD_DUPLICATE", fr: "Un prospect avec les mêmes informations uniques existe déjà dans le pipeline.", en: "A lead with the same unique information exists in the pipeline." },
  LEAD_ONBOARDING_FAILED: { code: "LEAD_DUPLICATE", fr: "Une prospection ou une identité similaire existe déjà. Vérifiez les tiers et leads existants avant de réessayer.", en: "A similar prospecting process or identity already exists. Check existing business parties and leads before trying again." },
  OPPORTUNITY_CREATE_FAILED: { code: "OPPORTUNITY_DUPLICATE", fr: "Une opportunité avec la même référence existe déjà.", en: "An opportunity with the same reference already exists." },
  QUOTE_CREATE_FAILED: { code: "QUOTE_DUPLICATE", fr: "Un devis avec le même numéro existe déjà.", en: "A quote with the same number already exists." },
  CONTRACT_CREATE_FAILED: { code: "CONTRACT_DUPLICATE", fr: "Un contrat avec le même numéro existe déjà.", en: "A contract with the same number already exists." },
};

function requestLocale(request?: Request) {
  return request?.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export function enterpriseSupportReference(request?: Request) {
  const raw = request?.headers.get("x-request-id")
    || request?.headers.get("x-vercel-id")
    || request?.headers.get("cf-ray")
    || "";
  const normalized = raw.replace(/[^A-Za-z0-9:._/-]/g, "").slice(0, 160);
  return normalized || null;
}

function reportUnexpectedEnterpriseError(error: unknown, fallbackCode: string, request?: Request) {
  const errorName = error instanceof Error ? error.name : typeof error;
  const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
  const requestPath = request ? new URL(request.url).pathname : null;
  const requestId = enterpriseSupportReference(request);
  // Do not log the raw Prisma message here: validation errors can contain form values.
  console.error("[enterprise-domain] unexpected operation failure", { fallbackCode, errorName, prismaCode, requestPath, requestId });
}

export function enterpriseValidationErrorResponse(
  error: ZodError,
  code = "ENTERPRISE_INPUT_INVALID",
  request?: Request,
) {
  const locale = requestLocale(request);
  const firstIssue = error.issues[0];
  const firstMessage = typeof firstIssue?.message === "string" ? firstIssue.message.trim() : "";
  const looksFrench = /[àâçéèêëîïôùûüœ]|\b(?:doit|doivent|obligatoire|invalide|requis|requise|sélectionnez|renseignez)\b/i.test(firstMessage);
  const message = firstMessage && (locale === "fr" || !looksFrench)
    ? firstMessage
    : locale === "en"
      ? "Some information is invalid. Review the highlighted fields and try again."
      : "Certaines informations sont invalides. Vérifiez les champs concernés puis réessayez.";
  return NextResponse.json({
    error: code,
    message,
    details: {
      fieldErrors: error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "_root",
        validation: issue.code,
      })),
    },
  }, { status: 400 });
}

export function enterpriseDomainErrorResponse(error: unknown, fallbackCode = "ENTERPRISE_OPERATION_FAILED", request?: Request) {
  const locale = requestLocale(request);
  if (error instanceof EnterpriseDomainError) {
    const safeMessage = BUSINESS_ERROR_MESSAGES[error.code]?.[locale]
      || (locale === "en" ? "The operation cannot be completed with the current information. Check the form and try again." : "L’opération ne peut pas être terminée avec les informations actuelles. Vérifiez le formulaire puis réessayez.");
    return NextResponse.json({ error: error.code, message: safeMessage }, { status: error.status });
  }
  if (error instanceof Error && BUSINESS_ERROR_MESSAGES[error.message]) {
    return NextResponse.json({
      error: error.message,
      message: BUSINESS_ERROR_MESSAGES[error.message][locale],
    }, { status: PLAIN_DOMAIN_ERROR_STATUS[error.message] || 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const duplicate = DUPLICATE_ERRORS[fallbackCode];
    return NextResponse.json({
      error: duplicate?.code || "DUPLICATE",
      message: duplicate?.[locale] || (locale === "en" ? "A record with the same unique information already exists. Check existing records before trying again." : "Une fiche portant les mêmes informations uniques existe déjà. Vérifiez les fiches existantes avant de réessayer."),
    }, { status: 409 });
  }
  reportUnexpectedEnterpriseError(error, fallbackCode, request);
  const supportReference = enterpriseSupportReference(request);
  return NextResponse.json({
    error: fallbackCode,
    message: locale === "en"
      ? "The service could not save this operation right now. Your entries were kept. Please try again shortly or contact support if the problem persists."
      : "Le service n’a pas pu enregistrer cette opération pour le moment. Vos saisies sont conservées. Réessayez dans quelques instants ou contactez le support si le problème persiste.",
    ...(supportReference ? { supportReference } : {}),
  }, { status: 500 });
}
