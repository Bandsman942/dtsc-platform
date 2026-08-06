# Guide utilisateur — Paramètres
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Paramètres** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Général

La langue, le fuseau horaire, les formats, la densité et la page de démarrage utilisent les préférences persistées du compte lorsque la fonction est supportée.

## Apparence

Le thème clair, sombre ou système est appliqué par le mécanisme d’apparence existant.

## Notifications

Les catégories e-mail, internes et Push dépendent des préférences utilisateur et de la configuration serveur.

## Web Push

L’état réel dépend du support du navigateur, de la permission, de la clé serveur et de la souscription de l’appareil. La désactivation d’un appareil ne supprime pas automatiquement les autres souscriptions.

## Session

La page affiche uniquement la session signée actuelle : authentification, renouvellement, expiration d’inactivité et expiration absolue. La gestion multi-appareils n’est pas présentée sans registre serveur de sessions.

## Confidentialité

Les préférences de visibilité et consentement restent distinctes des permissions d’organisation.

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

## Actions flottantes

L’application utilise un bouton flottant unique. Il ouvre verticalement les actions pertinentes du contexte, notamment la boîte à outils, le guide utilisateur et la navigation secondaire mobile, sans chevaucher la zone de saisie.
