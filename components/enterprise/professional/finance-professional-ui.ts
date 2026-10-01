"use client";

import type { StatusBadgeTone } from "@/components/workspace/status-badge";

export type FinanceLocale = "fr" | "en";

const STATUS_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    DRAFT: "Brouillon", SUBMITTED: "Soumis", IN_REVIEW: "En revue", PENDING_REVIEW: "En attente de revue", REVIEWED: "Revu",
    PENDING_APPROVAL: "En attente de validation", APPROVED: "Approuvé", ISSUED: "Émis", POSTED: "Comptabilisé", PARTIALLY_PAID: "Partiellement payé",
    PAID: "Payé", OVERDUE: "En retard", DISPUTED: "En litige", WRITTEN_OFF: "Passé en irrécouvrable", CANCELLED: "Annulé", VOID: "Invalidé", VOIDED: "Invalidé",
    CREDIT_NOTE: "Avoir", REJECTED: "Refusé", RETURNED: "Renvoyé pour correction", CONFIRMED: "Confirmé", PARTIALLY_ALLOCATED: "Partiellement affecté",
    ALLOCATED: "Affecté", UNALLOCATED: "Non affecté", RECONCILED: "Rapproché", UNRECONCILED: "Non rapproché", REVERSED: "Contrepassé",
    ACTIVE: "Actif", INACTIVE: "Inactif", SUSPENDED: "Suspendu", OPEN: "Ouverte", CLOSING: "Clôture en préparation", PENDING_VALIDATION: "En attente de validation",
    VALIDATED: "Validée", SOFT_CLOSED: "Clôture provisoire", CLOSED: "Fermé", LOCKED: "Verrouillé", PREPARED: "Préparé", IN_PROGRESS: "En cours",
    COMPLETED: "Terminé", EXECUTED: "Exécuté", FAILED: "Échec", IMPORTED: "Importé", READY: "Prêt", BLOCKED: "Bloqué", PUBLISHED: "Publié", DEPRECATED: "Remplacé",
    REOPENED: "Réouvert", MATCHED: "Rapproché", UNMATCHED: "À rapprocher", PENDING: "En attente", PLANNED: "Planifié"
  },
  en: {
    DRAFT: "Draft", SUBMITTED: "Submitted", IN_REVIEW: "In review", PENDING_REVIEW: "Pending review", REVIEWED: "Reviewed", PENDING_APPROVAL: "Pending approval",
    APPROVED: "Approved", ISSUED: "Issued", POSTED: "Posted", PARTIALLY_PAID: "Partially paid", PAID: "Paid", OVERDUE: "Overdue", DISPUTED: "Disputed",
    WRITTEN_OFF: "Written off", CANCELLED: "Cancelled", VOID: "Voided", VOIDED: "Voided", CREDIT_NOTE: "Credit note", REJECTED: "Rejected", RETURNED: "Returned for correction",
    CONFIRMED: "Confirmed", PARTIALLY_ALLOCATED: "Partially allocated", ALLOCATED: "Allocated", UNALLOCATED: "Unallocated", RECONCILED: "Reconciled", UNRECONCILED: "Unreconciled",
    REVERSED: "Reversed", ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended", OPEN: "Open", CLOSING: "Closing", PENDING_VALIDATION: "Pending validation",
    VALIDATED: "Validated", SOFT_CLOSED: "Soft closed", CLOSED: "Closed", LOCKED: "Locked", PREPARED: "Prepared", IN_PROGRESS: "In progress", COMPLETED: "Completed",
    EXECUTED: "Executed", FAILED: "Failed", IMPORTED: "Imported", READY: "Ready", BLOCKED: "Blocked", PUBLISHED: "Published", DEPRECATED: "Superseded", REOPENED: "Reopened",
    MATCHED: "Matched", UNMATCHED: "To reconcile", PENDING: "Pending", PLANNED: "Planned"
  }
};

const METRIC_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    hasFunctionalCurrency: "Devise configurée", hasFiscalYear: "Exercice actif", hasOpenPeriod: "Période ouverte", hasChartOfAccounts: "Plan comptable disponible",
    hasSalesJournal: "Journal des ventes configuré", hasPurchaseJournal: "Journal des achats configuré", hasFinancialAccount: "Compte bancaire ou caisse disponible",
    hasTaxConfiguration: "Règles de taxes configurées", ledgerReady: "Comptabilisation prête", openReceivables: "Créances ouvertes", overdueReceivables: "Créances en retard",
    openPayables: "Dettes ouvertes", overduePayables: "Dettes en retard", unallocatedPayments: "Paiements non affectés", availableTreasury: "Trésorerie disponible",
    openCashSessions: "Caisses ouvertes", pendingReconciliations: "Rapprochements en attente", invoicesToPost: "Factures non comptabilisées", pendingApprovals: "Opérations à valider"
  },
  en: {
    hasFunctionalCurrency: "Functional currency configured", hasFiscalYear: "Active fiscal year", hasOpenPeriod: "Open period", hasChartOfAccounts: "Chart of accounts available",
    hasSalesJournal: "Sales journal configured", hasPurchaseJournal: "Purchase journal configured", hasFinancialAccount: "Bank or cash account available", hasTaxConfiguration: "Tax rules configured",
    ledgerReady: "Posting ready", openReceivables: "Open receivables", overdueReceivables: "Overdue receivables", openPayables: "Open payables", overduePayables: "Overdue payables",
    unallocatedPayments: "Unallocated payments", availableTreasury: "Available treasury", openCashSessions: "Cash sessions open", pendingReconciliations: "Pending reconciliations",
    invoicesToPost: "Invoices not posted", pendingApprovals: "Operations awaiting approval"
  }
};

const ENUM_LABELS: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    WEIGHTED_AVERAGE: "Coût moyen pondéré", FIFO: "Premier entré, premier sorti", CASH: "Caisse", BANK: "Compte bancaire", MOBILE_MONEY: "Portefeuille électronique",
    CLEARING: "Compte de transit", INBOUND: "Encaissement", OUTBOUND: "Décaissement", CUSTOMER_PAYMENT: "Encaissement client", SUPPLIER_PAYMENT: "Paiement fournisseur",
    CUSTOMER_REFUND: "Remboursement client", SUPPLIER_REFUND: "Remboursement fournisseur", PAYROLL_PAYMENT: "Paiement de paie", EXPENSE_REIMBURSEMENT: "Remboursement de dépense",
    TAX_PAYMENT: "Paiement fiscal", REFUND: "Remboursement", TRANSFER: "Transfert", FUNDING: "Financement", FUNDING_REVERSAL: "Contrepassation de financement", CAPITAL_CONTRIBUTION: "Apport en capital", SHAREHOLDER_ADVANCE: "Avance d’associé", LOAN_DRAW: "Emprunt reçu", OTHER: "Autre", BANK_TRANSFER: "Virement bancaire", CARD: "Carte", CHEQUE: "Chèque", CREDIT: "Crédit",
    ASSET: "Actif", LIABILITY: "Passif", EQUITY: "Capitaux propres", REVENUE: "Produit", EXPENSE: "Charge", OTHER_INCOME: "Autre produit", OTHER_EXPENSE: "Autre charge",
    ACCOUNTS_RECEIVABLE: "Créances clients", FIXED_ASSET: "Immobilisations", ACCUMULATED_DEPRECIATION: "Amortissements cumulés", ACCOUNTS_PAYABLE: "Dettes fournisseurs",
    TAX_PAYABLE: "Taxes à payer", PAYROLL_PAYABLE: "Dettes salariales", RETAINED_EARNINGS: "Résultats reportés", TAX_RECEIVABLE: "Taxes à récupérer",
    COST_OF_SALES: "Coût des ventes", OPERATING_EXPENSE: "Charges d’exploitation",
    SALES: "Ventes", PURCHASES: "Achats", PAYROLL: "Paie", INVENTORY: "Stocks", ASSETS: "Immobilisations", TAX: "Fiscalité", OPENING: "Ouverture", ADJUSTMENT: "Ajustement", GENERAL: "Opérations générales",
    BALANCE_SHEET: "Bilan", INCOME_STATEMENT: "Compte de résultat", DEBIT: "Débit", CREDIT_BALANCE: "Crédit"
  },
  en: {
    WEIGHTED_AVERAGE: "Weighted average", FIFO: "First in, first out", CASH: "Cash", BANK: "Bank account", MOBILE_MONEY: "Electronic wallet", CLEARING: "Clearing account",
    INBOUND: "Receipt", OUTBOUND: "Disbursement", CUSTOMER_PAYMENT: "Customer receipt", SUPPLIER_PAYMENT: "Supplier payment", CUSTOMER_REFUND: "Customer refund", SUPPLIER_REFUND: "Supplier refund",
    PAYROLL_PAYMENT: "Payroll payment", EXPENSE_REIMBURSEMENT: "Expense reimbursement", TAX_PAYMENT: "Tax payment", REFUND: "Refund", TRANSFER: "Transfer", FUNDING: "Funding", FUNDING_REVERSAL: "Funding reversal", CAPITAL_CONTRIBUTION: "Capital contribution", SHAREHOLDER_ADVANCE: "Shareholder advance", LOAN_DRAW: "Loan proceeds", OTHER: "Other",
    BANK_TRANSFER: "Bank transfer", CARD: "Card", CHEQUE: "Cheque", CREDIT: "Credit", ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", REVENUE: "Revenue", EXPENSE: "Expense",
    ACCOUNTS_RECEIVABLE: "Accounts receivable", FIXED_ASSET: "Fixed assets", ACCUMULATED_DEPRECIATION: "Accumulated depreciation", ACCOUNTS_PAYABLE: "Accounts payable",
    TAX_PAYABLE: "Tax payable", PAYROLL_PAYABLE: "Payroll payable", RETAINED_EARNINGS: "Retained earnings", TAX_RECEIVABLE: "Tax receivable",
    COST_OF_SALES: "Cost of sales", OPERATING_EXPENSE: "Operating expenses",
    OTHER_INCOME: "Other income", OTHER_EXPENSE: "Other expense", SALES: "Sales", PURCHASES: "Purchases", PAYROLL: "Payroll", INVENTORY: "Inventory", ASSETS: "Fixed assets", TAX: "Tax",
    OPENING: "Opening", ADJUSTMENT: "Adjustment", GENERAL: "General operations", BALANCE_SHEET: "Balance sheet", INCOME_STATEMENT: "Income statement", DEBIT: "Debit", CREDIT_BALANCE: "Credit"
  }
};

export const FINANCE_ERROR_MESSAGES: Record<FinanceLocale, Record<string, string>> = {
  fr: {
    PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED: "Le montant affecté dépasse la partie encore disponible de ce paiement.",
    FINANCE_INPUT_INVALID: "Certaines informations sont invalides ou incomplètes. Corrigez les champs signalés puis réessayez.",
    FINANCE_DECISION_REASON_TOO_SHORT: "Le motif de cette décision doit contenir au moins 4 caractères.",
    FINANCE_DECISION_REASON_TOO_LONG: "Le motif de cette décision ne peut pas dépasser 1 000 caractères.",
    PAYMENT_NOT_FOUND: "Ce paiement n’existe pas ou n’est plus disponible dans cette entreprise.",
    PAYMENT_REVISION_CONFLICT: "Ce paiement a changé entre-temps. Actualisez les données avant de réessayer.",
    PAYMENT_TRANSITION_INVALID: "Cette action n’est pas autorisée dans l’état actuel du paiement. Actualisez le paiement puis vérifiez son statut.",
    PAYMENT_SUBMITTER_MISMATCH: "Seule la personne qui a préparé ce paiement peut le soumettre à validation.",
    PAYMENT_CANCEL_ACTOR_FORBIDDEN: "Seule la personne qui a préparé ce paiement peut l’annuler tant qu’il est en cours de validation.",
    PAYMENT_FINANCIAL_ACCOUNT_REQUIRED: "Sélectionnez un compte financier actif avant de confirmer ce paiement.",
    PAYMENT_FINANCIAL_ACCOUNT_INVALID: "Le compte financier sélectionné n’est plus actif ou ne correspond pas à ce paiement.",
    PAYMENT_METHOD_ACCOUNT_MISMATCH: "Le type du compte financier ne correspond pas au moyen de paiement sélectionné.",
    OPEN_CASH_SESSION_REQUIRED: "Aucune caisse ouverte compatible n’est disponible pour ce paiement en espèces. Ouvrez une caisse sur le compte sélectionné puis réessayez.",
    PAYMENT_CASH_SESSION_INVALID: "La caisse rattachée à ce paiement ne correspond plus au compte financier attendu. Ouvrez une caisse compatible puis réessayez.",
    PAYMENT_CASH_SESSION_AMBIGUOUS: "Plusieurs caisses sont ouvertes sur ce compte et aucune ne peut être choisie automatiquement. Utilisez la caisse du confirmateur ou fermez les caisses concurrentes, puis réessayez.",
    PAYMENT_CASH_SESSION_PENDING_VALIDATION: "La caisse précédemment liée à ce paiement est en attente de validation de clôture. Ouvrez une nouvelle caisse compatible sur le même compte puis confirmez à nouveau.",
    PAYMENT_CASH_SESSION_CLOSING: "La caisse précédemment liée à ce paiement est en cours de clôture. Terminez la clôture ou ouvrez une nouvelle caisse autorisée sur le même compte, puis réessayez.",
    PAYMENT_CASH_SESSION_CLOSED: "La caisse précédemment liée à ce paiement est fermée. Ouvrez une nouvelle caisse compatible sur le même compte puis réessayez.",
    PAYMENT_NOT_APPROVED: "Ce paiement doit être approuvé avant sa confirmation. Rechargez-le et vérifiez son statut.",
    PAYMENT_SELF_CONFIRMATION_FORBIDDEN: "La confirmation doit être effectuée par une troisième personne autorisée, différente de l’initiateur et du validateur du paiement.",
    REFUND_PAYMENT_SELF_CONFIRMATION_FORBIDDEN: "La confirmation du remboursement doit être effectuée par une troisième personne autorisée, différente de l’initiateur et du validateur.",
    PAYMENT_CASH_SESSION_BINDING_REQUIRED: "Ce paiement en espèces récent n’est rattaché à aucune caisse. Créez-le depuis une caisse ouverte ou corrigez son rattachement avant de confirmer.",
    PAYMENT_CASH_SESSION_LEGACY_RECOVERY: "Paiement historique : lors de la confirmation, le système vérifiera une caisse ouverte compatible et récupérera le rattachement si cela peut être fait sans ambiguïté.",
    PAYMENT_GAMING_SCOPE_INVALID: "Ce paiement ne correspond plus au client ou à la devise du checkout Gaming lié. Rechargez les données avant de continuer.",
    PAYMENT_GAMING_CONVERGENCE_FAILED: "Le paiement a été confirmé, mais la mise à jour de l’encaissement Gaming n’a pas pu être terminée. Réessayez la confirmation pour relancer la synchronisation.",
    SALES_INVOICE_NOT_FOUND: "Cette facture client n’existe pas ou n’est plus disponible dans cette entreprise.",
    SALES_INVOICE_REVISION_CONFLICT: "Cette facture client a changé entre-temps. Actualisez les données avant de réessayer.",
    SALES_INVOICE_TRANSITION_INVALID: "Cette action n’est pas autorisée dans l’état actuel de la facture. Actualisez la facture puis vérifiez son statut.",
    SALES_INVOICE_SUBMITTER_MISMATCH: "Seule la personne qui a préparé cette facture peut la soumettre à validation.",
    CASH_SESSION_NOT_FOUND: "Cette session de caisse n’existe pas ou n’est plus disponible.",
    CASH_SESSION_ALREADY_ACTIVE: "Une caisse est déjà ouverte ou en cours de clôture sur ce compte pour ce caissier. Utilisez cette caisse ou terminez sa clôture avant d’en ouvrir une autre.",
    CASH_SESSION_CONFLICT: "Cette caisse a changé entre-temps. Actualisez les données avant de réessayer.",
    CASH_REJECTION_REASON_REQUIRED: "Indiquez un motif de refus d’au moins 4 caractères.",
    CASH_COUNT_TOTAL_MISMATCH: "Le total du comptage physique ne correspond pas au montant de clôture saisi.",
    CASH_DISCREPANCY_REASON_REQUIRED: "Un motif est obligatoire lorsqu’un écart de caisse est constaté.",
    ACCOUNTING_APPROVAL_CONFLICT: "Cette validation a déjà changé. Actualisez les données avant de prendre une nouvelle décision.",
    FINANCE_PERIOD_CLOSED: "Cette période financière est fermée. Choisissez une période ouverte ou demandez une réouverture autorisée.",
    SELF_APPROVAL_FORBIDDEN: "Une autre personne autorisée doit approuver cette opération.",
    ACCOUNTING_SELF_APPROVAL_FORBIDDEN: "Vous ne pouvez pas valider votre propre opération. Affectez-la à une autre personne autorisée.",
    ACCOUNTING_APPROVER_NOT_ELIGIBLE: "La personne sélectionnée ne peut pas valider cette opération. Choisissez un responsable autorisé.",
    ACCOUNTING_APPROVER_NOT_ALLOWED: "Cette validation est affectée à une autre personne autorisée.",
    ACCOUNTING_APPROVAL_ALREADY_PENDING: "Une validation est déjà en attente pour cette opération.",
    ACCOUNTING_APPROVAL_NOT_ASSIGNED: "Aucune validation en attente n’est affectée à cette opération.",
    ACCOUNTING_APPROVAL_TARGET_UNSUPPORTED: "Ce type d’opération ne prend pas encore en charge l’affectation de validation.",
    ACCOUNTING_QUEUED_APPROVAL_NOT_FOUND: "L’étape de validation suivante n’est pas disponible. Actualisez le dossier puis réessayez.",
    FINANCIAL_CLOSE_SELF_APPROVAL_FORBIDDEN: "Une autre personne autorisée doit approuver cette clôture.",
    FINANCIAL_CLOSE_SELF_CLOSE_FORBIDDEN: "Une autre personne autorisée doit finaliser cette clôture.",
    THREE_WAY_MATCH_VARIANCE_UNRESOLVED: "La facture présente encore des écarts avec la commande ou la réception.",
    POSTING_MAPPING_MISSING: "Un compte comptable requis n’est pas encore configuré pour cette opération.",
    ACCOUNT_MAPPING_NOT_FOUND: "Un compte comptable nécessaire manque dans la configuration de l’entreprise.",
    CHART_OF_ACCOUNTS_NOT_FOUND: "Ce plan comptable n’existe pas dans cette entreprise.",
    CHART_OF_ACCOUNTS_REVISION_CONFLICT: "Ce plan comptable a changé entre-temps. Actualisez-le avant de recommencer.",
    CHART_OF_ACCOUNTS_CODE_LOCKED: "Le code du plan est verrouillé dès qu’il contient des groupes ou des comptes. Ses libellés restent modifiables.",
    CHART_OF_ACCOUNTS_DELETE_BLOCKED: "Seul un plan personnalisé brouillon et totalement vide peut être supprimé.",
    TEMPLATE_LEDGER_ACCOUNT_IMMUTABLE: "Ce compte provient du template comptable officiel. Créez un sous-compte personnalisé pour l’adapter.",
    LEDGER_ACCOUNT_STRUCTURE_IN_USE: "Ce compte est déjà utilisé. Ses éléments structurels ne peuvent plus être modifiés.",
    ACCOUNT_MAPPING_KEY_INVALID: "Cette règle comptable n’existe pas dans le registre autorisé.",
    ACCOUNT_MAPPING_ACCOUNT_INVALID: "Le compte cible n’est plus actif ou n’appartient pas à cette entreprise.",
    ACCOUNT_MAPPING_CHART_MISMATCH: "Choisissez un compte appartenant au même plan comptable que la règle.",
    ACCOUNT_MAPPING_TEMPLATE_MANAGED: "Cette règle est gérée par un template comptable publié et reste en lecture seule.",
    ACCOUNT_MAPPING_CHART_NOT_CONFIGURABLE: "Le plan lié à cette règle n’est plus configurable.",
    ACCOUNT_MAPPING_ACCOUNT_TYPE_INCOMPATIBLE: "Le type du compte choisi n’est pas compatible avec cette règle.",
    ACCOUNT_MAPPING_ACCOUNT_SUBTYPE_INCOMPATIBLE: "Le sous-type du compte choisi n’est pas compatible avec cette règle.",
    ACCOUNT_MAPPING_ACTIVE_EXISTS: "Une règle active de cette nature existe déjà dans ce plan. Modifiez-la ou désactivez-la.",
    ACCOUNT_MAPPING_RECORD_NOT_FOUND: "Cette règle comptable n’existe plus dans cette entreprise.",
    ACCOUNT_MAPPING_REVISION_CONFLICT: "Cette règle a changé entre-temps. Actualisez-la avant de recommencer.",
    ACCOUNT_MAPPING_DATE_RANGE_INVALID: "La date de fin ne peut pas précéder la date de début.",
    FINANCE_EXCHANGE_RATE_REQUIRED: "Aucun taux de change applicable n’est disponible pour cette date. Ajoutez un taux puis réessayez.",
    FINANCE_EXCHANGE_RATE_INVALID: "Le taux de change doit être supérieur à zéro.",
    FINANCE_EXCHANGE_RATE_PAIR_INVALID: "Choisissez deux devises différentes pour ce taux de change.",
    FINANCE_EXCHANGE_RATE_ACTIVE_VERSION_EXISTS: "Un taux actif existe déjà pour cette paire et cette date. Désactivez-le avant de publier une correction.",
    FINANCE_CURRENCY_NOT_CONFIGURED: "Cette devise n’est pas active dans le référentiel de l’entreprise. Ajoutez-la ou activez-la avant de continuer.",
    FINANCE_CURRENCY_INACTIVE: "Cette devise est désactivée dans le référentiel de l’entreprise. Réactivez-la avant de continuer.",
    FINANCE_CURRENCY_DUPLICATE: "Cette devise existe déjà dans le référentiel de l’entreprise.",
    FINANCE_CURRENCY_NOT_FOUND: "Cette devise n’existe pas dans le référentiel modifiable de l’entreprise.",
    FINANCE_CURRENCY_IN_USE: "Cette devise est encore utilisée. Retirez d’abord ses dépendances Finance avant de la désactiver.",
    FINANCE_CURRENCY_INPUT_INVALID: "Vérifiez le code, le nom, la précision et la règle d’arrondi de la devise.",
    TREASURY_LEDGER_ACCOUNT_INVALID: "Le compte comptable sélectionné n’est plus disponible dans cette entreprise.",
    TREASURY_LEDGER_SUBTYPE_MISMATCH: "Le compte comptable choisi ne correspond pas au type de compte financier.",
    TREASURY_LEDGER_CURRENCY_MISMATCH: "La devise du compte comptable ne correspond pas à la devise du compte financier.",
    TREASURY_RESPONSIBLE_USER_INVALID: "Le responsable sélectionné n’est plus un membre actif de cette entreprise.",
    TREASURY_SITE_INVALID: "Le site sélectionné n’est plus actif dans cette entreprise.",
    TREASURY_ACCOUNT_NOT_FOUND: "Ce compte financier n’existe pas ou a déjà été archivé.",
    TREASURY_ACCOUNT_CONFLICT: "Ce compte a été modifié entre-temps. Rechargez-le avant de recommencer.",
    TREASURY_ACCOUNT_BALANCE_NOT_ZERO: "Ce compte conserve un solde. Transférez ou régularisez ce solde avant de l’archiver.",
    TREASURY_ACCOUNT_ACTIVE_CASH_SESSION: "Une session de caisse est encore ouverte sur ce compte. Clôturez-la avant l’archivage.",
    TREASURY_ACCOUNT_PENDING_TRANSFER: "Un transfert non terminé utilise encore ce compte. Terminez ou annulez ce transfert avant l’archivage.",
    TRANSFER_ACCOUNTS_INVALID: "Sélectionnez deux comptes financiers actifs et différents de cette entreprise.",
    TRANSFER_INSUFFICIENT_OPERATIONAL_BALANCE: "Le solde disponible du compte source est insuffisant pour ce transfert.",
    TRANSFER_NOT_FOUND: "Ce transfert n’existe pas dans cette entreprise.",
    TRANSFER_NOT_APPROVED: "Ce transfert doit être approuvé avant son exécution.",
    TRANSFER_JOURNAL_REQUIRED: "Aucun journal comptable actif ne permet de comptabiliser ce transfert.",
    TRANSFER_APPROVER_NOT_ELIGIBLE: "Le validateur sélectionné n’est plus autorisé pour ce transfert.",
    TRANSFER_APPROVAL_NOT_ASSIGNED: "Aucun validateur n’est encore affecté à ce transfert.",
    TRANSFER_APPROVER_NOT_ALLOWED: "Ce transfert est affecté à un autre validateur autorisé.",
    TRANSFER_SELF_APPROVAL_FORBIDDEN: "L’auto-validation n’est pas autorisée pour ce transfert.",
    TRANSFER_APPROVAL_CONFLICT: "La validation de ce transfert a changé entre-temps. Rechargez les données avant de recommencer.",
    TRANSFER_CONFLICT: "Ce transfert a changé entre-temps. Rechargez les données avant de recommencer.",
    FUNDING_OPERATION_NOT_FOUND: "Ce financement n’existe pas ou n’est plus disponible dans cette entreprise.",
    FUNDING_OPERATION_CONFLICT: "Ce financement a changé entre-temps. Actualisez les données avant de réessayer.",
    FUNDING_OPERATION_NOT_APPROVED: "Ce financement doit être approuvé avant sa confirmation.",
    FUNDING_OPERATION_NOT_REVERSIBLE: "Ce financement n’est plus dans un état permettant sa contrepassation.",
    FUNDING_FINANCIAL_ACCOUNT_INVALID: "Le compte de trésorerie choisi n’est plus actif ou ne correspond plus à ce financement.",
    FUNDING_CASH_SESSION_REQUIRED: "Ouvrez une session de caisse sur le compte sélectionné avant de recevoir ce financement en espèces.",
    FUNDING_CASH_SESSION_INVALID: "La session de caisse choisie n’est plus ouverte ou ne correspond pas au compte destinataire.",
    FUNDING_CASH_SESSION_AMBIGUOUS: "Plusieurs sessions de caisse sont ouvertes sur ce compte. Choisissez explicitement celle qui reçoit les fonds.",
    FUNDING_CASH_SESSION_NOT_ALLOWED: "Une session de caisse ne peut être liée qu’à un financement reçu sur un compte Caisse.",
    FUNDING_COUNTERPART_ACCOUNT_REQUIRED: "Choisissez le compte de passif qui porte la dette envers l’associé.",
    FUNDING_COUNTERPART_ACCOUNT_INVALID: "Le compte de contrepartie doit être un compte de passif actif et comptabilisable de cette entreprise.",
    FUNDING_COUNTERPART_NOT_ALLOWED: "Un compte de dette d’associé ne doit être renseigné que pour une avance d’associé.",
    FUNDING_APPROVER_NOT_ELIGIBLE: "Le validateur sélectionné n’est pas autorisé à valider ce financement.",
    FUNDING_APPROVAL_NOT_ASSIGNED: "Aucun validateur n’est affecté à ce financement.",
    FUNDING_APPROVER_NOT_ALLOWED: "Ce financement est affecté à un autre validateur autorisé.",
    FUNDING_SELF_APPROVAL_FORBIDDEN: "Une autre personne autorisée doit approuver ce financement.",
    FUNDING_APPROVAL_CONFLICT: "La validation de ce financement a changé entre-temps. Actualisez les données.",
    FUNDING_CONFIRMATION_ACTOR_FORBIDDEN: "La confirmation doit être effectuée par une troisième personne autorisée, différente de l’initiateur et du validateur.",
    FUNDING_REVERSAL_ACTOR_FORBIDDEN: "La contrepassation doit être effectuée par une autre personne autorisée, indépendante des acteurs précédents.",
    FUNDING_REVERSAL_INSUFFICIENT_BALANCE: "Le solde actuel du compte est insuffisant pour contrepasser ce financement sans créer un solde négatif.",
    FUNDING_IDEMPOTENCY_CONFLICT: "Cette demande de financement a déjà été utilisée avec des informations différentes. Rechargez puis recommencez.",
    FUNDING_CONFIRMATION_INCONSISTENT: "Ce financement est confirmé mais ses effets financiers sont incomplets. Aucune nouvelle écriture n’a été créée ; contactez un administrateur.",
    FUNDING_POSTED_ENTRY_MISSING: "L’écriture comptable d’origine de ce financement est introuvable ; la contrepassation a été bloquée.",
    FUNDING_OPERATION_NOT_POSTABLE: "Ce financement n’est pas dans un état permettant sa comptabilisation.",
    DUPLICATE_POSTING_ATTEMPT: "Cette opération a déjà été comptabilisée. Aucune écriture en double n’a été créée.",
    POSTING_BATCH_ALREADY_EXISTS: "Cette opération a déjà été traitée. L’écriture existante a été conservée.",
    JOURNAL_ENTRY_UNBALANCED: "Le total des débits doit être égal au total des crédits avant la comptabilisation.",
    REGULATORY_STATEMENT_PERIOD_INVALID: "La période choisie pour l’état financier n’est pas valide.",
    REGULATORY_STATEMENT_TYPE_NOT_SUPPORTED: "Cet état financier n’est pas disponible pour le plan comptable actif.",
    CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION: "Cette nouvelle version nécessite une revue avant application. Consultez l’analyse d’impact puis validez la migration.",
    ACCOUNTING_SETUP_INPUT_INVALID: "Vérifiez les informations de configuration comptable puis réessayez.",
    FINANCE_DUPLICATE: "Une donnée identique existe déjà dans cette entreprise."
  },
  en: {
    PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED: "The allocated amount exceeds the remaining available payment amount.",
    FINANCE_INPUT_INVALID: "Some information is invalid or incomplete. Correct the highlighted fields and try again.",
    FINANCE_DECISION_REASON_TOO_SHORT: "The reason for this decision must contain at least 4 characters.",
    FINANCE_DECISION_REASON_TOO_LONG: "The reason for this decision cannot exceed 1,000 characters.",
    PAYMENT_NOT_FOUND: "This payment does not exist or is no longer available in this company.",
    PAYMENT_REVISION_CONFLICT: "This payment changed in the meantime. Refresh the data before trying again.",
    PAYMENT_TRANSITION_INVALID: "This action is not allowed in the payment’s current state. Refresh the payment and check its status.",
    PAYMENT_SUBMITTER_MISMATCH: "Only the person who prepared this payment can submit it for approval.",
    PAYMENT_CANCEL_ACTOR_FORBIDDEN: "Only the person who prepared this payment can cancel it while approval is pending.",
    PAYMENT_FINANCIAL_ACCOUNT_REQUIRED: "Select an active financial account before confirming this payment.",
    PAYMENT_FINANCIAL_ACCOUNT_INVALID: "The selected financial account is no longer active or does not match this payment.",
    PAYMENT_METHOD_ACCOUNT_MISMATCH: "The financial account type does not match the selected payment method.",
    OPEN_CASH_SESSION_REQUIRED: "No compatible open cash session is available for this cash payment. Open a cash session on the selected account, then try again.",
    PAYMENT_CASH_SESSION_INVALID: "The cash session linked to this payment no longer matches the expected financial account. Open a compatible cash session and try again.",
    PAYMENT_CASH_SESSION_AMBIGUOUS: "Several cash sessions are open on this account and none can be selected safely. Use the confirming user’s cash session or close competing sessions, then try again.",
    PAYMENT_CASH_SESSION_PENDING_VALIDATION: "The cash session previously linked to this payment is awaiting close validation. Open a new compatible cash session on the same account, then confirm again.",
    PAYMENT_CASH_SESSION_CLOSING: "The cash session previously linked to this payment is closing. Finish closing it or open a new authorized cash session on the same account, then try again.",
    PAYMENT_CASH_SESSION_CLOSED: "The cash session previously linked to this payment is closed. Open a new compatible cash session on the same account, then try again.",
    PAYMENT_NOT_APPROVED: "This payment must be approved before confirmation. Reload it and check its status.",
    PAYMENT_SELF_CONFIRMATION_FORBIDDEN: "Payment confirmation must be performed by a third authorized person, different from the initiator and approver.",
    REFUND_PAYMENT_SELF_CONFIRMATION_FORBIDDEN: "Refund confirmation must be performed by a third authorized person, different from the initiator and approver.",
    PAYMENT_CASH_SESSION_BINDING_REQUIRED: "This recent cash payment is not linked to a cash session. Create it from an open cash session or repair the binding before confirming.",
    PAYMENT_CASH_SESSION_LEGACY_RECOVERY: "Historical payment: at confirmation time, the system will check for a compatible open cash session and recover the binding only when it can do so unambiguously.",
    PAYMENT_GAMING_SCOPE_INVALID: "This payment no longer matches the customer or currency of its linked Gaming checkout. Reload the data before continuing.",
    PAYMENT_GAMING_CONVERGENCE_FAILED: "The payment was confirmed, but the linked Gaming checkout could not be updated. Retry confirmation to resume synchronization.",
    SALES_INVOICE_NOT_FOUND: "This customer invoice does not exist or is no longer available in this company.",
    SALES_INVOICE_REVISION_CONFLICT: "This customer invoice changed in the meantime. Refresh the data before trying again.",
    SALES_INVOICE_TRANSITION_INVALID: "This action is not allowed in the invoice’s current state. Refresh the invoice and check its status.",
    SALES_INVOICE_SUBMITTER_MISMATCH: "Only the person who prepared this invoice can submit it for approval.",
    CASH_SESSION_NOT_FOUND: "This cash session does not exist or is no longer available.",
    CASH_SESSION_ALREADY_ACTIVE: "A cash session is already open or closing on this account for this cashier. Use that session or finish closing it before opening another one.",
    CASH_SESSION_CONFLICT: "This cash session changed in the meantime. Refresh the data before trying again.",
    CASH_REJECTION_REASON_REQUIRED: "Enter a rejection reason with at least 4 characters.",
    CASH_COUNT_TOTAL_MISMATCH: "The physical cash count does not match the closing amount entered.",
    CASH_DISCREPANCY_REASON_REQUIRED: "A reason is required when a cash discrepancy exists.",
    ACCOUNTING_APPROVAL_CONFLICT: "This approval changed in the meantime. Refresh the data before deciding again.",
    FINANCE_PERIOD_CLOSED: "This finance period is closed. Choose an open period or request an authorized reopening.",
    SELF_APPROVAL_FORBIDDEN: "Another authorized person must approve this operation.",
    ACCOUNTING_SELF_APPROVAL_FORBIDDEN: "You cannot approve your own operation. Assign it to another authorized person.",
    ACCOUNTING_APPROVER_NOT_ELIGIBLE: "The selected person cannot approve this operation. Choose an authorized approver.",
    ACCOUNTING_APPROVER_NOT_ALLOWED: "This approval is assigned to another authorized person.",
    ACCOUNTING_APPROVAL_ALREADY_PENDING: "An approval is already pending for this operation.",
    ACCOUNTING_APPROVAL_NOT_ASSIGNED: "No pending approval is assigned to this operation.",
    ACCOUNTING_APPROVAL_TARGET_UNSUPPORTED: "This operation type does not support assigned approval yet.",
    ACCOUNTING_QUEUED_APPROVAL_NOT_FOUND: "The next approval step is unavailable. Refresh the record and try again.",
    FINANCIAL_CLOSE_SELF_APPROVAL_FORBIDDEN: "Another authorized person must approve this close.",
    FINANCIAL_CLOSE_SELF_CLOSE_FORBIDDEN: "Another authorized person must finalize this close.",
    THREE_WAY_MATCH_VARIANCE_UNRESOLVED: "The invoice still has variances against the purchase order or receipt.",
    POSTING_MAPPING_MISSING: "A required accounting account has not been configured for this operation yet.",
    ACCOUNT_MAPPING_NOT_FOUND: "A required accounting account is missing from the company configuration.",
    CHART_OF_ACCOUNTS_NOT_FOUND: "This chart of accounts does not exist in this company.",
    CHART_OF_ACCOUNTS_REVISION_CONFLICT: "This chart changed in the meantime. Refresh it before trying again.",
    CHART_OF_ACCOUNTS_CODE_LOCKED: "The chart code is locked once groups or accounts exist. Its labels remain editable.",
    CHART_OF_ACCOUNTS_DELETE_BLOCKED: "Only a completely empty custom draft chart can be deleted.",
    TEMPLATE_LEDGER_ACCOUNT_IMMUTABLE: "This account comes from the published accounting template. Create a custom child account to adapt it.",
    LEDGER_ACCOUNT_STRUCTURE_IN_USE: "This account is already in use. Its structural attributes can no longer be changed.",
    ACCOUNT_MAPPING_KEY_INVALID: "This accounting rule is not available in the authorized semantic registry.",
    ACCOUNT_MAPPING_ACCOUNT_INVALID: "The target account is no longer active or does not belong to this company.",
    ACCOUNT_MAPPING_CHART_MISMATCH: "Choose a target account from the same chart as this rule.",
    ACCOUNT_MAPPING_TEMPLATE_MANAGED: "This rule is managed by a published accounting template and remains read-only.",
    ACCOUNT_MAPPING_CHART_NOT_CONFIGURABLE: "The chart linked to this rule is no longer configurable.",
    ACCOUNT_MAPPING_ACCOUNT_TYPE_INCOMPATIBLE: "The selected account type is not compatible with this rule.",
    ACCOUNT_MAPPING_ACCOUNT_SUBTYPE_INCOMPATIBLE: "The selected account subtype is not compatible with this rule.",
    ACCOUNT_MAPPING_ACTIVE_EXISTS: "An active rule of this kind already exists in this chart. Edit or deactivate it instead.",
    ACCOUNT_MAPPING_RECORD_NOT_FOUND: "This accounting rule no longer exists in this company.",
    ACCOUNT_MAPPING_REVISION_CONFLICT: "This rule changed in the meantime. Refresh it before trying again.",
    ACCOUNT_MAPPING_DATE_RANGE_INVALID: "The end date cannot be earlier than the start date.",
    FINANCE_EXCHANGE_RATE_REQUIRED: "No applicable exchange rate is available for this date. Add a rate and try again.",
    FINANCE_EXCHANGE_RATE_INVALID: "The exchange rate must be greater than zero.",
    FINANCE_EXCHANGE_RATE_PAIR_INVALID: "Choose two different currencies for this exchange rate.",
    FINANCE_EXCHANGE_RATE_ACTIVE_VERSION_EXISTS: "An active rate already exists for this currency pair and date. Deactivate it before publishing a correction.",
    FINANCE_CURRENCY_NOT_CONFIGURED: "This currency is not active in the company registry. Add or activate it before continuing.",
    FINANCE_CURRENCY_INACTIVE: "This currency is disabled in the company registry. Reactivate it before continuing.",
    FINANCE_CURRENCY_DUPLICATE: "This currency already exists in the company registry.",
    FINANCE_CURRENCY_NOT_FOUND: "This currency is not available in the company-managed registry.",
    FINANCE_CURRENCY_IN_USE: "This currency is still in use. Remove its Finance dependencies before disabling it.",
    FINANCE_CURRENCY_INPUT_INVALID: "Review the currency code, name, precision and rounding rule.",
    TREASURY_LEDGER_ACCOUNT_INVALID: "The selected ledger account is no longer available in this company.",
    TREASURY_LEDGER_SUBTYPE_MISMATCH: "The selected ledger account does not match the financial account type.",
    TREASURY_LEDGER_CURRENCY_MISMATCH: "The ledger account currency does not match the financial account currency.",
    TREASURY_RESPONSIBLE_USER_INVALID: "The selected responsible person is no longer an active company member.",
    TREASURY_SITE_INVALID: "The selected site is no longer active in this company.",
    TREASURY_ACCOUNT_NOT_FOUND: "This financial account does not exist or has already been archived.",
    TREASURY_ACCOUNT_CONFLICT: "This account changed in the meantime. Reload it before trying again.",
    TREASURY_ACCOUNT_BALANCE_NOT_ZERO: "This account still has a balance. Transfer or regularize the balance before archiving it.",
    TREASURY_ACCOUNT_ACTIVE_CASH_SESSION: "A cash session is still open on this account. Close it before archiving the account.",
    TREASURY_ACCOUNT_PENDING_TRANSFER: "An unfinished transfer still uses this account. Complete or cancel the transfer before archiving it.",
    TRANSFER_ACCOUNTS_INVALID: "Select two different active financial accounts from this company.",
    TRANSFER_INSUFFICIENT_OPERATIONAL_BALANCE: "The source account does not have enough available balance for this transfer.",
    TRANSFER_NOT_FOUND: "This transfer does not exist in this company.",
    TRANSFER_NOT_APPROVED: "This transfer must be approved before execution.",
    TRANSFER_JOURNAL_REQUIRED: "No active accounting journal is available to post this transfer.",
    TRANSFER_APPROVER_NOT_ELIGIBLE: "The selected approver is no longer eligible for this transfer.",
    TRANSFER_APPROVAL_NOT_ASSIGNED: "No approver is currently assigned to this transfer.",
    TRANSFER_APPROVER_NOT_ALLOWED: "This transfer is assigned to another authorized approver.",
    TRANSFER_SELF_APPROVAL_FORBIDDEN: "Self-approval is not allowed for this transfer.",
    TRANSFER_APPROVAL_CONFLICT: "The transfer approval changed in the meantime. Reload the data before trying again.",
    TRANSFER_CONFLICT: "This transfer changed in the meantime. Reload the data before trying again.",
    FUNDING_OPERATION_NOT_FOUND: "This funding operation does not exist or is no longer available in this company.",
    FUNDING_OPERATION_CONFLICT: "This funding operation changed in the meantime. Refresh the data before trying again.",
    FUNDING_OPERATION_NOT_APPROVED: "This funding operation must be approved before confirmation.",
    FUNDING_OPERATION_NOT_REVERSIBLE: "This funding operation is no longer in a state that allows reversal.",
    FUNDING_FINANCIAL_ACCOUNT_INVALID: "The selected treasury account is no longer active or no longer matches this funding operation.",
    FUNDING_CASH_SESSION_REQUIRED: "Open a cash session on the selected account before receiving this funding in cash.",
    FUNDING_CASH_SESSION_INVALID: "The selected cash session is no longer open or does not match the destination account.",
    FUNDING_CASH_SESSION_AMBIGUOUS: "Several cash sessions are open on this account. Explicitly select the session receiving the funds.",
    FUNDING_CASH_SESSION_NOT_ALLOWED: "A cash session can only be linked to funding received into a Cash account.",
    FUNDING_COUNTERPART_ACCOUNT_REQUIRED: "Select the liability account that records the amount owed to the shareholder.",
    FUNDING_COUNTERPART_ACCOUNT_INVALID: "The counterpart must be an active postable liability account in this company.",
    FUNDING_COUNTERPART_NOT_ALLOWED: "A shareholder liability account may only be set for a shareholder advance.",
    FUNDING_APPROVER_NOT_ELIGIBLE: "The selected approver is not eligible to approve this funding operation.",
    FUNDING_APPROVAL_NOT_ASSIGNED: "No approver is assigned to this funding operation.",
    FUNDING_APPROVER_NOT_ALLOWED: "This funding operation is assigned to another authorized approver.",
    FUNDING_SELF_APPROVAL_FORBIDDEN: "Another authorized person must approve this funding operation.",
    FUNDING_APPROVAL_CONFLICT: "The approval for this funding operation changed in the meantime. Refresh the data.",
    FUNDING_CONFIRMATION_ACTOR_FORBIDDEN: "Confirmation must be performed by a third authorized person, different from the initiator and approver.",
    FUNDING_REVERSAL_ACTOR_FORBIDDEN: "Reversal must be performed by another authorized person independent from the previous actors.",
    FUNDING_REVERSAL_INSUFFICIENT_BALANCE: "The account’s current balance is insufficient to reverse this funding operation without creating a negative balance.",
    FUNDING_IDEMPOTENCY_CONFLICT: "This funding request key was already used with different information. Refresh and start again.",
    FUNDING_CONFIRMATION_INCONSISTENT: "This funding operation is confirmed but its financial effects are incomplete. No duplicate entry was created; contact an administrator.",
    FUNDING_POSTED_ENTRY_MISSING: "The original accounting entry for this funding operation is missing, so reversal was blocked.",
    FUNDING_OPERATION_NOT_POSTABLE: "This funding operation is not in a state that allows posting.",
    DUPLICATE_POSTING_ATTEMPT: "This operation has already been posted. No duplicate entry was created.",
    POSTING_BATCH_ALREADY_EXISTS: "This operation has already been processed. The existing entry was preserved.",
    JOURNAL_ENTRY_UNBALANCED: "Total debits must equal total credits before posting.",
    REGULATORY_STATEMENT_PERIOD_INVALID: "The selected financial statement period is invalid.",
    REGULATORY_STATEMENT_TYPE_NOT_SUPPORTED: "This financial statement is not available for the active chart of accounts.",
    CHART_TEMPLATE_UPGRADE_REQUIRES_CONTROLLED_MIGRATION: "This new version requires review before it can be applied. Review the impact analysis, then approve the migration.",
    ACCOUNTING_SETUP_INPUT_INVALID: "Review the accounting setup information and try again.",
    FINANCE_DUPLICATE: "An identical record already exists in this company."
  }
};

const PAYMENT_CONFIRMATION_COPY: Record<FinanceLocale, {
  readyTitle: string;
  blockedTitle: string;
  noticeTitle: string;
  readyDescription: string;
}> = {
  fr: {
    readyTitle: "Confirmation disponible",
    blockedTitle: "Confirmation indisponible",
    noticeTitle: "Vérification avant confirmation",
    readyDescription: "Vous pouvez confirmer ce paiement. Les contrôles de séparation des rôles et de rattachement caisse seront revérifiés au moment de l’action.",
  },
  en: {
    readyTitle: "Confirmation available",
    blockedTitle: "Confirmation unavailable",
    noticeTitle: "Check before confirmation",
    readyDescription: "You can confirm this payment. Role separation and cash-session binding will be checked again when the action is submitted.",
  },
};

export function financePaymentConfirmationCopy(locale: FinanceLocale) {
  return PAYMENT_CONFIRMATION_COPY[locale];
}

export function financeClientLocale(preferred?: FinanceLocale): FinanceLocale {
  if (preferred) return preferred;
  if (typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en")) return "en";
  return "fr";
}

export function financeStatusLabel(status?: string, locale: FinanceLocale = "fr") {
  if (!status) return locale === "fr" ? "Statut à vérifier" : "Status to review";
  return STATUS_LABELS[locale][status] || (locale === "fr" ? "Statut à vérifier" : "Status to review");
}

export function financeMetricLabel(key: string, locale: FinanceLocale = "fr") {
  return METRIC_LABELS[locale][key] || (locale === "fr" ? "Indicateur financier" : "Finance metric");
}

export function financeEnumLabel(value: string, locale: FinanceLocale = "fr") {
  const normalized = value.trim();
  if (!normalized) return "";
  return ENUM_LABELS[locale][normalized] || (locale === "fr" ? "Autre catégorie" : "Other category");
}

export function financeStatusTone(status?: string): StatusBadgeTone {
  if (!status) return "neutral";
  if (/REJECTED|CANCELLED|VOID|FAILED|OVERDUE|DISPUTED|LOCKED|BLOCKED/i.test(status)) return "danger";
  if (/SUBMITTED|PENDING|IN_REVIEW|PARTIALLY|SOFT_CLOSED|CLOSING|UNALLOCATED|UNMATCHED/i.test(status)) return "warning";
  if (/APPROVED|ISSUED|POSTED|PAID|CONFIRMED|ALLOCATED|RECONCILED|VALIDATED|CLOSED|COMPLETED|EXECUTED|ACTIVE|IMPORTED|READY|PUBLISHED|MATCHED/i.test(status)) return "success";
  if (/OPEN|DRAFT|PREPARED|IN_PROGRESS|PLANNED|REOPENED/i.test(status)) return "info";
  return "neutral";
}

export function financeMoney(value: unknown, currencyCode = "USD", locale: FinanceLocale = "fr") {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return locale === "fr" ? "Montant indisponible" : "Amount unavailable";
  try { return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(numeric); }
  catch { return `${numeric.toFixed(2)} ${currencyCode}`; }
}

export function financeDate(value: unknown, locale: FinanceLocale = "fr") {
  if (!value) return locale === "fr" ? "Non précisée" : "Not specified";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return locale === "fr" ? "Date à vérifier" : "Date to review";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium" }).format(date);
}

function extractFinanceErrorCode(error: unknown): string | null {
  const candidates: string[] = [];
  if (error instanceof Error && error.message) candidates.push(error.message);
  if (typeof error === "string") candidates.push(error);
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; error?: unknown; message?: unknown };
    for (const candidate of [value.code, value.error, value.message]) if (typeof candidate === "string") candidates.push(candidate);
  }
  for (const candidate of candidates) {
    const direct = candidate.trim();
    if (/^[A-Z][A-Z0-9_]+$/.test(direct)) return direct;
    const known = Object.keys(FINANCE_ERROR_MESSAGES.fr).find((code) => candidate.includes(code));
    if (known) return known;
    const token = candidate.match(/\b[A-Z][A-Z0-9_]{5,}\b/)?.[0];
    if (token) return token;
  }
  return null;
}

function extractSafeFinanceClientMessage(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value = error as { name?: unknown; clientMessage?: unknown };
  if ((value.name !== "FinanceApiError" && value.name !== "ProfessionalApiError") || typeof value.clientMessage !== "string") return null;
  const message = value.clientMessage.trim();
  return message.length > 0 && message.length <= 1200 ? message : null;
}

export function financeErrorMessage(error: unknown, locale?: FinanceLocale, fallback?: string) {
  const resolvedLocale = financeClientLocale(locale);
  const code = extractFinanceErrorCode(error);
  if (code && FINANCE_ERROR_MESSAGES[resolvedLocale][code]) return FINANCE_ERROR_MESSAGES[resolvedLocale][code];
  if (code?.includes("REVISION_CONFLICT") || code?.endsWith("_CONFLICT")) return resolvedLocale === "fr" ? "Cette donnée a changé entre-temps. Actualisez la page avant de réessayer." : "This record changed in the meantime. Refresh the page before trying again.";
  if (code?.includes("TRANSITION_INVALID") || code?.endsWith("_NOT_SUBMITTED")) return resolvedLocale === "fr" ? "Cette action n’est pas autorisée dans l’état actuel de l’opération. Actualisez les données puis vérifiez son statut." : "This action is not allowed in the operation’s current state. Refresh the data and check its status.";
  if (code?.includes("SUBMITTER_MISMATCH")) return resolvedLocale === "fr" ? "Seule la personne qui a préparé cette opération peut la soumettre à l’étape suivante." : "Only the person who prepared this operation can submit it to the next step.";
  if (code?.includes("REJECTION_REASON_REQUIRED")) return resolvedLocale === "fr" ? "Indiquez un motif de refus d’au moins 4 caractères." : "Enter a rejection reason with at least 4 characters.";
  if (code?.includes("SELF_APPROVAL_FORBIDDEN")) return resolvedLocale === "fr" ? "Une autre personne autorisée doit valider cette opération." : "Another authorized person must validate this operation.";
  if (code?.includes("PERIOD_CLOSED") || code?.includes("PERIOD_LOCKED")) return resolvedLocale === "fr" ? "La période choisie est fermée. Utilisez une période ouverte ou demandez une réouverture autorisée." : "The selected period is closed. Use an open period or request an authorized reopening.";
  if (code?.includes("MAPPING") && (code.includes("MISSING") || code.includes("NOT_FOUND"))) return resolvedLocale === "fr" ? "La configuration comptable de cette opération est incomplète. Complétez les comptes associés puis réessayez." : "The accounting setup for this operation is incomplete. Complete the related accounts and try again.";
  if (code?.endsWith("_NOT_FOUND")) return resolvedLocale === "fr" ? "L’élément financier demandé est introuvable ou n’est plus disponible." : "The requested finance record could not be found or is no longer available.";
  if (code?.includes("NOT_POSTABLE") || code?.includes("NOT_ELIGIBLE")) return resolvedLocale === "fr" ? "Cette opération n’est pas encore dans un état permettant sa comptabilisation." : "This operation is not yet in a state that allows posting.";
  const safeServerMessage = extractSafeFinanceClientMessage(error);
  if (resolvedLocale === "fr" && safeServerMessage) return safeServerMessage;
  if (code?.includes("REQUIRED")) return resolvedLocale === "fr" ? "Une information ou une configuration requise manque pour terminer cette opération." : "Required information or configuration is missing to complete this operation.";
  if (code?.includes("FORBIDDEN") || code === "FORBIDDEN" || code === "UNAUTHORIZED") return resolvedLocale === "fr" ? "Vous ne disposez pas de l’autorisation nécessaire pour cette action." : "You do not have the permission required for this action.";
  if (code?.includes("INVALID") || code === "INVALID_PAYLOAD") return resolvedLocale === "fr" ? "Certaines informations saisies sont à corriger avant de continuer." : "Some entered information must be corrected before continuing.";
  if (resolvedLocale === "en" && safeServerMessage && /\b(the|this|that|cannot|must|missing|required|invalid|failed|not|only|select|choose|enter|refresh)\b/i.test(safeServerMessage)) return safeServerMessage;
  if (fallback) return fallback;
  return resolvedLocale === "fr" ? "L’opération financière n’a pas pu être terminée. Vérifiez les informations puis réessayez." : "The finance operation could not be completed. Review the information and try again.";
}

export function safeFinanceError(error: unknown, fallback?: string, locale?: FinanceLocale) {
  return financeErrorMessage(error, locale, fallback);
}
