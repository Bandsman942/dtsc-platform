import { NextResponse } from "next/server";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeErrorResponse } from "@/lib/enterprise/accounting/http";

const C5_ERROR_MESSAGES: Record<string, string> = {
  FX_REVALUATION_SOURCE_INVALID: "La source de réévaluation FX est invalide. Rechargez la période et recommencez.",
  FX_REVALUATION_FOREIGN_CURRENCY_REQUIRED: "Choisissez une devise étrangère différente de la devise fonctionnelle pour lancer la réévaluation.",
  FX_REVALUATION_NEXT_OPEN_PERIOD_REQUIRED: "Ouvrez la période comptable suivante avant la réévaluation : DTSC doit pouvoir créer la contrepassation automatique liée.",
  FX_REVALUATION_NOT_REQUIRED: "Aucun écart de change de clôture n’est à comptabiliser pour cette devise et cette période.",
  FISCAL_YEAR_NOT_FOUND: "Cet exercice n’existe pas dans l’entreprise active.",
  FISCAL_YEAR_NOT_CLOSABLE: "Cet exercice n’est pas dans un état permettant la clôture annuelle.",
  FISCAL_YEAR_PERIODS_REQUIRED: "Créez les périodes comptables de cet exercice avant de lancer la clôture annuelle.",
  YEAR_END_SOURCE_INVALID: "La source de clôture annuelle est invalide. Rechargez l’exercice et recommencez.",
  YEAR_END_OPEN_CLOSING_PERIOD_REQUIRED: "La dernière période de l’exercice doit être ouverte ou pré-clôturée avant le year-end.",
  YEAR_END_NEXT_OPEN_FISCAL_YEAR_REQUIRED: "Ouvrez l’exercice suivant et au moins sa première période avant de clôturer l’exercice courant.",
  YEAR_END_NO_BALANCE_TO_CLOSE: "Aucun solde de produit ou de charge n’est disponible à solder pour cet exercice.",
  ASSET_DISPOSAL_SOURCE_INVALID: "La source de cession d’actif est invalide. Rechargez la cession avant de recommencer.",
  ASSET_DISPOSAL_NOT_FOUND: "Cette cession n’existe pas pour l’actif sélectionné dans l’entreprise active.",
  ASSET_DISPOSAL_REVISION_CONFLICT: "Cette cession a été modifiée entre-temps. Rechargez-la avant de la comptabiliser.",
  ASSET_DISPOSAL_NOT_POSTABLE: "Cette cession ou cet actif n’est plus dans un état permettant la comptabilisation.",
  ASSET_DISPOSAL_LEDGER_BASIS_INVALID: "La valeur brute ou les amortissements cumulés du grand livre ne permettent pas de comptabiliser cette cession. Vérifiez l’historique comptable de l’actif.",
  POSTING_ACCOUNT_MAPPING_REQUIRED: "Un compte comptable requis pour cette opération n’est pas mappé à la date comptable choisie.",
  POSTING_DIRECT_ACCOUNT_INVALID: "Un compte comptable utilisé par cette opération n’est plus actif dans l’entreprise.",
  POSTING_ACCOUNT_INACTIVE: "Un mapping comptable de cette opération pointe vers un compte inactif.",
  POSTING_ACCOUNT_TYPE_INCOMPATIBLE: "Un mapping comptable de cette opération pointe vers un type de compte incompatible.",
};

const C5_FALLBACK_MESSAGES: Record<string, string> = {
  FX_REVALUATION_FAILED: "La réévaluation FX de clôture n’a pas pu être terminée. Aucune écriture partielle ne doit être considérée comme validée.",
  YEAR_END_CLOSE_FAILED: "La clôture annuelle n’a pas pu être terminée. L’exercice ne doit pas être considéré comme clôturé.",
  ASSET_DISPOSAL_POSTING_FAILED: "La cession d’actif n’a pas pu être comptabilisée. Le brouillon et l’actif doivent être rechargés avant une nouvelle tentative.",
};

export function c5FinanceErrorResponse(error: unknown, fallback: keyof typeof C5_FALLBACK_MESSAGES) {
  if (error instanceof EnterpriseAccountingError && C5_ERROR_MESSAGES[error.code]) {
    return NextResponse.json(
      { error: error.code, message: C5_ERROR_MESSAGES[error.code], details: error.details },
      { status: error.status },
    );
  }
  if (error instanceof EnterpriseAccountingError) return financeErrorResponse(error, fallback);
  console.error(fallback, error);
  return NextResponse.json(
    { error: fallback, message: C5_FALLBACK_MESSAGES[fallback] },
    { status: 500 },
  );
}
