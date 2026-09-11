# Hotfix #618 — Référentiel des devises et erreurs Trésorerie

## Résumé

Ce hotfix corrige deux incohérences Finance liées : le référentiel `EnterpriseCurrency` existait sans surface d’administration entreprise alors que les nouveaux sélecteurs Trésorerie en dépendaient, et le frontend Finance transformait certains refus métier précis du backend en erreurs génériques.

## Changements utilisateur

- ajout de `Finance > Vue d’ensemble > Référentiel des devises` ;
- gestion des devises propres à l’entreprise ;
- devises globales DTSC visibles en lecture seule ;
- devise fonctionnelle et devise de présentation sélectionnées depuis le référentiel ;
- création d’un compte Trésorerie alimentée par la même source canonique ;
- publication des taux de change limitée aux devises actives du référentiel ;
- refus d’archivage Trésorerie affichés avec une raison métier spécifique : solde non nul, session de caisse active, transfert en attente, conflit de révision ou compte indisponible.

## Intégrité et sécurité

Les règles d’archivage ne sont pas assouplies. Le serveur continue d’exiger un compte sans solde, sans session active et sans transfert non terminé. Les mutations devises sont tenant-scoped, auditées et protégées par les permissions Finance canoniques.

Une devise entreprise utilisée par la configuration Finance, un compte financier actif ou un taux actif ne peut pas être désactivée.

## Architecture

La résolution des devises est centralisée dans `lib/enterprise/accounting/currency-service.ts`. Trésorerie, Comptabilité, Configuration Finance et Taux de change ne doivent plus maintenir leur propre lecture parallèle de `EnterpriseCurrency`.

Le contrat de mutation Finance transporte désormais le code d’erreur, le message client sûr, les détails structurés et le statut HTTP afin que la couche UI conserve la cause métier.

## Base de données

Aucune modification du schéma Prisma et aucune migration SQL. Le modèle `EnterpriseCurrency` existait déjà.

## Gouvernance

`docs/CONTRIBUTING.md` a été enrichi avant l’implémentation avec un préflight opposable, le contrat de PR dès le démarrage, la carte des contrats transverses du repository, le contrat des erreurs client, la matrice de preuves et les vérifications entitlements/i18n/responsive/QA.

## Validation attendue

- `git diff --check` ;
- `pnpm prisma:generate` ;
- `pnpm type-check` ;
- `node scripts/qa-hotfix-618-finance-currency-treasury-errors.mjs` ;
- `pnpm qa:regression` ;
- `pnpm lint` ;
- `pnpm build` ;
- OWNER_E2E selon l’Issue #618.

## Rollback

Revert applicatif de la PR. Aucune migration de schéma ne doit être annulée.
