# Architecture canonique des domaines ERP

## Objectif

DTSC Platform sépare trois concepts qui étaient historiquement mélangés :

1. **Domaines ERP métier** : opérations, ventes, achats, stock, finance, RH client, projets, actifs, documents, analytics et domaines sectoriels.
2. **Services transversaux** : collaboration, communication, IA, support, compte et abonnement.
3. **Administration entreprise** : membres, postes, départements, permissions, configuration, abonnement et audit.

## Autorités

### Registre TypeScript

`lib/enterprise/module-registry-data.json`, ses extensions versionnées et `lib/enterprise/module-registry.ts` sont l’autorité sur :

- l’existence fonctionnelle d’un module ;
- son statut d’implémentation ;
- son domaine et son groupe de navigation ;
- sa route et son workspace allow-listé ;
- ses secteurs compatibles ;
- ses dépendances ;
- ses permissions attendues ;
- son plan minimum et l’exigence d’un abonnement actif ;
- ses aliases et codes legacy.

Le registre n’importe jamais un composant depuis une valeur arbitraire de base de données. Les overrides de l’itération 5 masquent définitivement les modules génériques sans contrat dédié.

### Configuration tenant

`EnterpriseModule` reste responsable de l’activation ou désactivation dans une organisation, de l’ordre tenant et de la provenance historique du template. Une ligne active en base ne suffit jamais à rendre un module ouvrable.

## Domaines

| Domaine canonique | Autorité finale |
|---|---|
| `OPERATIONS` | tâches, demandes, validations, réunions et Workflow Engine v2 |
| `COMMERCIAL` | tiers, CRM, devis, contrats, commandes, livraisons et factures communes |
| `PROCUREMENT_INVENTORY` | fournisseurs, achats, réceptions, stock commun et valorisation |
| `FINANCE` | créances, dettes, paiements, allocations, caisse, trésorerie, rapprochements, taxes, journaux et états |
| `HUMAN_RESOURCES` | RH et paie opérationnelle propres aux entreprises clientes |
| `PROJECTS_ASSETS` | projets, timesheets, actifs et maintenances |
| `DOCUMENTS` | `EnterpriseDocument` et politiques sectorielles |
| `ANALYTICS` | rapports fondés sur les sources finales, sans double comptage |
| `INTELLIGENCE` | assistant IA contextualisé et isolé par tenant |
| `SECTOR_HEALTH` | patients et données cliniques Health ; finance commune pour facturation/paiement |
| `SECTOR_PHARMACY` | lots, FEFO, qualité et réglementation Pharmacy ; finance commune pour facturation/paiement |
| `ADMINISTRATION` | gouvernance du tenant, jamais catalogue métier concurrent |

## Navigation et rendu

La navigation est générée uniquement après résolution du registre, du secteur, de l’abonnement, des dépendances et des permissions. Les workspaces Core, Health et Pharmacy sont allow-listés dans le code. Aucun fallback générique n’est autorisé pour un domaine possédant un modèle dédié.

## Finance commune

Les chaînes canoniques sont :

- Sales Order → Sales Invoice → Receivable → Payment → Treasury → Journal Entry ;
- Purchase/Receipt → Supplier Invoice → Payable → Payment → Treasury → Journal Entry ;
- Payroll Run → Payroll Liability → Payment ;
- Stock Movement → Inventory Accounting Event ;
- Asset → Asset Accounting Profile.

Les documents opérationnels, factures, allocations, mouvements de trésorerie et lignes `POSTED` conservent des responsabilités distinctes. Une écriture `POSTED` est immuable et toute correction utilise une contrepassation.

## Convergence sectorielle

Pharmacy conserve les données réglementaires et opérationnelles spécialisées. Health conserve les données cliniques. Les factures, créances, paiements, caisses et écritures utilisent les modèles communs via des extensions et mappings idempotents. Aucun contenu clinique n’entre dans Finance.

## Décommissionnement final — Release A

- `EnterpriseCoreRecord` : archive lisible et paginée, mutations `410 Gone`.
- `EnterpriseSectorRecord` : archive lisible et paginée, mutations Health/Pharmacy `410 Gone`.
- `EnterpriseWorkflow` : archive lisible, création/édition retirées ; Workflow Engine v2 est l’unique moteur actif.
- Workspaces génériques sectoriels : retirés de l’interface.
- Modules Health génériques sans contrat : `HIDDEN` et `EXPLICIT_DENY`.
- Suppression physique : aucune dans cette release.

## Release B éventuelle

Une suppression de table, colonne, adapter ou flag exige une période d’observation Production, un export, une sauvegarde, une restauration testée, l’absence de dépendance, la validation des contraintes légales et une migration indépendante compatible avec plusieurs versions applicatives.

## Couche de continuité inter-module

`EnterpriseDomainEvent` transporte le fait durable ; `EnterpriseCrossModuleProjection` conserve le reçu par consommateur ; `EnterpriseEntityLink` matérialise les relations polymorphes tenant-aware.
