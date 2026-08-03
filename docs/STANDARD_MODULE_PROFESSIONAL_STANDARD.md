# Standard professionnel des modules non ERP

Un écran ou une route n’est pas un module professionnel. Un module standard atteint `PROFESSIONAL_READY` uniquement lorsque les exigences suivantes sont prouvées.

## Architecture

- source canonique identifiée ;
- aucun moteur parallèle à un domaine ERP ou standard existant ;
- service métier explicite pour les transitions sensibles ;
- transactions et idempotence adaptées ;
- isolation tenant systématique ;
- audit, logs structurés et erreurs corrélées ;
- erreurs métier humaines côté utilisateur.

## Accès

Toute lecture ou mutation considère, selon le contexte : session, rôle global, contexte actif, organisation, membership, poste, permission, propriété, plan, abonnement, limites, statut, module et action. Les capacités retournées au frontend sont uniquement des indications d’affichage ; l’action est toujours revérifiée côté serveur.

## UX

Le module propose lorsque pertinent : vue générale, liste, recherche, filtres, tri, pagination, création, détail, modification, archivage ou suppression contrôlée, restauration, états vides, chargement, erreurs, confirmations, historique, liens profonds, mobile et accessibilité.

## Collaboration

Commentaires, pièces jointes, mentions, participants, observateurs, notifications et historique sont ajoutés seulement lorsqu’ils correspondent au métier réel. Un commentaire ne remplace jamais une décision de workflow.

## Documentation

Un guide exact décrit l’objectif, le public, les prérequis, les rôles, l’accès, les parcours, les statuts, les documents, les commentaires, les notifications, le mobile, la sécurité, les erreurs, les limites et le support. Une fonction planifiée n’est jamais documentée comme active.

## Qualité

La promotion vers `PROFESSIONAL_READY` exige : tests ciblés, QA statique et métier, non-régression, type-check, lint, build, compatibilité base vide/base existante lorsque concernée, CI/CD verte, documentation et Production stable.

La promotion vers `COMMERCIAL_READY` exige en plus une validation manuelle explicite du propriétaire après tests E2E Production. Aucun script n’effectue cette promotion automatiquement.
