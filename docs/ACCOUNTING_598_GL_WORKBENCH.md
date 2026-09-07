# Accounting #598 — Grand livre canonique, dimensions, workbench compact et requêtes IA partagées

Statut : implémentation sur `feat/598-accounting-gl-workbench`.

Issue : #598. Programme parent : #597.

## Objectif

Professionnaliser le cœur immédiatement exploitable de `FINANCE_ACCOUNTING` sans créer un second grand livre et sans modifier l’historique comptabilisé. `EnterpriseJournalEntry` et `EnterpriseJournalLine` restent l’autorité comptable ; `posting-service.ts` et les registres de posting restent l’autorité de comptabilisation automatique.

Ce lot ne traite pas les récurrents, accruals/deferrals, réévaluation FX, year-end, atomicité métier→posting ni consolidation. Ces sujets restent dans #599 et #600.

## Intégrité des dimensions

Les écritures manuelles revalident côté serveur, dans le même `organizationId`, les dimensions optionnelles suivantes :

- tiers (`businessPartyId`) actif ;
- projet actif/non archivé ;
- département actif ;
- site actif/non archivé ;
- actif disponible/non archivé ;
- article de stock actif/non archivé.

La validation est exécutée à la création du brouillon et de nouveau avant le posting. Les sélecteurs UI ne constituent jamais une autorisation. Une référence d’un autre tenant, archivée ou non admissible est refusée par le domaine comptable.

## Service de requêtes comptables canonique

`lib/enterprise/accounting/accounting-query-service.ts` centralise les lectures partagées par l’UI et l’IA :

- grand livre ;
- balance ;
- trace d’écriture ;
- anomalies de posting.

Le grand livre ne lit que les écritures `POSTED` et son statut n’est pas modifiable par un paramètre client. Les filtres restent server-side et bornés à 100 lignes par page.

La balance expose, par compte et devise fonctionnelle :

- solde d’ouverture ;
- débit de période ;
- crédit de période ;
- solde de clôture.

Quand une période fiscale est sélectionnée, la période fournit par défaut les dates de mouvement tandis que l’ouverture est calculée depuis toutes les écritures postées antérieures au début de la période. Une période étrangère à l’organisation ne produit aucune donnée.

Les filtres disponibles couvrent période/dates, compte, journal, tiers, projet, département, site, actif, article de stock, source et devise.

Le contrat HTTP détaillé est documenté dans `docs/ACCOUNTING_598_API_CONTRACT.md`.

## Navigation vers les documents sources

`accounting-source-link-registry.ts` traduit les sources connues en libellés métier. Avant d’exposer un lien, `resolveEnterpriseModuleAccess` revalide l’accès `read` de l’utilisateur au module cible dans la même organisation.

Une écriture peut donc être visible en Comptabilité sans que son document source soit navigable. La Comptabilité n’accorde jamais implicitement l’accès à Ventes, Achats, Paiements, Trésorerie, Paie, Projets, Immobilisations ou Stock.

## Workspace Comptabilité V3

Le routeur `FINANCE_ACCOUNTING` utilise `EnterpriseFinanceAccountingWorkspaceV3`, organisé en quatre espaces :

1. **Accueil** — situation comptable et accès rapide ;
2. **Comptabiliser** — file des écritures et Journal Workbench ;
3. **Consulter** — grand livre, balance et anomalies ;
4. **Configurer** — mise en service, plans, comptes, exercices, périodes, journaux et règles.

Les anciens deep links `?tab=entries`, `?tab=ledger`, `?tab=trial`, `?tab=anomalies`, `?tab=setup`, etc. restent interprétés afin de ne pas casser les guides et liens existants.

## Tableaux compacts et professionnels

`AccountingCompactTable` applique le contrat spécifique demandé pour la Comptabilité :

- densité 12–13 px, lignes serrées mais lisibles ;
- en-tête sticky ;
- montants alignés à droite et chiffres tabulaires ;
- actions discrètes ;
- focus clavier et activation Enter/Espace pour les lignes interactives ;
- scroll horizontal borné sur petits écrans ;
- clair/sombre via les tokens DTSC ;
- aucune largeur globale cassant le workspace.

Ce composant ne remplace pas le contrat responsive global : il permet uniquement une densité comptable supérieure lorsque la nature tabulaire l’exige.

## Journal Workbench multi-lignes

Le formulaire historique à deux lignes est remplacé dans le nouveau parcours par un éditeur multi-lignes. Il permet :

- journal, période, devise, dates, référence et libellé ;
- ajout, suppression et duplication de lignes ;
- compte canonique de saisie directe ;
- débit ou crédit exclusif par ligne ;
- dimensions analytiques optionnelles ;
- totaux débit/crédit persistants ;
- indicateur d’équilibre avant soumission.

Le Workbench utilise `presentation="editor"`, les sélecteurs canoniques recherchables et le toast global. Le bouton est désactivé pendant la mutation. Le formulaire n’est réinitialisé et fermé qu’après succès backend confirmé. Sur erreur, le toast d’erreur est affiché et les valeurs restent dans l’éditeur.

## Abonnement, RBAC et tenant

Aucun changement d’abonnement ou de permission n’est introduit par #598 :

- `FINANCE_ACCOUNTING` conserve son contrat Enterprise et les permissions de poste existantes ;
- les modules BUSINESS autorisés peuvent continuer à produire des écritures internes via l’infrastructure comptable sans obtenir le workspace Comptabilité ;
- toutes les requêtes ajoutées sont `organizationId`-scoped ;
- aucune permission CRM, Projet, Stock, Paie ou autre n’est accordée par une lecture comptable ;
- les actions de workflow restent pilotées par les capabilities serveur déjà renvoyées par les routes journal.

## IA

`FINANCE_ACCOUNTING_READ` reste un outil `READ`, `requiredModuleCodes: [FINANCE_ACCOUNTING]`, organisation-scoped et audité par le Tool Gateway existant.

Un override ciblé `FINANCE_ACCOUNTING_QUERY_AI_EXECUTORS` consomme les mêmes fonctions `getAccountingTrialBalance`, `getAccountingGeneralLedger` et `getAccountingAnomalies` que l’UI. Il est enregistré après le map Finance historique afin de remplacer uniquement l’exécuteur de lecture Comptabilité, sans changer les autres outils Finance.

La sortie IA est bornée à 25 lignes et retire les identifiants techniques internes des lignes présentées. Aucune création, mise à jour, suppression, approbation, posting ou contrepassation par IA n’est ajoutée dans #598.

## Prisma et migrations

Aucune migration Prisma n’est requise par #598. Le lot exploite les colonnes et relations comptables déjà présentes et ajoute uniquement validation, services, routes, composants et QA.

Aucune écriture `POSTED` historique n’est modifiée ou recalculée par la livraison.

## QA permanente

`scripts/qa-accounting-598-gl-workbench.mjs`, importé par `scripts/qa-enterprise-accounting-checks.mjs`, protège notamment :

- routage V3 et transmission des capabilities ;
- densité/keyboard contract des tables ;
- contrat du Workbench et conservation des valeurs en erreur ;
- références canoniques et tenant-scoped ;
- revalidation serveur des six dimensions ;
- grand livre limité aux écritures `POSTED` ;
- calcul ouverture/mouvements/clôture ;
- lien source permission-aware ;
- partage des query services avec `FINANCE_ACCOUNTING_READ` ;
- absence de mutation IA.

Les QA historiques #486, #582 et `qa-finance-client-ux` ont été adaptées afin de reconnaître le workspace V3 sans affaiblir les invariants Finance aval.

## Preuves

À la création de ce document :

- développement branche : effectué ;
- `LOCAL_EXECUTED` : `NOT_EXECUTED` ;
- Quality Gates CI : `NOT_EXECUTED` ;
- `OWNER_E2E` : `NOT_EXECUTED` ;
- Production : `NOT_EXECUTED`.

Ces états doivent être mis à jour uniquement à partir de preuves réelles conformément à `docs/CONTRIBUTING.md`.

## Rollback

Le rollback applicatif consiste à rerouter `FINANCE_ACCOUNTING` vers `EnterpriseFinanceAccountingWorkspaceHotfix` et à retirer l’override IA ciblé. Les nouveaux services sont additifs et aucune donnée comptable n’a besoin d’être supprimée ou restaurée.

Les écritures `POSTED` restent intactes pendant le rollback.

## Dette connue hors lot

Aucune dette nouvelle volontaire dans #598. Les travaux suivants restent explicitement hors lot et déjà suivis :

- #599 : atomicité métier→posting, récurrents, accruals/deferrals, FX de clôture, year-end, cession d’actifs ;
- #600 : dimensions configurables, multi-ledger, intercompany et consolidation.
