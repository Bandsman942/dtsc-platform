# ERP professionnel — Achats

## Périmètre

Module canonique : `SUPPLIERS_PURCHASES`.

Chaîne : besoin → demande d’achat → validation → fournisseur → commande → réception → stock.

## Référentiels

- Fournisseurs organisations ou personnes.
- Représentants distincts de l’organisation fournisseur.
- Départements, demandeurs et approbateurs.
- Catalogue, sites, entrepôts et emplacements.

## Règles

- Une demande d’achat décrit le besoin, la priorité, la date souhaitée et le centre concerné.
- L’approbation reste distincte de la création.
- La commande fournisseur conserve ses conditions, taxes, devise et site de livraison.
- Une réception peut être partielle ou complète.
- Les quantités reçues, refusées et les écarts sont historisés.
- La réception alimente le stock commun une seule fois.
- Les données nécessaires au contrôle commande-réception-facture sont conservées sans anticiper la refonte Finance.

## UX

- Workspace fournisseur professionnel.
- Workflow demandes, commandes et réceptions.
- Combobox pour membres, départements, fournisseurs, articles et entrepôts.
- Statuts et erreurs traduits en français.
- Formulaires utilisables sur téléphone.

## Sécurité

- Isolation stricte par `organizationId`.
- Validation serveur des fournisseurs et référentiels liés.
- Approbation indépendante selon la politique.
- Idempotence des réceptions et mouvements de stock.
- Journal API et audit sans données financières ou personnelles excessives.

## Maturité

`PROFESSIONAL_READY` en attente des scénarios E2E manuels. `COMMERCIAL_READY` reste interdit avant confirmation du propriétaire.
