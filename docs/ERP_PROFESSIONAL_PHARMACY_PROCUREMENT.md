# Module professionnel Pharmacy — Fournisseurs et commandes

**Code canonique :** `SUPPLIERS_ORDERS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Convergence

Le module réutilise les tiers, fournisseurs, commandes d’achat, réceptions, dettes et paiements communs. La vue Pharmacy ajoute licences, spécialités fournies, conformité, température, délais, qualité et documents réglementaires.

## Expérience

Le workspace propose recherche, filtres, création et détail des fournisseurs/commandes, suivi des statuts, lignes, écarts, documents et actions autorisées.

## Intégrité

Aucun fournisseur financier parallèle n’est créé. Toute commande, réception, facture fournisseur et paiement conserve son identité propre et ses liens structurels.

## Sécurité

Les fournisseurs et commandes sont filtrés par `organizationId`. Les validations, changements de statut et documents sensibles exigent permission et audit.

## Validation

QA automatisée : Business Party commun, achat commun, dette/paiement communs et tenant isolation.
E2E propriétaire : campagne `F-003` et scénario Pharmacy de réception.
