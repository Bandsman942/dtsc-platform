import { NextResponse } from "next/server";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { relationshipBenefitErrorResponse } from "@/lib/enterprise/relationship-benefits/http";

export function manualRelationshipCreditErrorResponse(error: unknown) {
  if (error instanceof EnterpriseAccountingError) {
    return NextResponse.json({
      error: "RELATIONSHIP_CREDIT_ACCOUNTING_UNAVAILABLE",
      message: "Aucun crédit n’a été attribué. Vérifiez que la période comptable est ouverte et que le journal d’ajustement ainsi que les comptes de charges et d’avoirs clients sont configurés.",
    }, { status: 409 });
  }
  if (error instanceof EnterpriseRetailError) {
    return NextResponse.json({
      error: "RELATIONSHIP_CREDIT_STORED_VALUE_CONFLICT",
      message: "Aucun mouvement enregistré : le compte d’avoir est inactif, insuffisant ou ne correspond plus au client et à la devise. Vérifiez le compte Retail.",
    }, { status: 409 });
  }
  if (error && typeof error === "object" && "code" in error &&
      (error as { code?: string }).code === "P2034") {
    return NextResponse.json({
      error: "RELATIONSHIP_CREDIT_CONCURRENT_UPDATE",
      message: "Cette demande est déjà traitée simultanément. Actualisez les données avant de réessayer.",
    }, { status: 409 });
  }
  return relationshipBenefitErrorResponse(error);
}
