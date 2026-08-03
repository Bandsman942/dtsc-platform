# Module professionnel Pharmacy — Produits et médicaments

**Code canonique :** `MEDICINES_PRODUCTS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le référentiel conserve nom commercial, DCI, code, code-barres, catégorie, forme, dosage, unité, fabricant, marque, voie, règles de prescription, contrôle renforcé, substitution, stockage, prix, taxes, documents et statut.

## Convergence

Chaque produit Pharmacy est relié au catalogue commun lorsque requis. L’extension spécialisée ne recrée ni produit financier ni article commercial isolé.

## Expérience

Le workspace dédié propose recherche, filtres, pagination, formulaire structuré, détail, actions et historique. Les statuts et classifications utilisent des valeurs contrôlées en français.

## Sécurité

Toutes les références et écritures sont limitées à l’organisation active. Les produits contrôlés et modifications critiques exigent les permissions appropriées.

## Validation

QA automatisée : modèle dédié, catalogue commun, routes privées, formulaires, français et responsive.
E2E propriétaire : scénario `I06-P-001`.
