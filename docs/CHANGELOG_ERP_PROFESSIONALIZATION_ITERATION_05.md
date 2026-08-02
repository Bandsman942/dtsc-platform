# Changelog — Professionnalisation ERP, itération 5

## Point de départ

- `main` : `8b2ab572eece626ce576ea09de42dbe35df0da9e`
- Branche : `feat/erp-professionalization-iteration-05-accounting-close-statements`
- PR : #47

## Architecture

Les moteurs existants ont été réutilisés : partie double, posting idempotent, périodes, journaux, taxes, clôture, états, immobilisations et coût moyen pondéré. Aucun second moteur comptable ni migration destructive n’a été introduit.

## Interfaces

- remplacement du workspace générique par un workspace Finance avancée dédié ;
- navigation professionnelle Comptabilité, Fiscalité, Clôture, États, Immobilisations et Valorisation ;
- KPI responsives, listes paginées, recherche, filtres et empty states ;
- formulaires réels pour les principales opérations ;
- libellés métier français et masquage des identifiants techniques.

## Comptabilité

- gestion des plans comptables ;
- grand livre, balance, règles et anomalies ;
- écritures équilibrées avec workflow ;
- contrepassation non destructive et acteur indépendant.

## Finance avancée

- taux fiscaux à date d’effet ;
- checklist de clôture et réouverture motivée ;
- aperçu et publication immuable des états ;
- capitalisation d’actifs et amortissements idempotents ;
- valorisation au coût moyen pondéré et publication immuable.

## Sécurité

Les erreurs de séparation des responsabilités sont désormais retournées comme conflits métier explicites. Les contrôles tenant, same-origin, permission, audit et rate limiting restent côté serveur.

## Maturité

Les six modules sont évalués `PROFESSIONAL_READY`, `commercializable: false`.

**Tests E2E manuels préparés — validation du propriétaire en attente.**
