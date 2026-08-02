# Trésorerie professionnelle

`FINANCE_TREASURY` gère les comptes bancaires, caisses, portefeuilles électroniques et comptes de transit du moteur commun.

Chaque compte possède une devise, un compte comptable lié, un responsable, un statut, des soldes et une référence masquée. Les numéros sensibles ne sont jamais affichés intégralement.

Les transferts conservent compte source, compte cible, montants, devises, taux éventuel, date et approbation. Le serveur interdit même compte, montant nul, devise incompatible sans change, auto-approbation, double transfert et inter-tenant.

Workflow : brouillon → approbation → exécution/confirmation → comptabilisation. Les deux côtés du transfert restent visibles et équilibrés.

Maturité : `PROFESSIONAL_READY`. Validation E2E manuelle du propriétaire en attente.
