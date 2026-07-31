# Facturation fournisseurs et dettes

## Chaîne

Fournisseur + commande + réception + justificatif → facture fournisseur → revue → approbation → comptabilisation → dette → paiement/allocation.

Une dépense budgétaire n’est pas une dette. Une réception n’est pas une facture. Les relations `accountingTreatment`, `supplierInvoiceId`, `journalEntryId` et `accountedAt` empêchent la double charge.

## Contrôle à trois voies

Lorsque les références existent, le serveur compare fournisseur, devise, articles, quantités commandées, quantités reçues, prix et taxes. Une variance au-delà de la tolérance reste `VARIANCE` et bloque l’approbation tant qu’une permission renforcée n’a pas enregistré un motif d’override audité.

## Solde

Une dette unique est créée lors de la comptabilisation. Son solde provient des allocations de paiements et avoirs confirmés. Les engagements budgétaires passent progressivement de `committed` à `realized`, sans être comptés deux fois.

## Avoir fournisseur

L’avoir conserve ses lignes, référence la facture, exige une approbation indépendante, contre-comptabilise la charge/taxe et réduit la dette sans modifier l’original.
