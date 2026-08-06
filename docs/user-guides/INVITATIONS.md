# Guide utilisateur — Invitations entreprise
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Invitations entreprise** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Réception

Une invitation reçue est visible dans le compte personnel avant toute adhésion. Vérifiez l’organisation, l’initiateur et le rôle proposé.

## Acceptation

L’acceptation vérifie le destinataire, l’état du compte, l’organisation et le statut du membership. Elle active le membership prévu et peut proposer le changement de contexte.

L’opération est idempotente : rejouer une acceptation déjà réussie renvoie le même résultat sans créer un second membership.

## Refus

Le refus retire l’invitation active, conserve l’historique d’audit et empêche la réutilisation comme invitation en attente.

## Contexte

Après acceptation, l’organisation devient disponible dans le sélecteur si elle est toujours active et autorisée.

## Sécurité

Une invitation ne peut être traitée que par son destinataire. Les actions sont protégées par session, contrôle d’origine, validation, limitation de débit et audit.

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
