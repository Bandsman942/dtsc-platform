# ERP professionnel — Ventes

## Périmètre

Module canonique : `SALES_QUOTES_ORDERS`.

Chaîne : client/prospect → devis → acceptation/refus → commande → livraison partielle ou complète.

## Référentiels

- Tiers et rôles client/prospect.
- Catalogue canonique de produits et services.
- Sites, entrepôts et emplacements pour les produits physiques.
- Utilisateurs responsables et permissions serveur.

## Règles

- Le formulaire n’accepte aucun identifiant technique saisi librement.
- Le frontend prévisualise ; le serveur recalcule sous-total, remises, taxes, total et arrondis.
- Un devis accepté peut être converti en commande de manière contrôlée.
- Une livraison ne dépasse jamais le reliquat.
- Chaque livraison possède une clé d’idempotence.
- Commande, facture, créance et paiement restent distincts.

## États principaux

- Devis : Brouillon, Envoyé, Accepté, Refusé, Expiré, Converti en commande, Annulé.
- Commande : Brouillon, En attente de validation, À préparer, Partiellement livré, Livré, Clôturé, Annulé.

## UX

- KPI horizontaux sur mobile.
- Recherche par référence, titre ou tiers.
- Filtres de statut.
- Formulaire long en dialogue plein écran mobile.
- Détail des lignes et reliquats.
- Actions contextuelles dépendantes du statut.

## Sécurité

Toutes les opérations vérifient session, contexte, organisation, membership, activation du module, abonnement, permission, visibilité, same-origin, Zod, rate limit, transaction, journal API et audit.

## Maturité

`PROFESSIONAL_READY` après Quality Gates, migrations et déploiement. Promotion `COMMERCIAL_READY` uniquement après validation manuelle du propriétaire, packaging, onboarding et support.
