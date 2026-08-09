# ERP — Architecture finale

## Vue d’ensemble

```text
Registre canonique des modules
        ↓
Résolveur accès + entitlements + dépendances
        ↓
Workspaces Core et sectoriels dédiés
        ↓
Services métier transactionnels
        ↓
Sources de vérité dédiées
        ↓
Posting Engine idempotent
        ↓
Journal Entry / Journal Line immuables
```

## Frontières

- **Core ERP** : tiers, catalogue, CRM, ventes, achats, stock commun, RH client, projets, actifs, documents et workflows versionnés.
- **Finance** : factures, créances, dettes, paiements, allocations, caisse, trésorerie, rapprochements, taxes, journaux et états financiers.
- **Pharmacy** : produits réglementés, lots, FEFO, péremption, prescription, qualité, pharmacovigilance et quantités réglementées. Les documents financiers passent par le Core commun.
- **Health** : patients, rendez-vous, consultations, dossiers médicaux, laboratoire, prescriptions et documents cliniques. La facturation utilise les objets financiers communs sans transférer de contenu clinique.

## Autorités transverses stabilisées

Le programme #167 interdit plusieurs décisions concurrentes pour une même notion :

- readiness Finance/comptabilité : `resolveEnterpriseFinanceReadiness()` ;
- accès module et capacités UI/API : `resolveEnterpriseModuleAccess()` et `resolveEnterpriseModuleCapabilities()` ;
- posting : `posting-registry-final.ts` et `posting-service.ts` ;
- ledger : `EnterpriseJournalEntry` / `EnterpriseJournalLine` ;
- projections inter-modules : outbox et `EnterpriseCrossModuleProjection` existants.

Les adapters Finance, Health, Pharmacy, Retail ou Core peuvent renforcer ces décisions par des règles métier plus strictes, mais ne peuvent pas créer un second moteur d'autorisation, une seconde readiness ou un ledger parallèle.

Une erreur de source KPI ou de projection reste un état dégradé explicite. Elle ne peut pas être transformée en valeur métier `0`.

## Contrat Finance/RBAC final

`lib/enterprise/accounting/access.ts` traduit les actions Finance vers les capacités canoniques. `MANAGER` n'est jamais traité localement comme administrateur. Les actions sensibles et de gestion exigent les capacités serveur correspondantes ; les contrôles d'objet, de séparation des acteurs et de tenant restent applicables en plus de la capacité du module.

## Compatibilité

`EnterpriseCoreRecord`, `EnterpriseSectorRecord` et `EnterpriseWorkflow` ne participent plus aux nouvelles écritures. Ils restent des archives tenant-scoped, paginées, protégées et observables pendant la période de conservation.

Les helpers legacy encore conservés sont uniquement des adapters documentés vers les autorités canoniques. Ils ne doivent plus contenir une décision métier concurrente.

## Gates permanents

`scripts/qa-erp-stabilization-final.mjs` agrège les contrats de readiness, onboarding, RBAC, observabilité et convergence cross-module. Il est inclus dans la QA comptable, donc dans `qa:regression` et les Quality Gates.

L'acceptance production-like vérifie en plus l'onboarding navigateur, Sales/Procurement/Payroll vers Finance, l'isolation tenant, puis la clôture de période et la protection de l'historique après redémarrage du serveur.

## Déploiement

La Production provient uniquement de `main`. La Release A est compatible avec plusieurs versions applicatives et ne contient aucune suppression physique. Une Release B éventuelle est indépendante.

La clôture du programme #167 exige le même SHA pour le merge validé, `main`, le déploiement Vercel Production et la GitHub Release.
