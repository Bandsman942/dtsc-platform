# Changelog — ERP Consolidation Iteration 05

## Added

- audit de préparation au cutover par organisation ;
- audit d’intégrité comptable ;
- sept quality gates finaux ERP ;
- registres finaux de propriété, legacy, suppressions, routes et permissions ;
- architecture, runbook, rollback, sécurité, migration et checklist Production.

## Changed

- `EnterpriseCoreRecord` devient `LEGACY_READ_ONLY` ;
- `EnterpriseSectorRecord` Health/Pharmacy devient `LEGACY_READ_ONLY` ;
- `EnterpriseWorkflow` n’accepte plus de mutation depuis l’administration ;
- lectures historiques paginées et bornées ;
- modules Health génériques sans contrat dédiés passés à `HIDDEN` / `EXPLICIT_DENY` ;
- administration orientée vers Workflow Engine v2 et les workspaces sectoriels dédiés ;
- registre canonique enrichi d’overrides de nettoyage final.

## Removed from active paths

- création et modification génériques Core ;
- création générique Health/Pharmacy ;
- éditeur workflow legacy ;
- fallback UI générique des modules sectoriels.

## Not removed physically

Aucune table, colonne, facture, paiement, écriture, donnée clinique, lot Pharmacy ou archive n’a été supprimé. Une Release B séparée reste soumise aux preuves Production.
