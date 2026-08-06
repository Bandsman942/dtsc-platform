# Guide utilisateur — Groupes et conversations
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Groupes et conversations** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

Les rôles sont propriétaire, administrateur et membre. Les gestionnaires invitent ou retirent les membres, modifient les paramètres, épinglent et modèrent dans leur groupe. Un membre peut quitter volontairement. Les messages plus anciens se chargent progressivement vers le haut.

Les mentions ciblent uniquement les participants autorisés. `@tous` n’est pas disponible sans permission explicite.

## Mentions commerciales

- `@utilisateur` met le membre en évidence, crée une mention non lue et permet des actions professionnelles au clic.
- `@tous` est disponible pour OWNER/ADMIN et cible tous les membres actifs du groupe.
- Une mention devient lue uniquement lorsque le message concerné a réellement été chargé dans la conversation du destinataire.

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
