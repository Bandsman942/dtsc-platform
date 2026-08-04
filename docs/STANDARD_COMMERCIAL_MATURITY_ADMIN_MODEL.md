# Modèle Administration de maturité commerciale

La route existante `/admin/erp-readiness` reste la surface canonique et est enrichie pour les modules ERP **et** standards. `lib/commercial-maturity-governance.ts` agrège les deux registres et applique les dernières transitions persistées.

Niveaux : `BACKEND_READY`, `READ_ONLY_UI`, `OPERATIONAL_UI`, `PROFESSIONAL_READY`, `COMMERCIAL_READY`.

Chaque carte expose code, libellé, type, famille, domaine, statut technique, maturité, itération, progression réelle, preuves, guide, QA, E2E, blocages, mise à jour et historique.

Toute transition est contrôlée côté serveur, motivée, accompagnée d’une preuve, idempotente et auditée. `COMMERCIAL_READY` exige Production, SHA, E2E `PASSED`, preuve propriétaire et date de validation explicite. Une dégradation exige une preuve d’incident.
