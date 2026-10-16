# WF-06B — Conditions composées et mapping de données typées (#839 / #819)

**Statut : candidat non activé**, implémentation sur branche DRAFT issue #839. Dépend du moteur V1 stable (main@0860a463, #818 livré) mais ne modifie ni exécution, ni graphes publiés, ni API, ni schéma DB.

## Conception

La source canonique des prédicats reste `workflowConditionSchema`, validée par `workflowConditionError(adapter, condition)` et exécutée par `evaluateWorkflowCondition`, utilisant `Prisma.Decimal` pour les comparaisons financières.

`lib/enterprise/workflows/advanced-data.ts` définit :
- `workflowBooleanExpressionSchema` — feuilles LEAF et nœuds AND/OR, aucune expression libre, sous-branches de 2–8, profondeur totale ≤4, nombre de feuilles ≤24 et de nœuds ≤31 ; tout autre champ, NOT, fonction, JS, SQL, regex libre, ou chemin arbitraire est refusé. La validation de **toutes** les feuilles et de l'allow-list adapter précède tout court-circuit. Les effets métier n'y sont jamais possibles.
- `workflowVariableMappingsSchema` — jusqu'à 16 cibles identifiées par un nom uppercase, une source de champ allow-listée, un type STRING/NUMBER/BOOLEAN/DATE. Pas de transformation arbitraire ou d'objet/array dynamique ; champs réservés, doublons et noms hors contrat refusés.
- `projectWorkflowVariables` — exige deux autorisations indépendantes : champ connu dans `adapter.conditionFields` **et** appartenance à `readableFields` explicitement fourni par le contrôleur tenant/acteur/module. Une allow-list de conditions ne confère **aucun droit** à exposer les montants, documents ou données personnelles dans une variable. Sans allow-list autorisée, les lectures échouent.
- Les sorties numériques conservent les décimales en chaîne exacte (pas de flottant inventé), les dates sont ISO UTC, les objets sont refusés, les valeurs string ≤256 caractères et le payload total ≤4 Ko. Le dictionnaire sans prototype protège de l'injection de clés.

## Frontière stricte d'activation

Cette tranche n'autorise **pas** le runtime V1 à interpréter ces prédicats ni à injecter ces variables dans les événements/outbox. Un moteur V2 avec adaptateurs signés, scoping, entitlements, journal d'occurrence, versionnement, quotas et tests de collision doit intégrer ce contrat dans une PR ultérieure de #819. Aucune UI ne suggère ici de pouvoir exécuter les conditions composées.

## Sécurité et QA

Tests `pnpm qa:workflow-data-conditions` : AND/OR vrai/faux, branches invalides ignorées par court-circuit, champs non autorisés refusés **avant lecture**, contraintes de profondeur/feuilles, conservation de précision décimale par evaluator existant, mapping de 4 types, date UTC, règle spéciale des secrets, doublons, injections et entrées mal formées.

`qa:regression` exécute la QA ciblée ; Quality/Migration Gates obligatoires. Ni migration ni backfill ; rollback = revert de code non activé, versions/runs V1 inchangés. OWNER_E2E #839 explicite avant fusion ; validation de moteurs réels attend une phase ultérieure du parent #819.
