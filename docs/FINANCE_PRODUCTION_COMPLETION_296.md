# Finance ERP / Shop ENTERPRISE — production completion #296

Base d’audit : `main@f6cf6ad3a9ee94e7ebf6b0eb85cb1e3645970ba4`.

Base de réconciliation finale : `main@410bdfda23e623fcad1d9ba67d4dc17f7fe6a3bc` (hotfix #298 inclus).

## But

Rendre la mise en service financière d’un Shop ENTERPRISE réellement terminable, sans contournement technique et sans affaiblir SYSCOHADA, RBAC, l’isolation tenant, l’idempotence ou l’approbation indépendante.

## Incohérences confirmées

### 1. Les diagnostics Finance pointaient vers des onglets inexistants

Le readiness utilisait `fiscal-years`, `fiscal-periods` et `ledger-accounts`, alors que le workspace `FINANCE_ACCOUNTING` expose `years`, `periods` et `accounts`. Le workspace ne lisait en outre pas `?tab=`. Les CTA indiquaient donc la bonne intention mais n’ouvraient pas l’étape demandée.

Correction : liens canoniques + synchronisation de la section active avec `useSearchParams`.

### 2. L’exercice pouvait rester DRAFT pendant que sa période était OPEN

`openFiscalYear()` existait déjà côté service mais aucune route ni commande UI ne l’exposait. Parallèlement, le résolveur de période comptable acceptait une période OPEN sans vérifier le statut de l’exercice parent.

Correction : endpoint audité `POST /fiscal-years/:id/open`, commande **Ouvrir l’exercice**, et posting limité aux périodes d’un exercice OPEN.

### 3. Deux vérités concurrentes de readiness existaient

Le readiness de l’assistant considérait lineage du template, couverture sémantique, mappings, journaux, exercice et période comme blockers, tandis que `assertFinanceReady()` ne bloquait réellement le moteur que sur une partie de la configuration. Un premier durcissement trop global a ensuite montré un autre défaut : après clôture d’une période, une écriture datée dans cette période recevait `FINANCE_CONFIGURATION_NOT_READY` avant que le contrôle daté puisse répondre précisément `FINANCE_PERIOD_CLOSED`.

Correction : la validation est désormais stratifiée. `assertFinanceReady()` protège les invariants globaux de configuration — devise, plan, activation, comptes, lineage/couverture du template, mappings et journaux. `getPostingPeriod()` reste l’autorité temporelle et exige, pour la date de l’écriture, un exercice OPEN et une période compatible. Le readiness UI continue d’exposer exercice/période comme blockers de mise en service. Le préflight Shop appelle explicitement les deux couches avant tout effet durable de vente.

### 4. Le Shop pouvait être déclaré prêt sans compte d’encaissement

Le readiness générique traitait l’absence de compte financier comme un warning. Or une vente Shop canonique exige un compte financier valide pour chaque tender et une session de caisse ouverte pour un tender CASH.

Correction : pour le secteur `COMMERCE_RETAIL`, au moins un compte financier actif devient un BLOCKER de mise en service, avec lien vers `FINANCE_TREASURY?tab=accounts`.

### 5. La readiness Shop pouvait rester périmée après correction de Finance

`getRetailAccountingReadiness()` utilisait `financeConfiguration.readinessStatus === "READY"`, un flag persistant qui peut ne pas refléter immédiatement l’état réel des comptes, mappings, journaux, exercice et périodes. Il acceptait aussi une période OPEN/SOFT_CLOSED sans vérifier que l’exercice parent était OPEN. Le Shop pouvait donc rester “configuration requise” après correction de Finance, ou annoncer une période disponible alors qu’elle n’était pas réellement postable pour une nouvelle vente.

Correction : la readiness Shop consomme désormais `getEnterpriseFinanceReadiness(..., mode: "POSTING")` en temps réel, exige une période OPEN appartenant à un exercice OPEN et expose les blockers Finance canoniques. Le parcours Shop et le moteur de posting partagent donc la même vérité de configuration.

### 6. Une vente pouvait créer ses effets métier avant de découvrir une impossibilité comptable

`executeCanonicalRetailSale()` créait d’abord la vente et les mouvements de stock, puis appelait `finalizeRetailSaleAccounting()`. Une erreur connue à l’avance — Finance non prête, exercice/période absents, taux de change manquant, couches de coût insuffisantes ou ambiguës — pouvait donc être découverte après les effets durables de la vente.

Correction : un préflight Finance/stock s’exécute avant `createRetailSale()` et vérifie : readiness global, période à la date de vente, taux de change vente → devise fonctionnelle, méthode de valorisation, résolution des articles de stock même lorsque `inventoryItemId` est omis par un client API, présence/quantité/devise des couches de coût et taux de change de valorisation. Le posting et la valorisation réexécutent ensuite leurs contrôles autoritaires ; le préflight réduit le risque de ticket créé mais non comptabilisé sans déplacer l’autorité serveur.

### 7. Une clôture BLOCKED devenait un dead-end

Une soumission avec blockers passait la clôture en `BLOCKED`, mais la transition SUBMIT n’acceptait ensuite que `DRAFT`. `prepareFinancialClose()` retournait l’instance existante : impossible de reprendre après correction.

Correction : `DRAFT` et `BLOCKED` sont resoumissibles. Chaque tentative recalcule la checklist serveur. Si les blockers restent, la clôture demeure BLOCKED et la période reste OPEN. Si tout est résolu, elle passe PENDING_APPROVAL et la période SOFT_CLOSED.

### 8. La fermeture finale ne revérifiait pas toute la checklist

Après approbation, l’ancien CLOSE ne revérifiait qu’un sous-ensemble des écritures. Une caisse rouverte, un rapprochement non terminé ou un autre blocker pouvait apparaître après l’approbation.

Correction : le CLOSE recalcule la checklist complète. Si de nouveaux blockers existent, l’approbation est invalidée, la clôture repasse BLOCKED et la période redevient OPEN pour correction ; le parcours doit ensuite être resoumis et réapprouvé.

### 9. Le client ne voyait ni comment reprendre ni pourquoi un second acteur était nécessaire

Correction : bouton **Recalculer la clôture**, blockers affichés en vocabulaire métier et message explicite indiquant qu’un autre utilisateur autorisé doit approuver puis fermer la période.

## Contrôles vérifiés comme cohérents

- les entitlements avancés Finance restent ENTERPRISE ;
- les taxes Shop sont recalculées par le moteur commercial à partir des codes/taux Finance ; une valeur `taxAmount=0` du panier ne supprime pas une taxe calculée ;
- le moteur FX résout taux direct/inverse, applique l’identité pour même devise et snapshotte le taux utilisé ;
- le POS dispose d’un vrai parcours d’ouverture de caisse avant un tender CASH ;
- le parcours de vente canonique appelle bien `finalizeRetailSaleAccounting()` puis valorise les sorties de stock suivies ;
- le client Retail conserve sa clé d’idempotence tant qu’une mutation échoue, ce qui permet une reprise sûre de la même vente ;
- `postBusinessEvent()` reprend idempotemment un batch FAILED portant la même source/version ;
- le demandeur d’une clôture ne peut pas s’auto-approuver ni fermer lui-même la période ;
- le plan SYSCOHADA reste versionné et serveur-autoritaire ;
- les écritures POSTED ne sont pas réécrites ;
- les mappings, journaux, périodes et comptes restent tenant-scoped ;
- aucune migration ou backfill n’est introduit par #296.

## Réconciliation finale après #298

Après fusion du hotfix mobile #298, la branche Finance historique n’a pas été replacée comme un arbre complet au-dessus du nouveau `main`. Conformément à `docs/CONTRIBUTING.md`, le delta fonctionnel #296 a été reconstruit depuis `main@410bdfda23e623fcad1d9ba67d4dc17f7fe6a3bc`.

Le seul fichier commun entre #298 et #296 était `scripts/run-regression-qa-ci.mjs`. La version réconciliée conserve explicitement les deux gardes : `qa-collaborators-mobile-composer-295.mjs` et `qa-finance-production-completion-296.mjs`. Le diff réconcilié contient uniquement les 14 fichiers du lot Finance/Shop attendu et ne supprime aucun fichier du hotfix #298.

## Parcours E2E requis avant merge

1. abonnement ENTERPRISE et entreprise Shop ;
2. configurer devise Finance ;
3. créer/adopter le plan SYSCOHADA ;
4. créer l’exercice ;
5. créer au moins une période ;
6. ouvrir l’exercice ;
7. finaliser mappings/journaux puis activer le plan ;
8. vérifier que la mise en service Shop reflète immédiatement la readiness Finance réelle ;
9. créer un compte financier dans Trésorerie ;
10. configurer un taux de change seulement si la devise de vente/valorisation diffère de la devise fonctionnelle ;
11. pour CASH, ouvrir une session de caisse ;
12. effectuer une vente Shop et vérifier l’écriture comptable + valorisation stock ;
13. préparer une clôture avec au moins un blocker ;
14. corriger le blocker et utiliser **Recalculer la clôture** ;
15. avec un second utilisateur autorisé, approuver puis fermer la période ;
16. vérifier que la période est CLOSED et que les écritures historiques restent intactes.

## Dette non bloquante suivie séparément

#299 suit la sémantique de `automaticPostingEnabled`. Le hotfix #296 ne désactive pas la comptabilisation canonique du Shop : modifier implicitement ce comportement pourrait produire des ventes sans trace comptable.
