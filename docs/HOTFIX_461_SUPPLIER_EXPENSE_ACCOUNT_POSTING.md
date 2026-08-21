# Hotfix #461 — comptes de charge des factures fournisseurs

## Contexte

Le modèle de données Finance possédait déjà `EnterpriseSupplierInvoiceItem.expenseAccountId` et le schéma d’entrée acceptait déjà cette référence. Pourtant, le formulaire de facture fournisseur ne proposait aucun compte de charge et le posting `SUPPLIER_INVOICE_POSTED` débitait le mapping générique `OPERATING_EXPENSE` pour la totalité du sous-total d’une facture fournisseur ordinaire.

Avec la baseline SYSCOHADA actuelle, ce mapping générique pointe notamment vers le compte `621 — Sous-traitance générale`. Une facture qui doit être classée dans un autre compte de charge actif, par exemple `6588 — Autres charges diverses`, pouvait donc être comptabilisée dans une catégorie différente de celle attendue.

Baseline du hotfix : `main@530324c47d7eae42090972ad778bc453a58f1d68`.

Ce travail suit `docs/CONTRIBUTING.md`, le `AGENTS.md` racine et `lib/enterprise/accounting/AGENTS.md`.

## Correction utilisateur

Dans le formulaire de création d’une facture fournisseur, chaque ligne peut désormais sélectionner un compte de charge parmi les comptes réellement disponibles pour l’organisation.

La liste est limitée côté serveur aux comptes :

- de la même `organizationId` ;
- actifs ;
- non archivés ;
- de type `EXPENSE` ou `OTHER_EXPENSE` ;
- autorisés à recevoir des écritures directes (`allowDirectPosting=true`).

Le libellé rendu au client conserve le code comptable et le nom du compte dans la langue active, sans exposer d’identifiant technique.

La sélection reste optionnelle pour préserver les factures historiques et les intégrations existantes. Lorsqu’aucun compte explicite n’est fourni sur une facture ordinaire, le mapping canonique `OPERATING_EXPENSE` reste le fallback de compatibilité.

## Validation serveur

Une référence `expenseAccountId` fournie par le client n’est jamais considérée comme fiable.

À la création de la facture, toutes les références de comptes de charge explicites sont revalidées dans une requête tenant-scoped. Une facture est rejetée si un compte :

- appartient à une autre organisation ;
- est inactif ou archivé ;
- n’est pas un compte de charge ;
- interdit la comptabilisation directe.

Le même contrôle est rejoué au moment du posting afin d’empêcher qu’un compte devenu invalide entre la création du brouillon et sa comptabilisation soit utilisé dans une écriture.

## Posting comptable

Pour une facture fournisseur ordinaire, le moteur comptable produit désormais les débits ligne par ligne :

- ligne avec `expenseAccountId` explicite → `ACCOUNT_ID:<expenseAccountId>` ;
- ligne historique sans compte explicite → mapping `OPERATING_EXPENSE`.

Chaque ligne utilise son `netAmount`. La taxe récupérable et la dette fournisseur continuent d’utiliser les mappings canoniques existants.

Les chemins spécialisés restent inchangés :

- facture liée à une réception de marchandises → `GOODS_RECEIVED_CLEARING` ;
- facture liée à une immobilisation → `FIXED_ASSET` ;
- crédit fournisseur → logique existante ;
- paiement fournisseur → logique existante.

`posting-service.ts` reste l’autorité de préparation des lignes, de conversion multi-devise, de contrôle de l’équilibre, d’idempotence, de période et de création de l’écriture `POSTED`.

## Exemple attendu

Pour une facture fournisseur ordinaire de 50 000 CDF dont la ligne est affectée au compte `6588 — Autres charges diverses`, le posting attendu est :

```text
Débit  6588  Autres charges diverses     50 000 CDF
Crédit 401   Fournisseurs                 50 000 CDF
```

Le compte collectif fournisseur n’est pas choisi manuellement dans la ligne : il continue d’être résolu par le mapping `ACCOUNTS_PAYABLE` du moteur comptable.

## Base de données et migrations

- migration Prisma : aucune ;
- backfill : aucun ;
- schéma : inchangé ;
- `expenseAccountId` existait déjà sur `EnterpriseSupplierInvoiceItem` ;
- aucune écriture déjà `POSTED` n’est modifiée ou recalculée.

## Sécurité et isolation multi-tenant

- lookup des comptes filtrée par `organizationId` ;
- revalidation serveur à la création ;
- revalidation serveur au posting ;
- aucun bypass par rôle global ;
- permissions Finance existantes conservées ;
- aucun numéro de compte réglementaire n’est codé en dur dans le moteur de posting ;
- aucune écriture existante n’est réécrite.

## QA

Le hotfix renforce `scripts/qa-enterprise-payables-checks.mjs` pour vérifier statiquement :

- la présence de la lookup `expenseAccounts` limitée à `FINANCE_PAYABLES` ;
- le filtrage `EXPENSE` / `OTHER_EXPENSE` et `allowDirectPosting` ;
- la revalidation serveur de `expenseAccountId` ;
- la persistance de la référence sur la ligne fournisseur ;
- l’utilisation de `ACCOUNT_ID:<expenseAccountId>` dans le posting ordinaire ;
- la conservation des branches `GOODS_RECEIVED_CLEARING` et `FIXED_ASSET` ;
- la présence de la sélection du compte dans le workspace fournisseur ;
- la présence d’une acceptance réelle dans `tests/e2e/erp-cross-module-finance.spec.mjs`.

L’acceptance Finance existante est renforcée pour créer une facture fournisseur affectée explicitement au compte `6588`, la comptabiliser via l’API de transition, contrôler l’équilibre de l’écriture et vérifier que le débit final porte réellement sur le compte sélectionné. Le même scénario conserve le contrôle d’idempotence et la création unique de la dette fournisseur.

Les Quality Gates, Regression QA, type-check, lint, build et l’acceptance comptable doivent être prouvés par CI sur le head final de la PR. Aucun de ces contrôles n’est déclaré réussi tant que GitHub Actions n’a pas fourni la preuve correspondante.

## OWNER_E2E avant fusion

Après CI verte, le propriétaire doit valider au minimum :

1. ouvrir Finance → Dettes fournisseurs → Nouvelle facture fournisseur ;
2. ajouter une ligne et vérifier que seuls les comptes de charges utilisables de l’entreprise sont proposés ;
3. sélectionner `6588 — Autres charges diverses` sur une ligne de test ;
4. enregistrer la facture puis parcourir le workflow jusqu’à la comptabilisation ;
5. vérifier dans les écritures / le grand livre que le débit porte sur `6588` et que la dette fournisseur est correctement créditée ;
6. refaire un test avec plusieurs lignes affectées à des comptes de charges différents ;
7. vérifier une facture liée à une réception de marchandises pour confirmer que le flux stock n’a pas régressé ;
8. vérifier FR/EN, mobile/desktop et clair/sombre sur le formulaire modifié.

`OWNER_E2E` doit être confirmé explicitement avant merge.

## Déploiement

Aucune Preview Vercel n’est créée pour ce hotfix. La Production ne peut provenir que de `main` après Quality Gates, OWNER_E2E et merge conformément à `docs/CONTRIBUTING.md`.

## Rollback

Revert applicatif de la PR. Aucune migration ni restauration de données n’est nécessaire. Les écritures déjà comptabilisées restent immuables.
