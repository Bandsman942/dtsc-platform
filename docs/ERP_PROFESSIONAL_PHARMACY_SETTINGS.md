# Module professionnel Pharmacy — Paramètres

**Code canonique :** `PHARMACY_SETTINGS`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Sections

Numérotation, FEFO, seuils, alertes, validation pharmacien, produits contrôlés, stockage, température, devise, caisse, documents et qualité.

## Effet et historique

Chaque paramètre explique son effet, les modules concernés, les risques, la date d’effet, l’auteur et l’historique. Une modification ne réécrit pas silencieusement les règles déjà appliquées à une transaction confirmée.

## Sécurité

Les paramètres critiques exigent permission, confirmation, audit et, lorsque configuré, double validation. Les changements sont isolés dans l’entreprise active.

## Expérience

Le workspace organise les paramètres par section, utilise des valeurs contrôlées en français et affiche les avertissements avant une modification risquée.

## Validation

QA automatisée : permissions, date d’effet, audit, FEFO et règles critiques.  
E2E propriétaire : campagne Pharmacy finale.
