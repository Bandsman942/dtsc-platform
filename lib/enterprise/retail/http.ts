import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import type { EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { retailFailureOutcome } from "@/lib/enterprise/retail/mutation-outcome";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const ERROR_MESSAGES: Record<string, string> = {
  RETAIL_SECTOR_REQUIRED: "Cette entreprise doit utiliser le profil Commerce Retail pour accéder à cette opération.",
  RETAIL_REFERENCE_INVALID: "Une référence sélectionnée n’appartient pas à cette entreprise ou n’est plus active.",
  RETAIL_CATALOG_ITEM_INVALID: "Un article du ticket est introuvable ou inactif.",
  RETAIL_INVENTORY_ITEM_REQUIRED: "Un article suivi en stock doit disposer d’un article d’inventaire actif.",
  RETAIL_INVENTORY_POLICY_INVALID: "Les règles de péremption du magasin sont invalides. Demandez à un administrateur de les reconfigurer.",
  RETAIL_SITE_ASSIGNMENT_TARGET_INVALID: "La boutique ou le collaborateur n'est plus actif, ou ce compte possède déjà les droits d'administration globale.",
  RETAIL_SITE_ASSIGNMENT_CONFLICT: "Les attributions de droits ont changé. Actualisez la liste avant d'enregistrer.",
  RETAIL_SITE_ACCESS_DENIED: "Vous n'êtes pas autorisé à effectuer cette action dans cette boutique.",
  CASH_ACCOUNT_SITE_MISMATCH: "La boutique sélectionnée ne correspond pas au compte financier de la caisse. Choisissez un compte affecté à cette boutique.",
  RETAIL_CLOSE_ACCOUNT_SITE_MISMATCH: "Cette clôture contient un compte ou une session de caisse appartenant à une autre boutique. Séparez les opérations par boutique.",
  RETAIL_CLOSE_MULTISITE_FORBIDDEN: "Une clôture quotidienne doit concerner une seule boutique. Soumettez chaque boutique séparément.",
  RETAIL_SITE_REQUIRED: "Sélectionnez une boutique autorisée pour continuer.",
  RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE: "La facturation en deux étapes est en préparation pour cette entreprise. Son activation est bloquée jusqu'à la validation du circuit Finance et stock.",
  RETAIL_INVOICE_RETURN_PAGE_INVALID: "La page des demandes de retour est invalide. Actualisez la liste.",
  RETAIL_INVOICE_RETURN_NOT_FOUND: "Cette demande de retour n’existe pas dans la facture et la boutique autorisées.",
  RETAIL_INVOICE_RETURN_INPUT_INVALID: "La demande de retour comporte des informations invalides.",
  RETAIL_INVOICE_RETURN_SELF_APPROVAL_FORBIDDEN: "La personne qui demande le retour ne peut pas approuver sa propre demande.",
  RETAIL_INVOICE_RETURN_APPROVER_INELIGIBLE: "Le validateur indiqué n’est plus autorisé à approuver ces retours dans cette boutique.",
  RETAIL_INVOICE_RETURN_IDEMPOTENCY_CONFLICT: "Cette référence de retour a déjà été utilisée pour un autre contenu ou utilisateur.",
  RETAIL_INVOICE_RETURN_PAID_REQUIRED: "Le retour ne peut être demandé qu’après paiement intégral de la facture et sortie de stock confirmée.",
  RETAIL_INVOICE_RETURN_LINE_INVALID: "La ligne de retour ne correspond pas à la facture concernée.",
  RETAIL_INVOICE_RETURN_DUPLICATE_LINE: "Une même ligne de facture ne peut pas figurer deux fois dans la demande de retour.",
  RETAIL_INVOICE_RETURN_QUANTITY_EXCEEDED: "La quantité demandée dépasse la quantité encore autorisée pour retour.",
  RETAIL_INVOICE_RETURN_STOCK_QUANTITY_PRECISION: "La quantité d’un article en stock ne peut pas dépasser trois décimales (précision des mouvements d’inventaire). Corrigez-la avant de soumettre le retour.",
  RETAIL_INVOICE_RETURN_STOCK_DISPOSITION_INVALID: "Un service non stocké ne peut pas être réintégré physiquement au stock.",
  RETAIL_INVOICE_RETURN_AMOUNT_INVALID: "Le montant calculé pour ce retour est invalide. Vérifiez les quantités de la facture.",
  RETAIL_INVOICE_RETURN_AMOUNT_BELOW_MINOR_UNIT: "La quantité retournée correspond à un montant inférieur à la plus petite unité monétaire prise en charge par Finance. Augmentez la quantité ou faites vérifier la facture.",
  RETAIL_INVOICE_RETURN_HISTORICAL_PRECISION_UNSUPPORTED: "Cette ancienne ligne de facture contient des fractions monétaires que le circuit de remboursement Finance ne sait pas comptabiliser exactement. Faites-la examiner avant de demander un retour.",
  RETAIL_INVOICE_RETURN_REVISION_CONFLICT: "La demande a déjà été traitée ou modifiée. Rechargez avant de décider.",
  RETAIL_INVOICE_RETURN_INSPECTION_INVALID: "Confirmez la réception et décrivez le contrôle physique des articles retournés.",
  RETAIL_INVOICE_RETURN_INSPECTION_REQUIRED: "Le retour doit être reçu et contrôlé par un responsable des stocks indépendant avant son approbation Finance.",
  RETAIL_INVOICE_RETURN_INSPECTOR_INELIGIBLE: "Le contrôle des marchandises doit être réalisé par un responsable des stocks différent du demandeur et du validateur Finance.",
  RETAIL_INVOICE_RETURN_REJECTION_REASON_REQUIRED: "Indiquez au moins quatre caractères pour motiver le rejet du retour.",
  RETAIL_INVOICE_RETURN_FINANCE_PREPARE_INVALID: "La demande de préparation financière est invalide. Actualisez le retour.",
  RETAIL_INVOICE_RETURN_FINANCE_SETTLE_INVALID: "Précisez une justification valide et actualisez la demande avant de terminer le remboursement.",
  RETAIL_INVOICE_RETURN_FINANCE_PERMISSION_REQUIRED: "Cette étape nécessite les autorisations Finance des paiements et des créances clients. Vérifiez votre rôle ou demandez l'intervention d'un responsable habilité.",
  RETAIL_INVOICE_RETURN_FINANCE_CONFLICT: "Ce retour a changé ou les pièces Finance sont déjà préparées. Actualisez le dossier.",
  RETAIL_INVOICE_RETURN_MULTIPLE_REFUND_ACCOUNTS_UNSUPPORTED: "Les paiements de cette facture proviennent de plusieurs comptes financiers. Le remboursement doit être traité par un circuit multi-comptes dédié.",
  RETAIL_INVOICE_RETURN_FINANCE_SOURCE_MISMATCH: "La source financière du règlement ne permet pas ce remboursement. Vérifiez le compte et le moyen de paiement d'origine.",
  RETAIL_INVOICE_RETURN_CREDIT_EXCEEDS_INVOICE: "Les avoirs déjà engagés et ce retour dépassent le total de la facture. Actualisez le dossier.",
  RETAIL_INVOICE_RETURN_REFUND_ACCOUNT_INSUFFICIENT: "Le compte de la boutique ne dispose pas d'un solde opérationnel suffisant pour ce remboursement.",
  RETAIL_ORIGINAL_ISSUE_VALUATION_REQUIRED: "La sortie d'origine de cette facture n'a pas de coût comptable validé. Le retour est bloqué : faites rapprocher l'inventaire et les écritures par la comptabilité avant de continuer.",
  RETAIL_INVOICE_FULFILLMENT_MOVEMENT_INVALID: "Le mouvement de sortie n'appartient pas à cette facture. L'affectation finale et la livraison sont annulées.",
  RETAIL_INVENTORY_COST_LAYER_REQUIRED: "Ce produit n'a pas de couche de coût disponible dans le dépôt. Valorisez d'abord sa réception avant de finaliser l'encaissement.",
  RETAIL_INVENTORY_VALUATION_CURRENCY_AMBIGUOUS: "Les couches de coût de cet article utilisent plusieurs devises sans correspondance certaine. Configurez la devise de valorisation avant de continuer.",
  INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN: "La quantité restant dans les couches de coût est insuffisante pour valoriser cette livraison. Vérifiez les réceptions comptabilisées du dépôt.",
  INVENTORY_WEIGHTED_AVERAGE_REQUIRED: "La comptabilité des stocks doit être prête et configurée en coût moyen pondéré avant cette livraison.",
  OPEN_CASH_SESSION_REQUIRED: "Ouvrez une session de caisse sur le compte de cette boutique avec l'utilisateur qui prépare le remboursement en espèces.",
  PAYMENT_CASH_SESSION_AMBIGUOUS: "Plusieurs sessions de caisse ouvertes sont possibles pour ce remboursement. Faites identifier la session à utiliser avant de confirmer.",
  RETAIL_INVOICE_RETURN_SETTLEMENT_TAX_SPLIT_INVALID: "Les montants HT et taxes de ce retour ne correspondent pas exactement à la facture. Faites vérifier le calcul.",
  RETAIL_INVOICE_IDEMPOTENCY_COLLISION: "Cette référence de facturation a déjà été utilisée pour un panier différent.",
  RETAIL_INVOICE_WALKIN_CUSTOMER_INVALID: "Le compte client de passage est mal configuré. Faites corriger le référentiel clients.",
  RETAIL_INVOICE_PRICING_MISMATCH: "Le calcul fiscal de la facture ne correspond pas au prix Retail. Revoyez la configuration des taxes avant de continuer.",
  RETAIL_INVOICE_LINE_MISSING: "Un article de la facture n'a pas été enregistré correctement. L'opération entière est annulée.",
  RETAIL_INVOICE_NOT_FULLY_PAID: "La sortie de stock nécessite une facture entièrement réglée et affectée en Finance.",
  RETAIL_INVOICE_STOCK_INSUFFICIENT: "Le stock de cette boutique ne suffit plus pour livrer la facture. L'affectation finale du paiement a été annulée ; vérifiez les stocks et les lots.",
  RETAIL_INVOICE_STOCK_HELD: "La quantité demandée est déjà promise à une facture non soldée de cette boutique. Annulez ou régularisez cette facture avant de déplacer ou de vendre ces articles.",
  RETAIL_INVOICE_FINANCIAL_ACCOUNT_SITE_MISMATCH: "Le compte d'encaissement de ce paiement doit appartenir à la boutique ayant établi la facture.",
  RETAIL_INVOICE_CASH_SESSION_SITE_MISMATCH: "La session de caisse ne correspond pas à la boutique de cette facture. Ouvrez une caisse au bon emplacement.",
  RETAIL_INVOICE_NOT_FOUND: "Cette facture n’existe plus dans les boutiques autorisées. Actualisez le registre.",
  RETAIL_INVOICE_CANCELLATION_NOT_ALLOWED: "Seule une facture encore à l’état de brouillon peut être annulée depuis Retail. Utilisez Finance pour les opérations ultérieures.",
  RETAIL_INVOICE_REVISION_CONFLICT: "Cette facture a changé depuis son affichage. Actualisez son état avant de décider.",
  RETAIL_INVOICE_SELF_APPROVAL_FORBIDDEN: "Le facturier ne peut pas valider lui-même sa facture. Choisissez un autre responsable Finance.",
  RETAIL_INVOICE_APPROVER_NOT_ELIGIBLE: "Le validateur Finance sélectionné n’est plus habilité. Actualisez la liste des responsables.",
  RETAIL_INVOICE_PAYMENT_INPUT_INVALID: "Le montant ou les références d'encaissement sont invalides. Corrigez le formulaire.",
  RETAIL_INVOICE_PAYMENT_PAGE_INVALID: "La page demandée est invalide. Actualisez la liste des encaissements.",
  RETAIL_INVOICE_PAYMENT_IDEMPOTENCY_COLLISION: "Cette référence d'encaissement a déjà servi pour une autre opération. Rechargez le formulaire.",
  RETAIL_INVOICE_PAYMENT_NOT_RECEIVABLE: "La facture doit être émise et posséder une créance ouverte avant tout encaissement.",
  RETAIL_INVOICE_PAYMENT_CASH_SESSION_INVALID: "Une session de caisse ne peut accompagner qu'un encaissement en espèces.",
  RETAIL_INVOICE_PAYMENT_CUSTOMER_INVALID: "Le client rattaché à la facture n'est plus actif. Corrigez sa fiche avant d'encaisser.",
  RETAIL_INVOICE_PAYMENT_EXCEEDS_OUTSTANDING: "Le montant dépasse le solde encore disponible, en tenant compte des encaissements déjà en attente. Actualisez la facture.",
  RETAIL_INVOICE_PAYMENT_NOT_FOUND: "Cet encaissement ne correspond pas à cette facture ou vous ne pouvez pas le gérer.",
  RETAIL_INVOICE_PAYMENT_REVISION_CONFLICT: "L'encaissement a changé. Actualisez-le avant de poursuivre.",
  RETAIL_INVOICE_PAYMENT_NOT_DRAFT: "Cette opération n'est plus en brouillon. Consultez le suivi Finance avant une nouvelle action.",
  RETAIL_INVOICE_PAYMENT_NOT_CONFIRMED: "Seul un encaissement déjà confirmé par Finance peut être affecté à une facture.",
  RETAIL_INVOICE_PAYMENT_NOT_ALLOCATABLE: "Cet encaissement n'a plus de montant affectable. Consultez son historique Finance.",
  RETAIL_INVOICE_PAYMENT_TARGET_MISMATCH: "Cet encaissement a été créé pour une autre facture et ne peut pas être réaffecté.",
  RETAIL_CONFIGURATION_REQUIRED: "Terminez d’abord la configuration du commerce de détail avant de modifier les règles de stock.",
  RETAIL_FEATURE_ACTIVATION_CONFLICT: "Les réglages RETAIL ont changé. Actualisez la page avant de recommencer.",
  RETAIL_FEATURE_ACTIVATION_UNCHANGED: "Cette fonctionnalité est déjà dans l’état demandé. Actualisez la page.",
  RETAIL_FEATURE_ACTIVATION_NOT_READY: "Les prérequis de la fonctionnalité ne sont pas tous remplis. Vérifiez les éléments signalés avant l’activation.",
  RETAIL_FEATURE_ISOLATION_DEPENDENCY: "Désactivez d’abord la facturation avancée avant de modifier l’isolation des boutiques.",
  RETAIL_FEATURE_ISOLATION_ROLLBACK_UNSAFE: "La désactivation de l’isolation exposerait les boutiques à des collaborateurs actifs. Retirez d’abord tous les accès collaborateurs non administrateurs ou contactez le support.",
  RETAIL_FEATURE_INVOICE_ROLLBACK_BLOCKED: "Des factures, paiements ou retours Retail nécessitent encore ce circuit. Terminez ces opérations avant de désactiver la facturation avancée.",
  RETAIL_INVENTORY_POLICY_CONFLICT: "Les règles de stock ont été modifiées entre-temps. Rechargez-les avant d’enregistrer.",
  RETAIL_STOCK_LOT_REQUIRED: "Sélectionnez un lot de stock pour cet article avant de confirmer la vente.",
  RETAIL_STOCK_LOT_INVALID: "Le lot de stock sélectionné n’est plus disponible dans ce dépôt.",
  RETAIL_STOCK_LOT_EXPIRED: "Ce lot est périmé. Choisissez un lot valide ou retirez cette marchandise de la vente.",
  RETAIL_FEFO_LOT_REQUIRED: "Utilisez d’abord le lot disponible dont la date de péremption est la plus proche.",
  RETAIL_CURRENCY_MISMATCH: "La devise du produit ne correspond pas à la devise de l’opération.",
  RETAIL_LINE_TOTAL_INVALID: "La remise ou la taxe rend le total de ligne invalide.",
  RETAIL_RELATIONSHIP_BENEFIT_ZERO_TOTAL_UNSUPPORTED: "Cet avantage ramènerait le ticket à zéro. Utilisez un avantage non monétaire ou configurez une valeur laissant un montant positif à encaisser.",
  RETAIL_OMNICHANNEL_PRICE_PRECISION_UNSUPPORTED: "Les montants du panier dépassent la précision comptable de la commande (2 décimales). Ajustez le prix ou la quantité avant de confirmer.",
  RETAIL_OMNICHANNEL_IDEMPOTENCY_PAYLOAD_MISMATCH: "Cette référence de commande a déjà été utilisée avec un autre client, panier ou mode de livraison.",
  RETAIL_OMNICHANNEL_CATALOG_DUPLICATE: "Un même article est présent plusieurs fois dans ce panier. Regroupez les quantités avant de confirmer.",
  RETAIL_OMNICHANNEL_CANCELLATION_CONFLICT: "La commande ne peut plus être annulée directement : elle a changé d’état ou une livraison a déjà commencé. Actualisez-la et utilisez le circuit de retour si nécessaire.",
  RETAIL_OMNICHANNEL_ORDER_NOT_FOUND: "La commande omnicanale demandée est introuvable dans cette entreprise.",
  RETAIL_OMNICHANNEL_ORDER_CONTEXT_MISSING: "Une ancienne commande utilise déjà cette référence sans contexte Retail vérifiable. Actualisez et contactez le support avant de poursuivre.",
  RETAIL_OMNICHANNEL_RESERVATION_INCOMPLETE: "La réservation de cette commande est en cours ou a échoué. Actualisez dans quelques instants ; si le problème persiste, contactez le support.",
  RELATIONSHIP_BENEFIT_OMNICHANNEL_ORDER_PRICE_MISMATCH: "Le montant de la commande a changé. Rechargez le panier avant de confirmer cet avantage.",
  RELATIONSHIP_BENEFIT_OMNICHANNEL_MODULE_DISABLED: "Les avantages relationnels ou les ventes Retail ne sont pas activés pour cette entreprise.",
  RELATIONSHIP_BENEFIT_OMNICHANNEL_CONTEXT_MISMATCH: "Le client ou la devise de cette commande ne correspond pas à l’avantage relationnel.",
  RELATIONSHIP_BENEFIT_OMNICHANNEL_IDEMPOTENCY_COLLISION: "Cet avantage a déjà été enregistré pour une autre opération. Actualisez avant de réessayer.",
  RELATIONSHIP_BENEFIT_OMNICHANNEL_EFFECT_UNSUPPORTED: "Cet avantage n’est plus éligible à une remise automatique Retail.",
  RELATIONSHIP_BENEFIT_OMNICHANNEL_PARTY_MISMATCH: "Le bénéficiaire n’est plus lié au client de cette commande.",
  RELATIONSHIP_BENEFIT_OMNICHANNEL_AMOUNT_INVALID: "Le montant de l’avantage a changé. Rechargez le panier avant de confirmer.",
  RETAIL_TENDER_TOTAL_MISMATCH: "Les paiements doivent correspondre exactement au total du ticket.",
  RETAIL_FINANCIAL_ACCOUNT_INVALID: "Le compte financier sélectionné ne correspond pas au type ou à la devise attendus.",
  RETAIL_FINANCIAL_ACCOUNT_SITE_MISMATCH: "Le compte d'encaissement appartient à une autre boutique. Choisissez un compte affecté à ce point de vente.",
  RETAIL_OPEN_CASH_SESSION_REQUIRED: "Ouvrez votre session de caisse sur ce compte avant de faire cette opération cash.",
  RETAIL_INSUFFICIENT_BALANCE: "Le solde opérationnel disponible est insuffisant pour cette opération.",
  RETAIL_PROVIDER_NOT_FOUND: "L’opérateur sélectionné n’est pas actif pour ce type d’opération.",
  RETAIL_FLOAT_ACCOUNT_REQUIRED: "L’opérateur doit être lié à un vrai compte de float avant la première opération.",
  RETAIL_MOBILE_MONEY_CURRENCY_ACCOUNT_REQUIRED: "Configurez un wallet Mobile Money pour cet opérateur dans la devise de la caisse avant de continuer.",
  RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED: "Configurez un compte opérateur Télécom dans la devise d’encaissement avant de continuer.",
  RETAIL_MOBILE_MONEY_FX_PAIR_INVALID: "Choisissez deux devises différentes pour le transfert Mobile Money.",
  RETAIL_MOBILE_MONEY_FX_MAPPING_REQUIRED: "Cet opérérateur doit disposer de deux wallets Mobile Money configurés avant un transfert entre devises.",
  RETAIL_MOBILE_MONEY_FX_AMOUNT_INVALID: "Le montant à convertir doit être strictement positif.",
  RETAIL_MOBILE_MONEY_FX_TRANSFER_NOT_FOUND: "Le transfert Mobile Money demandé est introuvable.",
  RETAIL_MOBILE_MONEY_FX_TRANSFER_CONFLICT: "Ce transfert Mobile Money a déjà changé d’état. Actualisez avant de réessayer.",
  RETAIL_SALE_NOT_FOUND: "Le ticket demandé est introuvable.",
  RETAIL_SALE_IDEMPOTENCY_COLLISION: "Cette référence de vente appartient déjà à un autre ticket ou dépôt. Actualisez la vente avant de recommencer.",
  RETAIL_SALE_NOT_RETURNABLE: "Ce ticket ne peut plus faire l’objet d’un retour.",
  RETAIL_SALE_ALREADY_REVERSED: "Ce ticket a déjà été annulé ou a été modifié depuis votre dernière lecture.",
  RETAIL_TRANSACTION_NOT_FOUND: "L’opération Mobile Money est introuvable.",
  RETAIL_TRANSACTION_CONFLICT: "Cette opération Mobile Money a déjà changé d’état.",
  RETAIL_TOPUP_NOT_FOUND: "La recharge Télécom est introuvable.",
  RETAIL_TOPUP_CONFLICT: "Cette recharge ne peut plus être modifiée avec cette version.",
  RETAIL_CLOSE_NOT_FOUND: "La clôture demandée est introuvable.",
  RETAIL_CLOSE_CONFLICT: "La clôture ou une session de caisse liée a changé d’état.",
  RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN: "La personne ayant soumis la clôture ne peut pas la valider.",
  RETAIL_CLOSE_APPROVER_REQUIRED: "Choisissez le validateur Finance qui contrôlera les caisses de cette clôture.",
  ACCOUNTING_APPROVER_NOT_ELIGIBLE: "Le validateur sélectionné n’est plus autorisé pour ces caisses. Choisissez un validateur proposé par DTSC.",
  ACCOUNTING_APPROVAL_NOT_ASSIGNED: "Une caisse de cette clôture n’a pas encore de validateur affecté. Affectez-en un depuis le module Caisse avant de décider la clôture.",
  ACCOUNTING_APPROVAL_ALREADY_PENDING: "Une validation active existe déjà pour cette caisse. Rechargez les données pour voir l’affectation actuelle.",
  ACCOUNTING_APPROVER_NOT_ALLOWED: "Une caisse de cette clôture est affectée à un autre validateur.",
  ACCOUNTING_SELF_APPROVAL_FORBIDDEN: "L’auto-validation n’est pas autorisée pour cette caisse. Un autre validateur doit intervenir.",

  RETAIL_CASH_COUNT_TOTAL_MISMATCH: "Le total des coupures doit correspondre au montant de caisse déclaré.",
  RETAIL_VARIANCE_REASON_REQUIRED: "Tout écart de caisse ou de float doit être justifié avant soumission.",
  CASH_ACCOUNT_INVALID: "Le compte choisi n’est pas une caisse active de cette entreprise.",
  CASH_SESSION_ALREADY_ACTIVE: "Cette caisse est déjà ouverte ou en attente de validation. Utilisez la session existante ou choisissez une autre caisse.",
  CASH_SESSION_NOT_FOUND: "Cette session de caisse est introuvable. Actualisez la page avant de réessayer.",
  CASH_SESSION_NOT_OWNED: "Vous ne pouvez clôturer que vos propres sessions de caisse.",
  CASH_SESSION_CONFLICT: "Cette caisse a changé d’état depuis votre dernière lecture. Actualisez avant de réessayer.",
  CASH_COUNT_TOTAL_MISMATCH: "Le total calculé à partir des coupures ne correspond pas au montant compté. Vérifiez le comptage.",
  CASH_DISCREPANCY_REASON_REQUIRED: "Un motif est obligatoire lorsque le montant compté diffère du théorique de la caisse.",
  CASH_SESSION_SELF_VALIDATION_FORBIDDEN: "La personne qui tient la caisse ne peut pas approuver elle-même sa clôture.",
  CASH_REJECTION_REASON_REQUIRED: "Un motif est obligatoire pour rejeter une clôture de caisse.",
  RETAIL_DUPLICATE: "Une même référence ne peut apparaître deux fois dans cette opération.",
  RETAIL_PHONE_INVALID: "Saisissez un numéro au format international avec l’indicatif du pays.",
  RETAIL_EXTERNAL_REFERENCE_REQUIRED: "La référence opérateur est obligatoire pour confirmer cette opération.",
  RETAIL_EXTERNAL_REFERENCE_DUPLICATE: "Cette référence opérateur a déjà été enregistrée pour cet opérateur.",
  RETAIL_PRICE_NOT_CONFIGURED: "Aucun prix de vente applicable n’est configuré pour un article du ticket.",
  RETAIL_TAX_CONFIGURATION_REQUIRED: "Un article taxable n’est pas correctement relié au référentiel fiscal de l’entreprise.",
  RETAIL_TAX_RATE_REQUIRED: "Aucun taux fiscal actif n’est applicable à la date de l’opération.",
  RETAIL_PRICE_OVERRIDE_FORBIDDEN: "Vous n’êtes pas autorisé à déroger au prix résolu par le moteur Retail.",
  RETAIL_DISCOUNT_OVERRIDE_FORBIDDEN: "Vous n’êtes pas autorisé à modifier manuellement la remise calculée.",
  RETAIL_TAX_OVERRIDE_FORBIDDEN: "Vous n’êtes pas autorisé à modifier manuellement la taxe calculée.",
  RETAIL_TAX_INCLUDED_OVERRIDE_FORBIDDEN: "Une taxe incluse dans le prix ne peut pas être modifiée manuellement sur ce ticket.",
  RETAIL_PRICE_OVERRIDE_REASON_REQUIRED: "Précisez le motif de la dérogation de prix, remise ou taxe.",
  RETAIL_RETURN_LINE_INVALID: "Une ligne sélectionnée n’appartient pas au ticket d’origine.",
  RETAIL_RETURN_QUANTITY_EXCEEDED: "La quantité demandée dépasse la quantité encore disponible pour retour.",
  RETAIL_RETURN_STOCK_DISPOSITION_INVALID: "Cette ligne ne peut pas être réintégrée en stock avec la disposition choisie.",
  RETAIL_RETURN_NOT_FOUND: "La demande de retour est introuvable.",
  RETAIL_RETURN_IDEMPOTENCY_COLLISION: "Cette référence de retour a déjà été utilisée pour un autre ticket. Rechargez le formulaire avant de réessayer.",
  RETAIL_RETURN_CONFLICT: "La demande de retour a déjà changé d’état. Actualisez-la avant de réessayer.",
  RETAIL_RETURN_SELF_APPROVAL_FORBIDDEN: "La personne qui demande le retour ne peut pas approuver elle-même le remboursement.",
  RETAIL_EXCHANGE_SALE_INVALID: "Le ticket de remplacement choisi n’est pas compatible avec cet échange.",
  RETAIL_REFUND_ACCOUNT_INVALID: "Le compte choisi ne peut pas être utilisé pour ce remboursement ou cette devise.",
  RETAIL_REFUND_AMOUNT_INVALID: "Le montant du remboursement doit être positif et cohérent avec le retour.",
  RETAIL_REFUND_TOTAL_MISMATCH: "Le total remboursé ne correspond pas au montant validé du retour.",
  RETAIL_RETURN_PRODUCT_CONDITION_INVALID: "L’état du produit retourné n’est pas reconnu.",
  RETAIL_CUSTOMER_INVALID: "Le client sélectionné n’existe pas comme client actif dans le CRM de cette entreprise.",
  RETAIL_LOYALTY_PROGRAM_NOT_FOUND: "Le programme de fidélité est introuvable.",
  RETAIL_LOYALTY_PROGRAM_INACTIVE: "Le programme de fidélité n’est pas actif à cette date.",
  RETAIL_LOYALTY_ACCOUNT_INACTIVE: "Le compte de fidélité du client n’est pas actif.",
  RETAIL_LOYALTY_CURRENCY_MISMATCH: "La devise de fidélité ne correspond pas à la devise du programme.",
  RETAIL_LOYALTY_CUSTOMER_MISMATCH: "Le compte fidélité ne correspond pas au client du ticket.",
  RETAIL_LOYALTY_BALANCE_INSUFFICIENT: "Le solde de points disponible est insuffisant pour cette utilisation.",
  RETAIL_STORED_VALUE_NOT_FOUND: "La carte cadeau ou l’avoir est introuvable.",
  RETAIL_STORED_VALUE_INACTIVE: "La carte cadeau ou l’avoir n’est pas utilisable dans son état actuel.",
  RETAIL_STORED_VALUE_EXPIRED: "La carte cadeau ou l’avoir a expiré.",
  RETAIL_STORED_VALUE_EXPIRY_INVALID: "La date d’expiration doit être future.",
  RETAIL_STORED_VALUE_CURRENCY_MISMATCH: "La devise de la carte cadeau ou de l’avoir ne correspond pas à l’opération.",
  RETAIL_STORED_VALUE_INSUFFICIENT: "Le solde de la carte cadeau ou de l’avoir est insuffisant.",
  RETAIL_PAYMENT_NOT_FOUND: "La transaction de paiement est introuvable.",
  RETAIL_PAYMENT_CURRENCY_MISMATCH: "La devise du paiement ne correspond pas à la vente ou au retour.",
  RETAIL_PAYMENT_CONFLICT: "La transaction de paiement a changé d’état. Actualisez avant de réessayer.",
  RETAIL_PAYMENT_TRANSITION_INVALID: "Cette transition d’état de paiement n’est pas autorisée.",
  RETAIL_PROVIDER_OPERATION_NOT_FOUND: "L’opération provider est introuvable.",
  RETAIL_PROVIDER_OPERATION_CONFLICT: "L’opération provider a changé d’état. Actualisez avant de réessayer.",
  RETAIL_PROVIDER_OPERATION_TRANSITION_INVALID: "Cette transition d’état provider n’est pas autorisée.",
  RETAIL_DEVICE_NOT_FOUND: "Le périphérique POS configuré est introuvable.",
  RETAIL_ORGANIZATION_NOT_FOUND: "L’entreprise Retail est introuvable.",
  NEGATIVE_STOCK_FORBIDDEN: "Le stock disponible est insuffisant pour terminer cette vente.",
  INVENTORY_BALANCE_CONFLICT: "Le stock a changé pendant l’opération. Actualisez les disponibilités et réessayez.",
};

type RetailMutationRateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export function getRetailMutationRateLimitPolicy(
  moduleCode: RetailModuleCode,
  action: EnterpriseModuleAction,
  requestedLimit?: number,
): RetailMutationRateLimitPolicy {
  if (moduleCode === "RETAIL_POS" && action === "submit") {
    return { limit: requestedLimit || 300, windowMs: 5 * 60 * 1000 };
  }
  if ((moduleCode === "MOBILE_MONEY_AGENCY" || moduleCode === "TELCO_TOPUPS") && action === "submit") {
    return { limit: requestedLimit || 300, windowMs: 15 * 60 * 1000 };
  }
  if (moduleCode === "RETAIL_DAILY_CLOSE") {
    return { limit: requestedLimit || 60, windowMs: 60 * 60 * 1000 };
  }
  return { limit: requestedLimit || 120, windowMs: 60 * 60 * 1000 };
}

export async function authorizeRetailRequest(
  req: Request,
  organizationId: string,
  moduleCode: RetailModuleCode,
  action: EnterpriseModuleAction,
  options?: { mutation?: boolean; limit?: number; includeMutationCapabilities?: boolean },
) {
  if (options?.mutation && !isSameOriginRequest(req)) return { ok: false as const, response: NextResponse.json(retailFailureOutcome(null, { error: "Forbidden" }), { status: 403 }) };
  const session = await getSession();
  if (!session) return { ok: false as const, response: NextResponse.json(retailFailureOutcome(null, { error: "Unauthorized" }), { status: 401 }) };
  const access = await getEnterpriseCommonDomainAccess({
    session,
    organizationId,
    moduleCode,
    action,
    includeMutationCapabilities: options?.includeMutationCapabilities ?? true,
  });
  if (!access) return { ok: false as const, response: NextResponse.json(retailFailureOutcome(null, { error: "Forbidden" }), { status: 403 }) };
  if (options?.mutation) {
    const policy = getRetailMutationRateLimitPolicy(moduleCode, action, options.limit);
    const key = getRateLimitKey(req, `retail:${moduleCode}:${action}:${organizationId}:${session.userId}`);
    const limited = await rateLimit(key, policy.limit, policy.windowMs);
    if (!limited.ok) return { ok: false as const, response: NextResponse.json(retailFailureOutcome(null, { error: "Too many requests", message: "Trop d’opérations sur une courte période." }), { status: 429 }) };
  }
  return { ok: true as const, session, access };
}

export function retailErrorResponse(error: unknown, fallback = "RETAIL_OPERATION_FAILED") {
  if (error instanceof EnterpriseRetailError) {
    const message = ERROR_MESSAGES[error.code]
      || (error.code.startsWith("RELATIONSHIP_BENEFIT_OMNICHANNEL_")
        ? "Cet avantage n’est plus éligible à cette commande (relation, quota ou conditions modifiés). Actualisez le panier avant de réessayer."
        : "L’opération Retail n’a pas pu être terminée.");
    return NextResponse.json(
      retailFailureOutcome(null, { error: error.code, message, details: error.details }),
      { status: error.status },
    );
  }
  if (error instanceof EnterpriseAccountingError) {
    return NextResponse.json(
      retailFailureOutcome(null, {
        error: error.code,
        message: ERROR_MESSAGES[error.code] || "La comptabilisation de l’opération RETAIL n’est pas prête ou n’a pas pu être finalisée. Vérifiez la configuration Finance, les comptes et la valorisation du stock.",
        details: error.details,
      }),
      { status: error.status },
    );
  }
  if (error instanceof EnterpriseDomainError) {
    return NextResponse.json(
      retailFailureOutcome(null, { error: error.code, message: ERROR_MESSAGES[error.code] || error.message || "L’opération métier n’a pas pu être terminée." }),
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
    return NextResponse.json(
      retailFailureOutcome(null, { error: "RETAIL_DUPLICATE", message: "Cette opération existe déjà ou sa référence est déjà utilisée." }),
      { status: 409 },
    );
  }
  return NextResponse.json(
    retailFailureOutcome(null, { error: fallback, message: "L’opération n’a pas pu être terminée. Vérifiez les données et réessayez." }),
    { status: 500 },
  );
}

export function retailListParams(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 30)));
  const search = (url.searchParams.get("search") || "").trim();
  const status = (url.searchParams.get("status") || "").trim().toUpperCase();
  const providerCode = (url.searchParams.get("providerCode") || "").trim().toUpperCase();
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  const from = fromValue ? new Date(fromValue) : null;
  const to = toValue ? new Date(toValue) : null;
  return { page, pageSize, search, status, providerCode, from: from && !Number.isNaN(from.getTime()) ? from : null, to: to && !Number.isNaN(to.getTime()) ? to : null };
}
