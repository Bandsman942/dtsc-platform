# ERP professionnel — Stock

## Périmètre

Module canonique : `INVENTORY_LOGISTICS`.

Vues : stock par article et emplacement, transferts, inventaires, ajustements et alertes.

## Invariants

- Stock physique et valorisation comptable restent distincts.
- Les mouvements sont idempotents.
- Le stock négatif est interdit lorsque la politique de l’article l’exige.
- Les validations sensibles sont indépendantes du demandeur.
- Aucun mouvement ni historique n’est supprimé par annulation ou rollback.

## Transferts

Le formulaire utilise les entrepôts et emplacements canoniques, l’article suivi, la quantité, le motif et l’approbateur. Le serveur refuse un trajet incohérent, une quantité invalide ou une sortie non disponible.

Cycle prévu : Brouillon/Soumission → Validation → Transit → Réception → Clôture. Le service existant peut compacter certaines transitions lorsque l’opération est transactionnelle ; l’historique reste la source de vérité.

## Inventaires

- Comptage complet, cyclique ou ciblé.
- Périmètre par entrepôt et emplacement.
- Quantité théorique et quantité comptée.
- Écart calculé côté serveur.
- Validation des écarts avant ajustement.

## Mobile

- Listes tactiles au lieu de tableaux débordants.
- Recherche article/code/SKU.
- Dialogues plein écran.
- Quantités saisissables au clavier numérique.
- Sélecteurs d’emplacement.
- Préparation à un scanner lorsque l’infrastructure navigateur le permet.

## Sécurité

- Isolation tenant.
- Transactions contrôlées.
- Validation des clés étrangères dans la même entreprise.
- Protection contre doubles mouvements et concurrence.
- Audit des transferts, comptages et ajustements.

## Maturité

`PROFESSIONAL_READY` après les contrôles automatisés et déploiement ; validation fonctionnelle manuelle encore requise.
