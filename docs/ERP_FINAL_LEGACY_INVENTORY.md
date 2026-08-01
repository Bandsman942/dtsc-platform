# ERP — Inventaire final du legacy

| Objet | Responsabilité historique | Remplacement | État Release A | Suppression physique |
|---|---|---|---|---|
| `EnterpriseCoreRecord` | CRUD générique Core | modèles dédiés Core v2 | lecture seule, mutations `410 Gone` | différée |
| `EnterpriseSectorRecord` | CRUD générique Health/Pharmacy | modèles sectoriels dédiés | lecture seule, mutations `410 Gone` | différée |
| `EnterpriseWorkflow` | définition de workflow non versionnée | Workflow Engine v2 | lecture seule, éditeur retiré | différée |
| `financeSyncStatus` et équivalents | suivi temporaire de convergence | relations structurelles + `EnterpriseSectorSyncState` | utilisable uniquement pour audit/backfill | retrait après observation |
| flags de convergence | bascule réversible | configuration stable de cutover | conservés pendant Release A | décision Release B |
| workspaces sectoriels génériques | formulaires JSON génériques | workspaces Health/Pharmacy dédiés | retirés de l’UI | code résiduel à supprimer après preuve d’absence d’import |
| modules Health sans contrat dédié | cartes BETA génériques | future implémentation dédiée | `HIDDEN` + `EXPLICIT_DENY` | non applicable |
| anciennes routes mutantes | mutations Core/Sector/Workflow | routes canoniques | refus explicite et audité | suppression ultérieure |
| scripts de backfill | reprise et convergence | audits et backfills idempotents | conservés si `--dry-run` et périmètre borné | revue Release B |

## Recherche de dépendances

Les recherches finales portent notamment sur : `legacy`, `deprecated`, `compatibility`, `fallback`, `dualWrite`, `syncStatus`, `EnterpriseCoreRecord`, `EnterpriseSectorRecord`, `EnterpriseWorkflow`, codes modules, anciennes routes, cron jobs, workers, rapports et redirections.

## Politique d’archive

Les lignes non migrables restent attachées à leur organisation, module, type et dates. Elles ne sont jamais exposées publiquement, ne reçoivent plus de mutation métier et ne sont pas transformées par similarité textuelle. Les données médicales, financières et réglementaires restent soumises à leurs politiques de confidentialité et de conservation.
