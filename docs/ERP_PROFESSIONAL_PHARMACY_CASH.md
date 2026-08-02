# Module professionnel Pharmacy — Caisse, factures et paiements

**Code canonique :** `CASH_INVOICES_PAYMENTS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Moteurs communs

Le module utilise les sessions de caisse, factures, paiements, allocations et écritures communes. La vue Pharmacy ajoute vente, ordonnance, produit, caissier, reçu, remboursement et retour.

## Cycle

Ouverture → ventes/opérations → comptage → écart → clôture → validation indépendante. Une seule session active s’applique selon les règles configurées.

## Intégrité

Aucun statut payé n’est appliqué sans paiement confirmé et allocation. Une clôture validée n’est pas réécrite silencieusement. Les remboursements et annulations conservent les mouvements inverses et l’audit.

## Expérience

Le workspace est tactile, responsive et affiche soldes, opérations, comptage, écarts, justificatifs et actions autorisées.

## Validation

QA automatisée : caisse commune, facture/paiement uniques, séparation des responsabilités et audit.
E2E propriétaire : scénario `I06-P-004`.
