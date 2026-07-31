# Règles de comptabilisation ERP

## Registre statique

Le moteur accepte uniquement les événements inscrits dans `posting-registry-final.ts`. Aucun `prisma[sourceEntityType]`, SQL libre, JavaScript libre, règle arbitraire du navigateur ou sélection client d’un compte n’est autorisé.

## Idempotence

La clé stable est :

`organizationId:sourceEntityType:sourceEntityId:postingEvent:postingVersion`.

Un verrou transactionnel PostgreSQL et une contrainte unique empêchent les doubles écritures lors des retries.

## Règles principales

| Événement | Débit | Crédit |
|---|---|---|
| Facture client | Créances clients | Produits + taxe à payer |
| Paiement client | Trésorerie | Avance client, puis reclassement vers créance lors de l’allocation |
| Facture fournisseur | Charge, stock, actif ou clearing | Dettes fournisseurs |
| Paiement fournisseur | Avance fournisseur, puis dette lors de l’allocation | Trésorerie |
| Paie approuvée | Charges de personnel | Dette salariale + retenues |
| Réception valorisée | Stock | Réceptions non facturées |
| Sortie valorisée | Coût des ventes | Stock |
| Capitalisation | Immobilisation | Clearing actif |
| Amortissement | Charge d’amortissement | Amortissement cumulé |

## Contrôles avant POSTED

Configuration prête, période autorisée, journal actif, comptes actifs, dimensions tenant-aware, taux disponible, équilibre fonctionnel et séparation des responsabilités.

## Correction

Une écriture comptabilisée ne change jamais. La contrepassation inverse exactement ses lignes et conserve les liens source, utilisateur, date, motif et écriture originale.
