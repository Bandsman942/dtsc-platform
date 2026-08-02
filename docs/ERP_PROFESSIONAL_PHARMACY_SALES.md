# Module professionnel Pharmacy — Ventes et dispensation

**Code canonique :** `SALES_DISPENSATION`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Expérience

Le workspace propose recherche/code-barres, panier, patient ou client, prescription, produits, lots FEFO, quantités, prix, taxes, remise autorisée, avertissements, validation pharmacien, paiement et reçu.

## Contraintes

Sont interdits : lot expiré, lot bloqué, quantité supérieure au stock, contournement de l’ordonnance, contournement de la validation pharmacien, double vente, double facture et double paiement.

## Convergence

La vente utilise une facture commune, une créance ou un paiement commun, une session de caisse commune et la comptabilisation commune. Le stock est diminué par un seul mouvement idempotent.

## Confidentialité

Les utilisateurs Finance voient les références financières nécessaires, pas le contenu clinique détaillé de la prescription.

## Validation

QA automatisée : FEFO, lots vendables, stock, facture/paiement communs, idempotence et audit.  
E2E propriétaire : scénarios `I06-P-002` et `I06-P-003`.
