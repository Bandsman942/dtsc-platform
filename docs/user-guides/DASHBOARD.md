# Guide utilisateur — Dashboard
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Dashboard** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

Le Dashboard est le point d’entrée de l’espace personnel DTSC.

## Contexte

Le bandeau indique si l’utilisateur se trouve dans son compte personnel, l’environnement DTSC interne ou une organisation cliente. Le changement de contexte est contrôlé côté serveur et exige un membership actif.

## Actions attendues

La section regroupe les invitations, demandes de relation, consentements, notifications prioritaires, tickets support et incidents d’abonnement provenant de sources réelles. Chaque action ouvre l’objet concerné.

## Activité récente

L’historique combine les notifications, invitations, relations, conversations et tickets récents autorisés. Il est limité pour éviter le chargement de datasets complets.

## Abonnement

Le Dashboard affiche le plan appliqué au contexte, son statut, les limites disponibles et la consommation réelle du jour.

## Organisations

Les organisations rejointes proviennent des memberships actifs. Une invitation reste visible dans le compte personnel avant l’adhésion.

## Mobile

Les indicateurs et actions s’adaptent aux écrans étroits. Les rails horizontaux restent manipulables au toucher.

## Accès et permissions

- Ouvrez le module depuis la navigation du contexte actif.
- Les boutons et actions dépendent du rôle, du poste officiel, des permissions individuelles, du tenant actif et de l’état du module.
- Une action masquée dans l’interface reste également refusée par le serveur lorsqu’elle n’est pas autorisée.
- Sur mobile, utilisez le parcours liste → détail plein écran → formulaire plein écran → retour.

## Statuts, validations et traçabilité

- Les statuts visibles correspondent aux états réellement persistés ; les codes techniques ne sont pas présentés comme libellés métier.
- Les validations, refus, annulations, réouvertures et actions sensibles conservent leur auteur, leur date et, lorsque requis, leur motif.
- Une action répétée avec la même clé métier ne doit pas produire de doublon ni un second impact.

## Sécurité et confidentialité

- Les données sont limitées à l’utilisateur ou à l’organisation autorisée.
- Les références reçues du navigateur sont revérifiées côté serveur dans le même contexte.
- Les documents et informations sensibles utilisent les routes privées et les contrôles d’accès prévus par le module.

## Dépannage

- Actualisez la vue si une opération validée n’apparaît pas immédiatement.
- Vérifiez le contexte d’organisation, les permissions, le statut du module et la connexion réseau.
- En cas de refus persistant, conservez le message affiché et contactez le responsable du module ou le support DTSC sans partager de donnée sensible.
