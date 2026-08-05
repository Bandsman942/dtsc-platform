# Console abonnements et facturation SaaS

Les plans conservent des snapshots dans `BillingPlanVersion` avec version, date d’effet et motif. Les factures historiques ne sont pas réécrites. Les revenus proviennent uniquement des paiements validés.

La réconciliation n’est jamais exécutée au rendu. `POST /api/admin/billing/reconcile` crée un `ConsoleOperationJob`, exige une capacité dédiée, un motif, un périmètre borné et produit un audit. Le moteur est idempotent sur la référence financière.

Les exports de paiements utilisent une période maximale d’un an et 5 000 lignes par demande.
