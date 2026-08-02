# Comptabilité professionnelle DTSC Platform

## Objet

Le module `FINANCE_ACCOUNTING` transforme les opérations métier validées en information comptable équilibrée, traçable et clôturable. Il réutilise le moteur comptable commun de DTSC Platform ; aucun second grand livre n’est créé.

## Parcours couverts

- plans comptables et comptes hiérarchisés ;
- exercices, périodes et journaux ;
- écritures manuelles équilibrées ;
- soumission, approbation indépendante et comptabilisation ;
- contrepassation non destructive ;
- grand livre et balance générale ;
- règles de comptabilisation et anomalies ;
- piste d’audit et isolation par entreprise.

## Invariants

1. Une écriture comptabilisée respecte toujours `total débit = total crédit`.
2. Une écriture comptabilisée ne se modifie plus directement.
3. Une correction utilise une contrepassation ou une nouvelle écriture corrective.
4. Chaque événement source possède une clé d’idempotence stable.
5. Une période fermée bloque toute mutation non autorisée.
6. Un compte utilisé n’est jamais supprimé physiquement ; il est désactivé.
7. Une simple relation avec une entreprise ne confère aucun accès Finance.

## Workspace

Le workspace dédié expose : Vue d’ensemble, Plans comptables, Comptes, Exercices, Périodes, Journaux, Écritures, Grand livre, Balance générale, Règles de comptabilisation et Anomalies.

Les listes sont paginées côté serveur. Les libellés visibles sont métier et traduits ; aucun UUID ni nom Prisma n’est présenté comme information utilisateur.

## Maturité

Statut après l’itération 5 : `PROFESSIONAL_READY`.

**Tests E2E manuels préparés — validation du propriétaire en attente.**

La promotion vers `COMMERCIAL_READY` exige encore la validation authentifiée du propriétaire, la stabilité Production et l’acceptation commerciale explicite.
