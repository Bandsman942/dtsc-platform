# Preuves — Stabilisation Collaboration post-E2E

## Périmètre

- création de conversation directe par sélection d’un collaborateur autorisé ;
- accusé de lecture à double trait fondé sur une lecture explicite ;
- navigation depuis une réponse vers le message d’origine ;
- hashtags et domaines cliquables dans les annonces ;
- partage natif ou copie du lien canonique ;
- enrichissement de la primitive commune `RichTextEditor`.

## Contrats automatisés

- l’ancien contrat `allRead` reste accepté ;
- le nouveau contrat `readCount` est accepté pour afficher la première lecture réelle ;
- aucun statut de livraison ou de lecture n’est déduit de `lastSeenAt` ;
- l’audit post-E2E dédié est inclus dans `qa:regression` et dans les Quality Gates.

## Promotion

Cette correction ne promeut aucun module vers `COMMERCIAL_READY`. Une nouvelle validation manuelle du propriétaire reste requise après le déploiement Production issu de `main`.
