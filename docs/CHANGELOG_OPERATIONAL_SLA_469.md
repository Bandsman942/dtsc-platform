# Changelog — SLA opérationnels #469

## Problème corrigé

Les anciennes politiques SLA pouvaient stocker `priority`, `startStatus` et `stopStatuses`, mais ces valeurs n’influençaient ni le démarrage ni la clôture du suivi. La PR #468 avait donc retiré ces réglages libres de l’interface afin de ne plus présenter des options décoratives.

## Implémentation

- ajout de `lib/operational-sla-reference.ts`, référentiel contrôlé par `OperationalObjectType` pour les statuts et, lorsqu’elle existe réellement, la priorité métier (`priority`, `severity` ou `urgency`) ;
- validation serveur des nouveaux filtres lors de la création d’une politique ;
- rejet d’une liaison lorsque la priorité ou le statut de démarrage ne correspond pas à l’objet courant ;
- refus de démarrer une instance lorsque l’objet a déjà atteint un statut d’arrêt ;
- évaluation des instances actives contre le statut métier courant et passage automatique à `COMPLETED` lorsqu’un statut d’arrêt configuré est atteint ;
- lecture des états par lots lors de l’évaluation afin d’éviter une requête par instance ;
- réintroduction dans l’Administration des filtres de priorité/statut sous forme de select et de cases à cocher contrôlés ;
- ajout d’un parcours de liaison contrôlé : l’utilisateur choisit un objet accessible et une règle compatible sans recopier d’identifiant technique ;
- revalidation serveur des droits d’accès avant chaque liaison ;
- compatibilité non destructive : les anciennes valeurs hors référentiel restent lisibles, sont signalées comme historiques et ne sont pas réintroduites parmi les choix autorisés ;
- ajout de `qa-operational-sla-filter-checks.mjs` dans `qa:regression` ;
- plan OWNER_E2E dédié dans `docs/MANUAL_E2E_OPERATIONAL_SLA_469.md`.

## Référentiels couverts

Le contrat SLA couvre les types opérationnels suivants : `CALENDAR_EVENT`, `TASK`, `OPERATION`, `DEPARTMENT_REQUEST`, `BLOCKER`, `MEETING`, `COLLAB_REQUEST`, `CEO_OBJECTIVE`, `CEO_SUPERVISION`, `SCO_PURCHASE_REQUEST`, `SCO_LOGISTICS`, `MPO_PROJECT`, `MPO_RECORD`, `CTO_PROJECT` et `CTO_RECORD`.

Les domaines qui ne possèdent pas de priorité canonique, notamment `MEETING` et `SCO_LOGISTICS`, n’exposent pas de faux filtre de priorité.

## Base de données

Aucune migration Prisma et aucun backfill. Les colonnes déjà présentes dans `OperationalSlaPolicy` et `OperationalSlaInstance` sont réutilisées.

## Sécurité

La sélection UI ne remplace pas l’autorisation. Les objets proposés sont limités à ceux accessibles au gestionnaire lorsque celui-ci n’est ni administrateur, ni CEO, ni COO, puis `resolveOperationalObjectAccess` est de nouveau appliqué au moment de la liaison.

## Rollback

Revert applicatif de la PR. Aucun rollback de données n’est requis.

## Livraison

Conformément à `docs/CONTRIBUTING.md`, aucun Preview Vercel n’est requis pour la branche. La fusion reste interdite avant CI verte et validation OWNER_E2E sur `TASK`, `OPERATION` et `DEPARTMENT_REQUEST`.
