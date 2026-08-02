# Module professionnel Pharmacy — Retours, ajustements et pertes

**Code canonique :** `RETURNS_ADJUSTMENTS_LOSSES`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le module couvre retour client, retour fournisseur, perte, casse, vol, péremption, destruction, ajustement et correction autorisée.

## Données obligatoires

Produit, lot, quantité, motif, date, responsable, preuve, autorisation, impact stock, impact financier et commentaire.

## Immutabilité

Une opération confirmée n’est pas modifiée silencieusement. Toute correction utilise un mouvement inverse ou une procédure contrôlée, avec conservation des références et de l’historique.

## Convergence

Le stock commun enregistre le mouvement ; Finance reçoit uniquement l’impact nécessaire et évite toute double valorisation.

## Validation

QA automatisée : références lot/produit, mouvements inverses, permissions, audit et idempotence.
E2E propriétaire : scénario `I06-P-004` et campagne finale.
