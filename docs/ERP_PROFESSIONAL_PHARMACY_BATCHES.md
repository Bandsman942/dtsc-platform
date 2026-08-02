# Module professionnel Pharmacy — Lots et péremptions

**Code canonique :** `BATCH_EXPIRY`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

La fiche lot contient produit, numéro, fournisseur, réception, quantités, dates de fabrication et péremption, emplacement, statut, quarantaine, rappel, température, documents, mouvements et historique.

## Actions

Les actions contrôlées couvrent mise en quarantaine, libération, blocage, rappel, destruction ou ajustement autorisé. Elles sont auditées et ne réécrivent pas silencieusement les mouvements confirmés.

## Alertes

Les vues distinguent péremption proche, expirés, quarantaine, rappel, chaîne du froid et stock bloqué.

## Sécurité

Un lot expiré, rappelé ou bloqué n’est jamais vendable. Les routes revalident le produit, le site et les références dans le même tenant.

## Validation

QA automatisée : modèle lot dédié, péremption, quarantaine, rappel, permissions et responsive.
E2E propriétaire : scénarios `I06-P-001`, `I06-P-003` et `I06-P-005`.
