# DTSC Platform — Référentiel canonique des devises Finance

## 1. Objectif

Le référentiel des devises est une capacité Finance transverse. Il alimente la configuration Finance, les comptes de Trésorerie, les options comptables et les taux de change sans créer de source parallèle par module ou par secteur.

La source persistée reste le modèle Prisma `EnterpriseCurrency`. Le service canonique applicatif est `lib/enterprise/accounting/currency-service.ts`.

## 2. Portée et résolution

Une devise peut être :

- **globale DTSC** : `organizationId = null` ;
- **spécifique à l’entreprise** : `organizationId = <organisation>`.

La résolution effective est faite par code de devise :

1. les devises globales actives servent de socle commun ;
2. une ligne spécifique à l’entreprise portant le même code prend priorité ;
3. une ligne entreprise désactivée masque donc le code global correspondant pour cette entreprise ;
4. les listes opérationnelles utilisent uniquement les devises effectives actives.

Cette règle permet un socle global sans empêcher un paramétrage entreprise explicite.

## 3. Interface administrateur entreprise

Chemin :

`Finance > Vue d’ensemble > Référentiel des devises`

Route :

`/enterprise-modules/FINANCE_OVERVIEW/currencies`

Un utilisateur disposant de l’accès Finance peut consulter le référentiel. Les mutations exigent la permission `manage` du module `FINANCE_OVERVIEW`.

L’écran permet :

- de consulter les devises globales DTSC en lecture seule ;
- d’ajouter une devise propre à l’entreprise ;
- de modifier le nom, le symbole, la précision et la règle d’arrondi d’une devise entreprise ;
- de désactiver ou réactiver une devise entreprise lorsqu’aucune dépendance Finance active ne la bloque ;
- de voir si une devise est actuellement utilisée.

Les champs exposés sont :

- code ISO à trois lettres ;
- nom ;
- symbole facultatif ;
- précision ;
- règle d’arrondi ;
- statut actif/inactif.

## 4. Configuration Finance

La devise fonctionnelle et la devise de présentation ne sont plus des codes libres saisis au clavier. Elles sont sélectionnées à partir du référentiel effectif de l’entreprise.

Le backend revalide toute nouvelle devise fonctionnelle ou de présentation avec `assertEnterpriseCurrencyActiveTx()`.

Une organisation historique dont la configuration référence déjà un code absent du référentiel conserve ce code en lecture pour permettre sa réparation. En revanche, ce code ne devient pas valide pour une nouvelle configuration tant qu’il n’a pas été ajouté ou réactivé dans le référentiel.

## 5. Trésorerie

Le formulaire de création d’un compte financier utilise le lookup canonique du référentiel. Il n’accepte plus un code arbitraire.

Le backend de création d’un compte revalide la devise avant de persister :

- devise active globale ou entreprise : acceptée ;
- override entreprise désactivé : refus `FINANCE_CURRENCY_INACTIVE` ;
- devise inconnue : refus `FINANCE_CURRENCY_NOT_CONFIGURED`.

Le lookup agrégé historique conserve uniquement un fallback de lecture pour les comptes anciens dont la devise n’est pas encore réparée. Ce fallback ne permet pas de créer de nouvelles données avec un code non configuré.

## 6. Taux de change

`EnterpriseExchangeRate` reste l’unique source des taux de change. Le référentiel `EnterpriseCurrency` définit quelles devises peuvent être choisies pour publier un nouveau taux.

La création d’un taux valide désormais la devise source et la devise cible contre le référentiel canonique. Les codes historiques déjà présents dans des comptes, une configuration ou un taux restent visibles pour audit, mais ne sont pas valides pour une nouvelle publication tant qu’ils ne sont pas configurés.

Voir aussi `docs/ENTERPRISE_EXCHANGE_RATES.md`.

## 7. Désactivation d’une devise

Une devise entreprise ne peut pas être désactivée si elle est encore utilisée par :

- la devise fonctionnelle ;
- la devise de présentation ;
- un compte financier actif ;
- un taux de change actif.

Le refus utilise `FINANCE_CURRENCY_IN_USE` avec des détails structurés côté backend. L’interface ne doit jamais contourner cette règle.

Les devises globales DTSC ne sont pas modifiables par l’administrateur d’une entreprise.

## 8. Sécurité et multi-tenant

Les APIs du référentiel appliquent :

- session active ;
- contexte organisation actif ;
- membership ;
- entitlement/module Finance canonique ;
- permission `view` ou `manage` selon l’action ;
- same-origin pour les mutations ;
- validation Zod ;
- rate limit ;
- transactions sérialisables pour les mutations ;
- `ApiLog` et `AuditLog` ;
- filtrage strict par `organizationId`.

Une entreprise ne peut jamais modifier une devise globale ni la devise spécifique d’une autre organisation.

## 9. Contrat des erreurs Trésorerie

Les refus d’archivage d’un compte ne sont pas des erreurs techniques génériques. Le backend distingue notamment :

- `TREASURY_ACCOUNT_NOT_FOUND` ;
- `TREASURY_ACCOUNT_CONFLICT` ;
- `TREASURY_ACCOUNT_BALANCE_NOT_ZERO` ;
- `TREASURY_ACCOUNT_ACTIVE_CASH_SESSION` ;
- `TREASURY_ACCOUNT_PENDING_TRANSFER`.

Les contrôles d’intégrité restent inchangés : un compte n’est archivable que si ses soldes sont à zéro, qu’aucune session de caisse active ne l’utilise et qu’aucun transfert non terminé ne le référence.

Le contrat client Finance transporte le code, le message client sûr, les détails structurés non sensibles et le statut HTTP afin que `safeFinanceError()` puisse afficher une explication métier précise en FR/EN sans exposer Prisma, SQL ou une stack trace.

## 10. Données et migration

Le hotfix #618 ne modifie pas le schéma Prisma : `EnterpriseCurrency` existait déjà. Aucune migration SQL ni réécriture de migration historique n’est requise.

Les organisations existantes doivent compléter leur référentiel depuis l’interface. Les données historiques restent lisibles pendant cette remise en conformité.

## 11. QA et OWNER_E2E

La QA statique dédiée est :

`node scripts/qa-hotfix-618-finance-currency-treasury-errors.mjs`

Le parcours propriétaire requis avant merge couvre au minimum :

1. ouvrir Finance > Vue d’ensemble > Référentiel des devises ;
2. créer ou activer les devises nécessaires ;
3. sélectionner la devise fonctionnelle et la devise de présentation depuis les combobox ;
4. créer un compte Trésorerie et vérifier que la combobox affiche les devises configurées ;
5. vérifier qu’un compte à solde zéro, sans session ouverte ni transfert en attente, peut être archivé ;
6. vérifier qu’un compte à solde non nul affiche le message métier spécifique ;
7. vérifier le message spécifique pour une session de caisse active ;
8. vérifier le message spécifique pour un transfert en attente ;
9. vérifier FR/EN, clair/sombre et mobile/desktop.

## 12. Rollback

Le rollback est applicatif : revert de la PR concernée. Aucune migration de schéma n’est à annuler. Les devises entreprise éventuellement créées restent des données auditables et peuvent être laissées inactives si nécessaire.
