# Guide utilisateur — Appels audio et vidéo
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Appels audio et vidéo** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

Un appel est disponible seulement lorsque le service média est configuré. Autorisez le microphone ou la caméra dans le navigateur. L’appel entrant présente **Accepter** et **Refuser** ; ouvrir une notification ne vous connecte jamais automatiquement.

L’appelant peut annuler avant réponse ou terminer l’appel globalement. Un participant peut quitter sans terminer pour les autres. Après 45 secondes sans réponse, l’appel devient manqué. La durée de l’historique est calculée côté serveur depuis l’acceptation.

En cas d’interruption, vérifiez le réseau et les périphériques puis utilisez la reconnexion proposée. Aucun partage d’écran n’est annoncé lorsqu’il n’est pas réellement disponible.

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
