# Guide utilisateur — Notifications
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Notifications** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Recherche et pagination

La recherche serveur filtre le titre, le contenu et le type avant le chargement. L’historique est paginé afin de ne pas lire toutes les notifications en mémoire.

## Filtres

Les filtres rapides permettent de distinguer les éléments non lus, invitations, support, calendrier, activités, sécurité et autres catégories reconnues sur la page chargée.

## Lecture

Ouvrir une notification la marque comme lue puis dirige vers sa cible autorisée.

## Liens profonds

Une notification actionnable doit viser l’objet précis lorsqu’il est connu. L’accès à cet objet est revérifié au moment du clic.

## Invitations hors contexte

Une invitation ou relation concernant une organisation non encore rejointe reste visible dans le compte personnel et ne dépend pas de l’activation préalable de cette organisation.

## Suppression

Supprimer une notification ne supprime jamais l’objet métier correspondant.

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
