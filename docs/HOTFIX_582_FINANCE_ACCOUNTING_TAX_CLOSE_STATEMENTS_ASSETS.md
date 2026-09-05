# Hotfix #582 — Comptabilité, Fiscalité, Clôture, États financiers et Immobilisations

## Baseline

- `main@f18c9964ab4c1175ac8456425f0812158b3a6edc`
- Issue : #582
- Branche : `fix/582-finance-accounting-tax-close-statements-assets`

## Objectif

Fermer la stabilisation du bloc Finance aval après #576 et #580, sans créer une nouvelle source comptable. Les autorités restent :

`paiement confirmé → trésorerie → rapprochement → EnterpriseJournalEntry/EnterpriseJournalLine → clôture → snapshots d’états financiers`

Les immobilisations restent des extensions comptables de `EnterpriseAsset`, pas un registre patrimonial parallèle.

## Diagnostic confirmé

| Zone | Écart constaté | Correction #582 |
|---|---|---|
| Comptabilité | workspace alimenté seulement par `canManage` | capacités canoniques `canCreate/canSubmit/canWrite/canApprove/canManage` transmises par le routeur |
| Écritures | UI historique n’exposait pas le workflow affecté ; autre workspace montrait approve/reject par statut seul | capacités par objet issues de `EnterpriseApproval` + préparateur + statut |
| Références | comptes chargés par fenêtre fixe de 500 | recherche serveur bornée à 30 résultats |
| Fiscalité | GET non paginé/non recherché ; création `manage` | pagination/recherche/deep link serveur ; création `canCreate` |
| Clôture | recherche UI ignorée ; actions par statut global | recherche avant pagination + `recordId` + capacités affectées par objet |
| États financiers | génération persistante autorisée avec `view`; publication avec `export` donc lecture | génération = `canCreate`; publication immuable = `canManage` |
| Immobilisations | sélection des actifs tronquée à 250 dans le legacy | nouveau formulaire sur recherche serveur des actifs non capitalisés ; opérations comptables sensibles restent `canManage` |
| KPI | ancien workspace pouvait reconstruire des métriques depuis la page courante | nouveaux workspaces n’inventent aucun KPI à partir des seuls items paginés |
| Deep links | plusieurs vues dépendaient de la page chargée | `recordId` / recherche exacte pour les objets ciblés |

## Références recherchables

`GET /api/enterprise/:organizationId/accounting-reference-options`

- module explicitement allowlisté : Accounting, Tax, Close, Statements, Assets ;
- session/membership/entitlement/permission via `authorizeFinanceRequest` ;
- tenant `organizationId` obligatoire ;
- maximum 30 résultats par recherche ;
- plans comptables, exercices, périodes, journaux, comptes, actifs et devises ;
- comptes actifs/non archivés ;
- filtre `allowDirectPosting` possible pour la saisie d’écriture ;
- actifs proposés seulement s’ils n’ont pas déjà de `EnterpriseAssetAccountingProfile`.

## Workflow des écritures

Les mutations existantes restent l’autorité :

- DRAFT + préparateur + `canSubmit` → affectation d’un approbateur ;
- PENDING_APPROVAL + approbateur affecté + `canApprove` → APPROVE/REJECT ;
- APPROVED + `canManage` → POST ;
- POSTED + `canManage` → contrepassation ;
- aucune réécriture d’une écriture POSTED/REVERSED.

Le GET `journal-entries` enrichit maintenant chaque objet avec les seules capacités réellement disponibles pour le membre courant.

## Workflow de clôture

- préparation : `canCreate` ;
- soumission/recalcul : demandeur courant + `canSubmit` ;
- approbation : approbateur réellement affecté + `canApprove` ;
- clôture définitive et réouverture : `canManage` ;
- les blockers Réconciliation/Trésorerie/Accounting du moteur existant restent opposables.

## États financiers

La génération d’un snapshot est une mutation persistante et ne peut plus être déclenchée avec un simple droit de lecture :

- preview/snapshot non publié : `canCreate` ;
- publication immuable : `canManage` ;
- lecture/export du snapshot reste soumise au module `FINANCE_STATEMENTS` et au contrat existant du dialogue de rapport.

Un snapshot reste une projection du grand livre, jamais une seconde source de vérité.

## Immobilisations

La capitalisation conserve volontairement l’action Finance `manage` car elle déclenche un posting comptable. Le même principe vaut pour le run d’amortissement et les futures cessions sensibles. Le nouveau sélecteur ne charge plus les « 250 premiers actifs » : il interroge les actifs tenant-scoped non encore capitalisés.

## Abonnement et IA

Les modules restent `ENTERPRISE`, `requiresActiveSubscription: true` et `POSITION_PERMISSION` dans le registre canonique. Le hotfix ne modifie pas ces entitlements.

Les outils IA suivants restent rattachés à leur module via `requiredModuleCodes: [spec.moduleCode]` :

- `FINANCE_ACCOUNTING_READ`
- `FINANCE_TAX_READ`
- `FINANCE_CLOSE_READ`
- `FINANCE_STATEMENTS_READ`
- `FINANCE_ASSETS_READ`

Aucun bypass IA de RBAC/entitlement n’est introduit.

## Dette explicitement maintenue

### #521 — atomicité métier/Trésorerie/posting

#582 ne prétend pas résoudre #521. Certains flux historiques, notamment la capitalisation/amortissement d’actifs et d’autres événements Retail/Finance, peuvent encore séparer transaction métier et `postBusinessEvent()` en plusieurs transactions. Toute refonte atomique doit être traitée dans #521 avec tests retry/concurrence/deadlock.

### #515 — imports/exports lourds

Le traitement asynchrone des relevés/exports de masse reste suivi par #515. #582 ne crée aucune deuxième queue.

### #516 — rapports Finance lourds

La génération durable/asynchrone des rapports lourds reste suivie par #516. #582 corrige l’autorisation et l’UX des snapshots existants mais ne masque pas cette dette de scalabilité.

## Prisma

Aucune migration #582 prévue à ce stade. Toute migration découverte comme nécessaire devra être additive et ne modifiera jamais une migration historique.

## QA permanente

`scripts/qa-hotfix-582-finance-accounting-tax-close-statements-assets.mjs` protège :

- routing vers les workspaces hotfix ;
- passage des capacités canoniques ;
- absence de lookup 250/500 dans les nouveaux workspaces ;
- recherches bornées à 30 ;
- deep links `recordId` ;
- affectation réelle des validations Écritures/Clôture ;
- génération/publication des états avec permissions distinctes ;
- contrat sensible des immobilisations ;
- mapping IA/module ;
- maintien explicite des dettes #521, #515 et #516.

Le gate est intégré à `qa:enterprise-accounting`, donc à `qa:regression`.

## OWNER_E2E requis

Avant merge, valider au minimum :

### Comptabilité
- utilisateur `canCreate` sans `canManage` peut créer exercice/période/journal/écriture autorisés ;
- recherche d’un compte au-delà des anciennes 500 premières lignes ;
- soumission d’une écriture avec approbateur affecté ;
- autre approbateur ne voit pas les actions APPROVE/REJECT ;
- approbation → posting ;
- contrepassation d’une écriture POSTED ;
- deep link direct vers une écriture hors première page.

### Fiscalité
- recherche/pagination ;
- création par `canCreate` ;
- comptes collecté/déductible recherchables ;
- absence d’automatisation fiscale légale trompeuse.

### Clôture
- préparation d’une période ;
- BLOCKED si blockers ;
- soumission vers approbateur affecté ;
- approbation → clôture ;
- réouverture avec motif et droit manage ;
- deep link direct hors première page.

### États financiers
- lecture paginée/recherche ;
- utilisateur lecture seule ne peut plus générer de snapshot ;
- `canCreate` peut générer une version non publiée ;
- seule une capacité manage peut publier une version immuable ;
- ouverture du rapport existant.

### Immobilisations
- actif non encore capitalisé recherché au-delà de l’ancien plafond 250 ;
- capitalisation avec trois comptes recherchables ;
- amortissement autorisé uniquement au rôle/capacité sensible ;
- posting et journal liés visibles ;
- aucune duplication de profil sur retry.

### Transverse
- mobile/desktop ;
- FR/EN ;
- clair/sombre ;
- rôle lecture seule ;
- isolation avec une seconde organisation ;
- module désactivé/abonnement insuffisant bloque UI/API/outil IA.

## Rollback

- re-router les cinq modules vers les workspaces legacy conservés ;
- revert des enrichissements de listes et du nouvel endpoint de références ;
- aucune donnée ni migration à restaurer si le périmètre reste sans migration.

## Statut

Implémentation en cours. Aucune preuve CI/OWNER_E2E n’est déclarée réussie avant exécution réelle.
