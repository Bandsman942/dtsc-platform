# Paiements et allocations professionnels

## Concepts

Un paiement n’est ni une facture ni une allocation. Le module prend en charge encaissement client, paiement fournisseur, paiement de paie, remboursement et autre paiement autorisé. Les transferts restent dans Trésorerie.

## Workflow

Brouillon → soumission → approbation indépendante → confirmation → allocation → comptabilisation. Rejet, annulation avant confirmation, remboursement et contrepassation utilisent les services communs.

## Allocation

L’écran d’affectation filtre les créances ou dettes compatibles par organisation, tiers et devise. Le serveur refuse : dépassement du paiement disponible, dépassement du solde, double allocation, lien inter-tenant, période interdite et modification silencieuse d’une allocation confirmée.

## Paiements non affectés

La vue dédiée expose montant, âge, tiers, compte et action recommandée. Un paiement confirmé peut rester non affecté sans perdre sa traçabilité.

## Sécurité

Les initiateurs et approbateurs sont séparés lorsque la politique l’exige. Les références externes sont masquées, les documents restent privés, et chaque mutation sensible est auditée et idempotente.

## Maturité

`PROFESSIONAL_READY`, `commercializable: false` jusqu’à validation manuelle explicite du propriétaire.
