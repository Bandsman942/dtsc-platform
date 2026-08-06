# Guide utilisateur — Relations avec les entreprises
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Relations avec les entreprises** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Source canonique

Le module consomme les identités relationnelles, demandes, consentements, activations et révocations du moteur ERP canonique. Il ne recrée aucun second moteur.

## Demandes et consentements

Une demande reçue est visible depuis le compte personnel, le Dashboard et les Notifications. L’utilisateur doit lire l’objectif et les conséquences avant de consentir.

## Relation active

Une relation active décrit un lien métier validé avec une organisation. Elle ne remplace pas un membership et n’accorde aucune permission sensible automatique.

## Liens profonds

Les notifications et actions ouvrent la relation précise au moyen de son identifiant. Les permissions actuelles sont contrôlées avant affichage.

## Révocation

La révocation retire les capacités dérivées, invalide les accès devenus interdits et conserve l’historique selon la politique de conservation.

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
