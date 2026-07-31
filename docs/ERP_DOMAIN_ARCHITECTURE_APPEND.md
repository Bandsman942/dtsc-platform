

## Itération 3 — Finance commune canonique

<!-- ERP_DOMAIN_ARCHITECTURE_FINANCE_V1 -->

La finance commune transforme les domaines opérationnels de l’itération 2 sans les remplacer : Sales Order -> Sales Invoice -> Receivable -> Payment -> Treasury -> Journal Entry ; Purchase/Receipt -> Supplier Invoice -> Payable -> Payment -> Treasury -> Journal Entry ; Payroll Run -> Payroll Liability -> Payment ; Stock Movement -> Inventory Accounting Event ; Asset -> Asset Accounting Profile.

Les sources de vérité sont distinctes : documents opérationnels pour l’exécution, factures pour les créances/dettes, allocations pour les soldes ouverts, transactions de trésorerie pour les mouvements opérationnels et lignes `POSTED` pour la comptabilité. Les budgets et dépenses existants sont réutilisés avec une classification anti-double comptage.

Les 14 modules Finance sont déclarés dans le registre canonique, provisionnés tenant-aware et séparés en workspaces dédiés. Pharmacy, Health et la finance interne DTSC ne sont ni migrés ni dual-writés. Leur convergence est explicitement différée à l’itération 4.
