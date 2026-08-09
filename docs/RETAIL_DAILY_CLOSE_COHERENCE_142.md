# Retail daily close coherence — Issue #142

## Scope

Cette tranche extrait l’expérience `RETAIL_DAILY_CLOSE` du gros workspace Shop sans modifier le moteur transactionnel Retail/Finance ni le schéma Prisma.

## Source de vérité

- les comptes financiers, caisses et soldes restent gérés par Finance/Treasury ;
- la session de caisse reste gérée par `EnterpriseCashSession` ;
- la clôture journalière reste gérée par `EnterpriseRetailDailyClose` ;
- les validations et écritures de variance restent déclenchées par les services Retail/Finance existants ;
- aucune seconde source de vérité ni aucun dual-write n’est introduit.

## Parcours client

`RETAIL_DAILY_CLOSE` dispose désormais d’un workspace dédié qui présente :

1. l’état de la caisse active ;
2. les liens vers Finance > Caisse et Finance > Trésorerie ;
3. les comptes et soldes pertinents avec libellés métier FR/EN ;
4. l’ouverture de caisse pour les utilisateurs déjà autorisés ;
5. la saisie et la soumission idempotente de la clôture ;
6. les écarts et leurs motifs ;
7. l’historique borné des clôtures ;
8. la validation ou le refus uniquement pour les utilisateurs disposant déjà de la permission `manage`.

La séparation demandeur/validateur reste imposée côté service : l’auteur d’une clôture ne peut pas valider sa propre soumission.

## Langage client

Le workspace utilise les mappings partagés :

- `customerFacingError` ;
- `customerFacingStatusLabel` ;
- `customerFacingFinancialAccountType`.

Les types de comptes et statuts techniques ne sont plus utilisés comme libellés visibles de la clôture.

## Mobile

Le parcours est conçu mobile-first :

- aucune table large ;
- cartes de soldes responsives ;
- formulaires mono-colonne sur petit écran ;
- rail de filtres horizontal tactile ;
- actions Finance et validation accessibles ;
- acceptance Playwright dédiée à 390 px.

## QA

La tranche renforce :

- `scripts/qa-retail-product-coherence.mjs` ;
- `tests/e2e/shop2-daily-close-ui.spec.mjs` ;
- `.github/workflows/shop2-behavioral.yml`.

Les checks statiques bloquent notamment :

- le retour de `RETAIL_DAILY_CLOSE` dans le workspace générique ;
- l’affichage direct de `accountType` ;
- la disparition des liens Finance ;
- la perte de l’idempotence ;
- le chargement non borné de l’historique.

## Rollback

Rollback applicatif par revert de la PR. Aucune migration ni correction de données n’est nécessaire.
