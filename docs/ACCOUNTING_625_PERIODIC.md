# Accounting C4 — traitements périodiques, allocations et contrepassation automatique

## Objectif

L’itération #625 ajoute au grand livre canonique de DTSC Platform les traitements périodiques nécessaires aux écritures récurrentes, accruals, deferrals et allocations. Elle ne crée aucun second grand livre : `EnterpriseJournalEntry` et `EnterpriseJournalLine` restent les seules écritures comptables qui alimentent le grand livre, la balance et les états.

## Modèle

Trois modèles d’instruction sont ajoutés :

- `EnterprisePeriodicAccountingTemplate` : modèle métier versionné et tenant-scoped ;
- `EnterprisePeriodicAccountingTemplateLine` : lignes de ventilation en pourcentage et dimensions analytiques ;
- `EnterprisePeriodicAccountingExecution` : preuve d’une occurrence exécutée et liens vers l’écriture et sa contrepassation éventuelle.

Ces modèles ne stockent aucun solde comptable parallèle.

## Types et cadences

Types disponibles :

- `RECURRING` ;
- `ACCRUAL` ;
- `DEFERRAL` ;
- `ALLOCATION`.

Cadences disponibles :

- `MONTHLY` ;
- `QUARTERLY` ;
- `YEARLY` ;
- `MANUAL`.

Chaque côté Débit et Crédit doit représenter exactement 100 % du montant du modèle. Le moteur répartit le montant en devise fonctionnelle et ajuste la dernière ligne de chaque côté pour absorber uniquement l’écart d’arrondi.

## Cycle de vie et maker/checker

Un modèle est créé en `DRAFT`.

- si le journal n’exige pas d’approbation, `SUBMIT` active le modèle ;
- si le journal exige une approbation, `SUBMIT` place le modèle en `PENDING_APPROVAL` et `APPROVE` doit être exécuté par une autre personne ;
- l’activation d’une nouvelle version passe l’ancienne version `ACTIVE` du même code en `SUPERSEDED` ;
- `DEACTIVATE` passe un modèle actif en `INACTIVE`.

Les exécutions historiques restent attachées à la version exacte qui les a produites.

## Idempotence

L’occurrence est identifiée par une clé stable tenant-scoped qui n’inclut pas la version du modèle :

- cadence périodique : `organisation + code du modèle + période fiscale` ;
- cadence `MANUAL` : `organisation + code du modèle + date comptable`.

Ainsi, activer une nouvelle version ne permet jamais de reposter la même occurrence d’un code dans la même période. Un retry retourne l’exécution et l’écriture existantes sans recréer de lignes.

## Périodes et dates

L’exécution exige une période `OPEN`. Les périodes `SOFT_CLOSED`, `CLOSED` et `LOCKED` sont refusées pour une nouvelle occurrence C4. La date doit être comprise entre les dates d’effet du modèle et respecter sa cadence.

## Dimensions

Les dimensions suivantes sont propagées ligne par ligne quand elles sont présentes :

- tiers ;
- projet ;
- département ;
- site ;
- actif ;
- article de stock ;
- référence analytique.

Elles sont revalidées côté serveur dans `organizationId` via le validateur comptable canonique avant toute écriture.

## Devise

C4 accepte uniquement la devise fonctionnelle de l’entreprise. La conversion et la réévaluation FX de clôture appartiennent à C5 #626. Ce choix évite d’introduire un taux implicite ou un calcul FX non auditable dans les écritures périodiques.

## Contrepassation automatique

`autoReverse=true` utilise `reverseJournalEntryTx()` dans la même transaction sérialisable que l’exécution du modèle. La contrepassation :

- est une nouvelle `EnterpriseJournalEntry` liée à l’originale ;
- inverse débit et crédit ;
- utilise la première période future `OPEN` d’un exercice `OPEN` ;
- possède une idempotence canonique par écriture d’origine ;
- ne déclenche aucune transaction Prisma imbriquée.

Si aucune période suivante n’est ouverte, l’exécution entière échoue et aucun effet comptable partiel n’est committé.

## Historique `REVERSED`

Une écriture originale ensuite contrepassée passe au statut `REVERSED`, mais ses lignes restent une réalité historique du grand livre. C4 corrige donc le workbench, la balance, les états financiers et les états réglementaires pour traiter `POSTED` et `REVERSED` comme statuts portant des lignes de ledger. L’écriture inverse reste une écriture `POSTED` séparée. Le résultat net reste donc correct sans effacer l’originale de sa période d’origine.

## Autorisation

Les nouvelles routes utilisent exclusivement `authorizeFinanceRequest()` sur `FINANCE_ACCOUNTING` :

- lecture : `view` ;
- création/version : `create` ;
- soumission : `submit` ;
- approbation : `approve` ;
- désactivation : `manage` ;
- exécution : `post`.

Aucun entitlement ou rôle global n’est ajouté.

## API

- `GET/POST /api/enterprise/:organizationId/periodic-accounting`
- `POST /api/enterprise/:organizationId/periodic-accounting/:templateId/transition`
- `POST /api/enterprise/:organizationId/periodic-accounting/:templateId/versions`
- `POST /api/enterprise/:organizationId/periodic-accounting/:templateId/execute`

## QA permanente

`scripts/qa-accounting-625-periodic.mjs` vérifie notamment :

- les trois modèles et la migration additive ;
- l’unicité de l’occurrence ;
- les quatre types et quatre cadences ;
- les allocations 100 % par côté ;
- le contrôle de période ouverte ;
- le maker/checker ;
- la validation tenant-scoped des dimensions ;
- l’absence de transaction imbriquée pour la contrepassation ;
- les statuts `POSTED + REVERSED` dans les lecteurs de ledger ;
- les autorisations des routes ;
- la parité migration/schema multi-fichier.

Cette gate est importée par `qa:enterprise-accounting` et donc par la régression globale.

## OWNER_E2E #625

Avant merge, vérifier au minimum :

1. créer un modèle mensuel simple avec débit/crédit 100 % ;
2. soumettre et, sur un journal avec approbation, approuver avec un autre utilisateur ;
3. exécuter dans une période ouverte et vérifier l’écriture au grand livre ;
4. rejouer la même occurrence et vérifier qu’aucun doublon n’apparaît ;
5. exécuter un modèle avec allocation multi-lignes et vérifier Débit = Crédit ;
6. exécuter un modèle `autoReverse` avec une période suivante ouverte et vérifier les deux écritures liées ;
7. vérifier que l’écriture originale reste visible dans la période d’origine après contrepassation ;
8. tenter une exécution en période fermée et vérifier le refus sans écriture partielle.

## Rollback

Rollback applicatif/migration avant utilisation : revert de la migration additive et du code C4.

Après utilisation en production : ne jamais supprimer ni modifier des écritures `POSTED`/`REVERSED` ou leurs lignes. Désactiver les modèles périodiques et effectuer toute correction via de nouvelles écritures/contrepassations auditées.

## Hors scope

Restent dans #626 : réévaluation FX de clôture, report à nouveau/year-end et cession finale d’actifs. Multi-ledger, intercompany et consolidation restent dans #600 après clôture de #599.
