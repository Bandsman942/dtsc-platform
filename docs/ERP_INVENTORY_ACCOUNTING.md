# Comptabilité du stock commun

## Frontière

Ce domaine valorise uniquement `EnterpriseInventoryItem` et `EnterpriseStockMovement` du Core ERP. `PharmacyBatch`, `PharmacyStockMovement` et la caisse Pharmacy restent sectoriels.

## Méthode canonique

La méthode opérationnelle est `WEIGHTED_AVERAGE`. Elle est configurée dans `EnterpriseFinanceConfiguration` et ne peut pas être changée librement après les premiers événements valorisés.

## Réception

Une entrée commune validée crée :

1. une `EnterpriseInventoryCostLayer` avec quantité, coût unitaire, devise et valeur ;
2. un `EnterpriseInventoryAccountingEvent` idempotent ;
3. une écriture `INVENTORY_RECEIPT_VALUED` : débit Stock, crédit Réception non facturée/Clearing.

## Sortie

Une sortie utilise les couches ouvertes du même article, entrepôt et devise. Le coût moyen pondéré est calculé avec `Prisma.Decimal`. Le service bloque une quantité supérieure au stock comptable valorisé. L’écriture `INVENTORY_ISSUE_VALUED` débite le coût des ventes et crédite le stock.

## Facture fournisseur

La facture fournisseur comptabilise la dette et solde le clearing selon la politique retenue. Une réception n’est jamais une facture et ne crée pas de dette fournisseur.

## Ajustements

Tout ajustement exige motif, permission, approbation et événement d’audit. Les corrections de valorisation sont des événements supplémentaires ou contrepassations, jamais une modification silencieuse d’un événement `POSTED`.

## Rapports

L’état de valorisation agrège les `remainingQuantity` et coûts des couches par article, entrepôt et devise. Il n’additionne pas des devises différentes et ne charge pas tout le journal de mouvements en mémoire.
