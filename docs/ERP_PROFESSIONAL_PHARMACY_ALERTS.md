# Module professionnel Pharmacy — Alertes et rappels

**Code canonique :** `ALERTS_EXPIRY_LOW_STOCK`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Centre de traitement

Les alertes forment une file opérationnelle : nouvelle, prise en charge, en cours, résolue, classée.

Chaque alerte contient type, produit, lot, gravité, priorité, date, responsable, échéance, action et historique.

## Sources

Les alertes proviennent des sources métier réelles : stock faible, rupture, péremption proche, lot expiré, quarantaine, rappel, chaîne du froid, document à renouveler ou caisse à clôturer.

## Notifications

Les notifications sont génériques lorsque le contenu pourrait exposer une donnée sensible. Le lien profond ouvre l’objet précis après vérification des permissions.

## Rappel

Un rappel bloque les lots concernés et empêche leur vente. Les actions de notification, récupération, destruction ou clôture sont auditées.

## Validation

QA automatisée : file opérationnelle, lots bloqués, notifications, liens profonds et audit.
E2E propriétaire : scénario `I06-P-005`.
