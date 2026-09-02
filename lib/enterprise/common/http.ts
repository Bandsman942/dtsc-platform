import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

const BUSINESS_ERROR_MESSAGES: Record<string, { fr: string; en: string }> = {
  ORGANIZATION_NOT_ACTIVE: { fr: "Cette entreprise n’est pas active. Réactivez-la ou choisissez une autre entreprise.", en: "This organization is not active. Reactivate it or select another organization." },
  BUSINESS_PARTY_NOT_FOUND: { fr: "Le tiers sélectionné est introuvable ou n’est plus actif. Actualisez la liste puis réessayez.", en: "The selected business party is unavailable or inactive. Refresh the list and try again." },
  UNIT_OF_MEASURE_NOT_FOUND: { fr: "L’unité de mesure sélectionnée n’est plus disponible. Actualisez le catalogue puis choisissez-en une autre.", en: "The selected unit is no longer available. Refresh the catalog and choose another one." },
  CATALOG_CATEGORY_NOT_FOUND: { fr: "La catégorie sélectionnée n’est plus disponible. Actualisez la liste puis réessayez.", en: "The selected category is no longer available. Refresh the list and try again." },
  CATALOG_ITEM_NOT_FOUND: { fr: "Un produit ou service sélectionné est introuvable ou inactif. Actualisez le catalogue puis réessayez.", en: "A selected product or service is unavailable or inactive. Refresh the catalog and try again." },
  OPPORTUNITY_NOT_FOUND: { fr: "L’opportunité sélectionnée est introuvable. Actualisez le CRM puis réessayez.", en: "The selected opportunity was not found. Refresh CRM and try again." },
  SELF_APPROVAL_FORBIDDEN: { fr: "Vous ne pouvez pas valider votre propre demande. Choisissez un autre approbateur autorisé.", en: "You cannot approve your own request. Select another authorized approver." },
  CONTRACT_APPROVER_NOT_MEMBER: { fr: "L’approbateur sélectionné n’est plus un collaborateur actif de cette entreprise.", en: "The selected approver is no longer an active member of this organization." },
  LEAD_DUPLICATE_PARTY_REQUIRES_SELECTION: { fr: "Une fiche similaire existe déjà. Sélectionnez-la ou confirmez explicitement la création d’une nouvelle fiche.", en: "A similar record already exists. Select it or explicitly confirm creation of a new record." },
};

const DUPLICATE_ERRORS: Record<string, { code: string; fr: string; en: string }> = {
  BUSINESS_PARTY_CREATE_FAILED: { code: "BUSINESS_PARTY_DUPLICATE", fr: "Un tiers avec le même code ou les mêmes informations uniques existe déjà.", en: "A business party with the same code or unique information already exists." },
  CATALOG_ITEM_CREATE_FAILED: { code: "CATALOG_ITEM_DUPLICATE", fr: "Un produit ou service avec le même code ou SKU existe déjà dans ce catalogue.", en: "A product or service with the same code or SKU already exists in this catalog." },
  LEAD_CREATE_FAILED: { code: "LEAD_DUPLICATE", fr: "Un prospect avec les mêmes informations uniques existe déjà dans le pipeline.", en: "A lead with the same unique information already exists in the pipeline." },
  OPPORTUNITY_CREATE_FAILED: { code: "OPPORTUNITY_DUPLICATE", fr: "Une opportunité avec la même référence existe déjà.", en: "An opportunity with the same reference already exists." },
  QUOTE_CREATE_FAILED: { code: "QUOTE_DUPLICATE", fr: "Un devis avec le même numéro existe déjà.", en: "A quote with the same number already exists." },
  CONTRACT_CREATE_FAILED: { code: "CONTRACT_DUPLICATE", fr: "Un contrat avec le même numéro existe déjà.", en: "A contract with the same number already exists." },
};

function requestLocale(request?: Request) {
  return request?.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export function enterpriseDomainErrorResponse(error: unknown, fallbackCode = "ENTERPRISE_OPERATION_FAILED", request?: Request) {
  const locale = requestLocale(request);
  if (error instanceof EnterpriseDomainError) {
    const safeMessage = BUSINESS_ERROR_MESSAGES[error.code]?.[locale]
      || (locale === "en" ? "The operation cannot be completed with the current information. Check the form and try again." : "L’opération ne peut pas être terminée avec les informations actuelles. Vérifiez le formulaire puis réessayez.");
    return NextResponse.json({ error: error.code, message: safeMessage }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const duplicate = DUPLICATE_ERRORS[fallbackCode];
    return NextResponse.json({
      error: duplicate?.code || "DUPLICATE",
      message: duplicate?.[locale] || (locale === "en" ? "A record with the same unique information already exists. Check existing records before trying again." : "Une fiche portant les mêmes informations uniques existe déjà. Vérifiez les fiches existantes avant de réessayer."),
    }, { status: 409 });
  }
  return NextResponse.json({ error: fallbackCode, message: locale === "en" ? "The operation could not be completed. Your entries were kept; check the required fields and try again." : "L’opération n’a pas pu être terminée. Vos saisies sont conservées ; vérifiez les champs obligatoires puis réessayez." }, { status: 400 });
}
