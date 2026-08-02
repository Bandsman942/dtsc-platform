# Module professionnel Pharmacy — Ordonnances et prescriptions

**Code canonique :** `PRESCRIPTIONS`  
**Maturité :** `PROFESSIONAL_READY`  
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le module gère patient, prescripteur, date, validité, produit, dose, fréquence, durée, quantité, instructions, documents et statut.

## Workflow

La prescription est vérifiée par un pharmacien : conformité, disponibilité, substitution autorisée, validation et lien vers la dispensation. Les décisions et corrections sont historisées.

## Expérience

Le workspace dédié fournit recherche, filtres, formulaire structuré, détail, actions de validation et accès à la dispensation autorisée.

## Confidentialité

Le contenu clinique est visible uniquement aux rôles autorisés. Finance ne reçoit que les références génériques nécessaires à la facture ou au paiement.

## Intégrité

Une prescription ne peut pas être utilisée pour contourner les règles de lot, stock, validation pharmacien ou quantité. Les références patient, produit et prescripteur sont tenant-scoped.

## Validation

QA automatisée : modèles dédiés, validation pharmacien, relations tenant, audit et responsive.  
E2E propriétaire : scénario `I06-P-002`.
