# Guide utilisateur — Invitations entreprise

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
