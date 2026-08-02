# Module professionnel Pharmacy — Stock et inventaire

**Code canonique :** `STOCK_INVENTORY`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le module présente le stock par produit, lot, site et emplacement, les mouvements, inventaires, écarts, alertes et blocages. Le moteur de stock commun reste l’autorité des quantités physiques.

## Inventaire mobile

Le parcours est : périmètre → scan/recherche → quantité → confirmation du lot → comparaison → justification → approbation → ajustement unique.

## Contraintes

- FEFO conservé ;
- lots vendables uniquement ;
- stock négatif interdit lorsque la règle s’applique ;
- écritures idempotentes ;
- aucune double correction ;
- isolation tenant sur chaque mouvement.

## Expérience

Les grandes tables deviennent des listes compactes sur téléphone. Les écarts et validations restent accessibles sans débordement ni mot cassé.

## Validation

QA automatisée : source stock commune, mouvements, inventaires, idempotence, mobile et permissions.
E2E propriétaire : scénario `I06-P-006`.
