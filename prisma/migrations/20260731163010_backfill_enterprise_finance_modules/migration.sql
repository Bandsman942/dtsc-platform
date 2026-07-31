-- Additive deterministic backfill. Existing tenant choices are preserved by ON CONFLICT DO NOTHING.
INSERT INTO "EnterpriseModule" (
  "id", "organizationId", "sectorId", "moduleCode", "labelFr", "labelEn",
  "descriptionFr", "descriptionEn", "moduleCategory", "icon", "isEnabled",
  "isCore", "sourceTemplateId", "requiresPlanLevel", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  'fin_' || md5(o."id" || ':' || m.code),
  o."id",
  NULL,
  m.code,
  m.label_fr,
  m.label_en,
  m.description_fr,
  m.description_en,
  'FINANCE',
  m.icon,
  TRUE,
  TRUE,
  NULL,
  m.plan,
  m.sort_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
  ('FINANCE_OVERVIEW', 'Vue d’ensemble financière', 'Finance overview', 'Préparation financière, indicateurs et alertes.', 'Finance readiness, indicators and alerts.', 'landmark', 'BUSINESS', 10),
  ('FINANCE_RECEIVABLES', 'Ventes & créances', 'Sales & receivables', 'Factures, avoirs, créances et allocations clients.', 'Customer invoices, credit notes, receivables and allocations.', 'receipt-text', 'BUSINESS', 20),
  ('FINANCE_PAYABLES', 'Achats & dettes', 'Purchases & payables', 'Factures fournisseurs, contrôle à trois voies et dettes.', 'Supplier invoices, three-way matching and payables.', 'file-input', 'BUSINESS', 30),
  ('FINANCE_PAYMENTS', 'Paiements', 'Payments', 'Encaissements, décaissements, avances et allocations.', 'Collections, disbursements, advances and allocations.', 'badge-dollar-sign', 'BUSINESS', 40),
  ('FINANCE_TREASURY', 'Trésorerie', 'Treasury', 'Comptes financiers, soldes et transferts atomiques.', 'Financial accounts, balances and atomic transfers.', 'wallet-cards', 'BUSINESS', 50),
  ('FINANCE_CASH', 'Caisse', 'Cash', 'Sessions, mouvements, comptages et écarts de caisse.', 'Cash sessions, movements, counts and discrepancies.', 'banknote', 'BUSINESS', 60),
  ('FINANCE_BANK', 'Banque', 'Bank', 'Comptes bancaires et relevés importés.', 'Bank accounts and imported statements.', 'building-2', 'ENTERPRISE', 70),
  ('FINANCE_RECONCILIATION', 'Rapprochement', 'Reconciliation', 'Rapprochement des relevés, paiements et écritures.', 'Reconciliation of statements, payments and entries.', 'scan-search', 'ENTERPRISE', 80),
  ('FINANCE_ACCOUNTING', 'Comptabilité', 'Accounting', 'Périodes, plan comptable, journaux et écritures.', 'Periods, chart of accounts, journals and entries.', 'book-open-check', 'ENTERPRISE', 90),
  ('FINANCE_TAX', 'Taxes', 'Tax', 'Codes, taux et synthèses fiscales opérationnelles.', 'Operational tax codes, rates and summaries.', 'percent', 'ENTERPRISE', 100),
  ('FINANCE_CLOSE', 'Clôture financière', 'Financial close', 'Checklist, fermeture et réouverture auditée.', 'Checklist, closing and audited reopening.', 'calendar-lock', 'ENTERPRISE', 110),
  ('FINANCE_STATEMENTS', 'États financiers', 'Financial statements', 'Balance, grand livre, résultat, bilan et trésorerie.', 'Trial balance, ledger, income, balance sheet and cash flow.', 'chart-no-axes-combined', 'ENTERPRISE', 120),
  ('FINANCE_ASSETS', 'Comptabilité des immobilisations', 'Asset accounting', 'Capitalisation, amortissement et cession des actifs.', 'Asset capitalization, depreciation and disposal.', 'factory', 'ENTERPRISE', 130),
  ('FINANCE_INVENTORY', 'Valorisation du stock', 'Inventory accounting', 'Coût moyen pondéré et écritures du stock commun.', 'Weighted-average cost and common inventory postings.', 'boxes', 'ENTERPRISE', 140)
) AS m(code, label_fr, label_en, description_fr, description_en, icon, plan, sort_order)
WHERE o."organizationType" = 'CLIENT' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId", "moduleCode") DO NOTHING;
