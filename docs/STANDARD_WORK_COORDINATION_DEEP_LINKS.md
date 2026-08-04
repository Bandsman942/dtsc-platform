# Liens profonds — coordination du travail

## Contrat

Les liens sont construits par `workCoordinationDeepLink`. Ils restent internes à DTSC Platform et ne contiennent ni jeton d'accès ni donnée sensible.

| Objet | Forme actuelle |
|---|---|
| Événement calendrier | `/calendar?event={id}` |
| Activité entreprise | `/enterprise-activities?activity={id}` |
| Tâche | `/enterprise-modules/TASKS_OPERATIONS?task={id}` |
| Demande | `/enterprise-modules/INTERNAL_REQUESTS?request={id}` |
| Validation | `/enterprise-modules/VALIDATIONS?approval={id}` |
| Réunion | `/enterprise-modules/MEETINGS?meeting={id}` |
| Instance workflow | `/enterprise-modules/WORKFLOWS?run={id}` |
| Document | `/enterprise-modules/DOCUMENTS?document={id}&version={version}` |

## Ouverture

1. Le lien dirige vers le produit et le module cible.
2. Le résolveur de contexte restaure ou demande le contexte requis.
3. La page vérifie la session et le membership.
4. L'API charge l'objet avec son filtre tenant-scoped.
5. Le composant ouvre le détail ou affiche un état sûr.

## Paramètres de création documentaire

Les parcours métier peuvent utiliser :

```text
/enterprise-modules/DOCUMENTS?action=upload&sourceEntityType=...&sourceEntityId=...&sourceReference=...
```

Le type et l'identifiant source sont revérifiés par la route de liaison. Le paramètre ne suffit pas à créer un lien vers un autre tenant.

## Accès révoqué

Un lien ancien peut rester présent dans une notification ou un e-mail. Lorsqu'un membership, une participation ou une permission a été retiré, la page doit afficher un refus ou un objet introuvable sans révéler le titre, les participants ou les documents.

## Validation

`isInternalWorkCoordinationLink` accepte uniquement les chemins internes attendus. Les URLs externes, protocoles inconnus et liens `javascript:` sont refusés.

## Retour de navigation

Les modules conservent les paramètres de liste pertinents lorsque leur implémentation le prend en charge. Le lien profond se concentre sur l'objet canonique ; il ne doit pas inventer une page parallèle uniquement pour satisfaire la notification.

## Limites

- L'ouverture automatique du drawer dépend de la consommation des paramètres par chaque workspace ; un module qui ne la prend pas en charge doit au minimum filtrer ou permettre de retrouver l'objet.
- Les anciens liens restent supportés par les redirections existantes lorsque cela est documenté ; aucun accès n'est élargi pour compatibilité.
