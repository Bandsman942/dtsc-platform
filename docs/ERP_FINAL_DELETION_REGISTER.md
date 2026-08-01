# ERP — Registre final des suppressions

| Élément | Type | Décision Release A | Preuve requise avant suppression physique |
|---|---|---|---|
| Mutations `EnterpriseCoreRecord` | code/API | retirées, `410 Gone` | aucune nouvelle tentative légitime pendant observation |
| Mutations `EnterpriseSectorRecord` | code/API | retirées, `410 Gone` | aucun module dédié dépendant du CRUD générique |
| Éditeur `EnterpriseWorkflow` | UI/API | retiré, `410 Gone` | toutes les instances actives migrées ou clôturées |
| Workspaces génériques sectoriels | UI | retirés | aucun import, deep link, notification ou test actif |
| Modules Health génériques BETA | registre | masqués et refusés | contrat métier dédié complet avant réactivation |
| Tables Core/Sector/Workflow legacy | base | conservées en lecture seule | export, sauvegarde, restauration et validation légale |
| Colonnes de synchronisation temporaires | base | conservées | aucune lecture, backfill ou rollback dépendant |
| Flags de convergence | configuration | conservés temporairement | rollback indépendant et observation concluante |
| Scripts obsolètes | code | revue obligatoire | preuve qu’ils ne servent ni audit ni reprise |

## Suppressions physiques réalisées

Aucune. Cette release est volontairement additive et compatible avec un déploiement où plusieurs versions applicatives peuvent coexister brièvement.

## Règle de décision

Une suppression physique est interdite tant que l’usage n’est pas nul, que l’archive n’est pas vérifiée ou que le rollback nécessite encore l’objet. Les écritures comptables, factures, paiements, lots Pharmacy et dossiers Health ne sont jamais supprimés pour simplifier un cutover.
