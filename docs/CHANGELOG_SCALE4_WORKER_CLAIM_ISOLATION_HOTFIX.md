# Changelog — SCALE-4 worker claim isolation hotfix

## Corrigé

- Le worker workflow n’inclut plus les jobs durables Finance Bulk dans ses métriques ni dans ses claims.
- `FINANCE_BANK_STATEMENT_IMPORT_REQUESTED`, `ENTERPRISE_AUDIT_EXPORT_REQUESTED` et `FINANCE_REPORT_GENERATION_REQUESTED` restent exclusivement réclamés par le worker Enterprise Bulk.
- Le chemin workflow isolé applique la même frontière.
- Une gate de régression permanente vérifie l’ownership des familles Workflow, Web Push, broadcast email, knowledge indexing et Enterprise Bulk.

## Inchangé

- Aucun schéma Prisma ni historique de migration.
- Aucun RBAC, entitlement, payload métier ou secret worker.
- Aucun changement d’interface utilisateur.
- Vercel reste Production-only depuis `main`.
