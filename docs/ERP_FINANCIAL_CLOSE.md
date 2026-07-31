# Clôture financière

## États

Exercice : `DRAFT`, `OPEN`, `CLOSING`, `CLOSED`, `ARCHIVED`.

Période : `OPEN`, `SOFT_CLOSED`, `CLOSED`, `LOCKED`.

- `OPEN` : opérations normales.
- `SOFT_CLOSED` : comptabilisation réservée aux permissions renforcées.
- `CLOSED` : aucune comptabilisation normale.
- `LOCKED` : aucune réouverture via le flux standard.

## Checklist

`calculateFinancialCloseChecklist` vérifie notamment :

- absence d’écriture `POSTED` déséquilibrée ;
- brouillons critiques ;
- lots de comptabilisation échoués ;
- caisses non clôturées ;
- rapprochements et transactions non rapprochées ;
- factures non finalisées ;
- paies approuvées encore à traiter selon la politique ;
- comptes de passage non résolus.

## Workflow

Préparation -> soumission -> approbation indépendante -> fermeture explicite. La fermeture reverrouille la période dans la même transaction. La réouverture exige une permission renforcée, un motif, un acteur distinct et un audit. Une période `LOCKED` n’est pas réouverte par ce service.

## Concurrence

Les transitions utilisent verrouillage ligne, `revision` et transaction sérialisable. Une nouvelle anomalie détectée avant la fermeture bloque la commande même si la checklist précédente était prête.

## Rollback

Le rollback applicatif peut désactiver les nouvelles clôtures et conserver la consultation. Il ne supprime aucune écriture, ne modifie aucune période fermée et ne réouvre rien sans audit.
