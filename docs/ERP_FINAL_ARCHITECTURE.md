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

## Compatibilité

`EnterpriseCoreRecord`, `EnterpriseSectorRecord` et `EnterpriseWorkflow` ne participent plus aux nouvelles écritures. Ils restent des archives tenant-scoped, paginées, protégées et observables pendant la période de conservation.

## Déploiement

La Production provient uniquement de `main`. La Release A est compatible avec plusieurs versions applicatives et ne contient aucune suppression physique. Une Release B éventuelle est indépendante.
