# Règles de comptabilisation ERP

## Registre statique

Le moteur accepte uniquement les événements inscrits dans `posting-registry-final.ts`. Aucun `prisma[sourceEntityType]`, SQL libre, JavaScript libre, règle arbitraire du navigateur ou sélection client non validée d’un compte n’est autorisé.

Les mappings configurables complètent le registre, mais ils ne peuvent pas introduire une source inconnue ni contourner les contrôles du service de posting.

## Idempotence

La clé stable est :

`organizationId:sourceEntityType:sourceEntityId:postingEvent:postingVersion`.

Un verrou transactionnel PostgreSQL et une contrainte unique empêchent les doubles écritures lors des retries, doubles clics ou reprises de worker. Une relance retourne le lot existant ou son statut ; elle ne duplique pas l’écriture.

## Règles principales

| Événement | Débit | Crédit |
|---|---|---|
| Facture client | Créances clients | Produits + taxe à payer |
| Avoir client | Produits et taxe à payer | Créances clients |
| Paiement client | Trésorerie | Avance client, puis reclassement vers créance lors de l’allocation |
| Facture fournisseur | Charge, stock, actif ou clearing | Dettes fournisseurs |
| Avoir fournisseur | Dettes fournisseurs | Charge, stock, actif ou clearing |
| Paiement fournisseur | Avance fournisseur, puis dette lors de l’allocation | Trésorerie |
| Transfert confirmé | Compte financier destination ou clearing | Compte financier source ou clearing |
| Paie approuvée | Charges de personnel | Dette salariale + retenues |
| Réception valorisée | Stock | Réceptions non facturées |
| Sortie valorisée | Coût des ventes | Stock |
| Capitalisation | Immobilisation | Clearing actif |
| Amortissement | Charge d’amortissement | Amortissement cumulé |
| Cession d’actif | Trésorerie ou créance + amortissement cumulé + perte éventuelle | Immobilisation + gain éventuel |
| Ajustement autorisé | Selon la règle versionnée | Selon la règle versionnée |
| Clôture | Selon la procédure de clôture | Selon la procédure de clôture |

## Dates d’effet et versionnement

Une règle ou un mapping déjà utilisé n’est pas modifié de manière rétroactive. Une évolution utilise une nouvelle version, une nouvelle date d’effet ou la désactivation contrôlée de l’ancienne règle.

Le taux fiscal et le taux de change utilisés sont conservés avec l’opération ou son snapshot ; une modification ultérieure de configuration ne réécrit pas l’historique.

## Simulation

Une simulation peut sélectionner l’événement, résoudre la règle, proposer les comptes et vérifier l’équilibre. Elle ne crée ni lot de posting, ni écriture, ni mouvement de trésorerie.

## Contrôles avant `POSTED`

- organisation cliente et module actif ;
- permission Finance correspondante ;
- source et objet source autorisés ;
- configuration prête ;
- période autorisée ;
- journal actif ;
- comptes actifs et du même tenant ;
- dimensions tenant-aware ;
- devise et taux disponibles ;
- équilibre fonctionnel ;
- clé d’idempotence libre ou lot existant cohérent ;
- séparation des responsabilités.

## Anomalies et reprise

Les lots en échec conservent un code et un message bornés. La vue professionnelle expose les anomalies sans imprimer les écritures complètes ni les données sensibles.

La reprise est autorisée seulement après correction de la cause et réutilise la même identité métier. Elle ne crée pas une seconde écriture lorsque le premier posting a déjà réussi.

## Correction

Une écriture comptabilisée ne change jamais. La contrepassation inverse exactement ses lignes et conserve les liens source, utilisateur, date, motif et écriture originale.

Une contrepassation ne supprime pas l’original et ne réutilise jamais une séquence déjà consommée.
