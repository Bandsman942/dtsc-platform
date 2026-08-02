# Module professionnel Pharmacy — Entrées et réceptions

**Code canonique :** `STOCK_RECEIPTS`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Parcours

```text
commande fournisseur commune → réception → contrôle
→ création/sélection des lots → péremption → emplacement
→ validation → entrée de stock
```

## Expérience

Le workspace présente commande, fournisseur, lignes attendues, quantités reçues, écarts, lots, dates, contrôle qualité, température éventuelle, documents et responsable.

## Convergence

Les fournisseurs et commandes proviennent des référentiels communs. La réception alimente le moteur de stock commun et conserve un lien unique vers la dette ou facture fournisseur applicable.

## Idempotence

Une réception validée ne produit qu’une seule entrée stock et un seul lien financier. Les nouvelles tentatives avec la même clé retournent le résultat existant ou sont refusées.

## Validation

QA automatisée : achats communs, lots, mouvement unique, audit et permissions.  
E2E propriétaire : scénario `I06-P-001` et campagne finale `F-003`.
