# ERP — Statut final du cutover

## Baseline

- SHA de départ Release A : `a20c5b101255102d8a20964d20c4f28704ab9e6f`
- Branche : `feat/erp-consolidation-iteration-05-legacy-cleanup`
- Itérations 1 à 4 : fusionnées avant le décommissionnement.

## Statut par domaine

| Domaine | État | Condition restante |
|---|---|---|
| Registre/navigation | READY | surveiller les aliases historiques |
| Core ERP dédié | READY_WITH_ARCHIVE | `EnterpriseCoreRecord` historique conservé |
| Workflow Engine v2 | READY_WITH_ARCHIVE | `EnterpriseWorkflow` historique conservé |
| Finance commune | READY | audit d’intégrité avant et après Production |
| Pharmacy | READY sous preuve organisationnelle | aucun état PENDING/FAILED/AMBIGUOUS avant cutover local |
| Health | READY sous preuve organisationnelle | aucun état PENDING/FAILED/AMBIGUOUS avant cutover local |
| CRUD sectoriel générique | RETIRED | `EnterpriseSectorRecord` historique conservé en lecture seule |
| Modules Health génériques | HIDDEN | future implémentation dédiée uniquement |

## Release A

La Release A bloque les nouvelles écritures legacy, retire les formulaires génériques, conserve les archives lisibles, active les audits et ne supprime aucune table ni colonne.

## Observation

Avant une Release B, exécuter :

```bash
pnpm audit:erp-cutover -- --dry-run --json
pnpm audit:financial-integrity -- --json
```

Observer les métriques `legacy_write_attempts`, `deprecated_route_hits`, `duplicate_posting_attempts`, les synchronisations sectorielles et les rapports financiers.

## Release B

Une suppression physique éventuelle exige : absence d’appel, archive/export, sauvegarde testée, validation juridique et opérationnelle, restauration testée, migrations compatibles avec plusieurs versions et approbation explicite. Aucune Release B n’est incluse dans cette itération.
