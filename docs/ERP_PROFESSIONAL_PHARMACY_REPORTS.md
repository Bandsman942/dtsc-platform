# Module professionnel Pharmacy — Rapports

**Code canonique :** `PHARMACY_REPORTS`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Les rapports couvrent stock, péremptions, ventes, marges, lots, fournisseurs, prescriptions, qualité, retours, pertes, caisse et produits contrôlés selon les données disponibles.

## Sources

Les rapports financiers utilisent les factures, paiements, caisse et écritures communs. Les rapports réglementaires utilisent les données Pharmacy spécialisées.

Une transaction Pharmacy et sa projection financière ne sont jamais additionnées comme deux opérations différentes.

## Expérience

Le workspace propose période, site, produit, lot, filtres, pagination, export, visualisations et vues enregistrées lorsque disponibles. Sur mobile, les indicateurs essentiels précèdent les détails volumineux.

## Sécurité

Les rapports respectent le tenant, le plan et les permissions. Les exports ne contiennent aucune donnée patient ou réglementaire non autorisée.

## Validation

QA automatisée : sources dédiées et communes, export contrôlé, absence de double comptage et responsive.  
E2E propriétaire : campagne finale Pharmacy et `F-009`.
