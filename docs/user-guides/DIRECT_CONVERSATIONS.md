# Guide utilisateur — Conversations directes
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Conversations directes** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

Envoyez un texte, répondez à un message, joignez un fichier réel, réagissez, épinglez selon vos droits ou signalez un contenu. En cas de perte réseau, utilisez **Réessayer** : la clé du message empêche un doublon.

Les états **envoyé** et **lu** apparaissent seulement lorsqu’ils sont prouvés. Un correspondant bloqué ne peut plus lancer de message ni d’appel.

## Démarrer et parcourir une conversation

Dans **Nouvelle conversation directe**, touchez toute la ligne du collaborateur autorisé. DTSC crée ou rouvre la conversation directe existante sans doublon. Pendant l’ouverture, la ligne est temporairement désactivée pour éviter un double appui.

Un trait confirme l’envoi au serveur. Deux traits apparaissent dès qu’une lecture explicite est enregistrée. Touchez l’extrait d’un message cité pour revenir au message d’origine, y compris lorsqu’il doit être rechargé dans l’historique.

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
