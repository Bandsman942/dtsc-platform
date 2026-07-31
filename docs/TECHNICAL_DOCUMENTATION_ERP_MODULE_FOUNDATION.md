# Documentation technique — Fondation canonique des modules entreprise

Ce document complète `docs/TECHNICAL_DOCUMENTATION.md` pour l’itération 1 du programme de consolidation ERP.

## Fichiers de référence

- `lib/enterprise/module-registry-data.json` : données déclaratives du registre.
- `lib/enterprise/module-registry.ts` : types, normalisation, aliases et résolution de routes.
- `lib/enterprise/module-access.ts` : accès serveur et diagnostics tenant.
- `lib/enterprise/sector-template-application.ts` : validation non destructive des templates.
- `lib/enterprise/enterprise-navigation.ts` : projection de navigation autorisée.
- `app/enterprise-modules/[moduleCode]/page.tsx` : route unifiée.
- `components/enterprise/enterprise-sector-module-workspace.tsx` : allow-list Health/Pharmacy.
- `app/enterprise-modules/page.tsx` : hub ERP responsive.

## Flux de lecture

```text
AppShell
→ getEnterpriseNavigationModules
→ listNavigableEnterpriseModules
→ getEnterpriseAccessSnapshot
→ registre + EnterpriseModule tenant + abonnement + permissions
→ navigation groupée
```

## Flux d’ouverture

```text
URL /enterprise-modules/{code}
→ normalisation alias
→ définition canonique
→ resolveEnterpriseModuleAccess(read/manage)
→ redirection administration, workspace Core, workspace Health ou workspace Pharmacy
```

## Flux d’application d’un template

```text
Template historique
→ upsert additif existant
→ registre canonique
→ désactivation des codes non ouvrables
→ conservation des lignes et données
→ audit de configuration
```

## Sécurité

- Le contexte actif doit être `ORGANIZATION`.
- Le membership doit être `ACTIVE`, non retiré et appartenir à la même organisation.
- L’organisation doit être `CLIENT`, `ACTIVE` et non supprimée.
- Les rôles globaux DTSC ne court-circuitent pas le membership.
- Les modules inconnus sont refusés.
- `MANAGER` ne reçoit pas l’action `manage` automatiquement.
- Les renderers sont statiques; aucun import dynamique n’est construit depuis la base.
- Les APIs métier existantes conservent leurs contrôles d’objet et `organizationId`.

## Données et migrations

Aucune migration n’est introduite par cette itération. Le registre n’est pas recopié intégralement en base. Les migrations historiques sont immuables et les tables Core, Health, Pharmacy et legacy restent présentes.

## Contrats QA

```text
pnpm audit:enterprise-modules
pnpm qa:enterprise-module-registry
pnpm qa:regression
```

Le contrat spécifique vérifie la cohérence interne du registre et la présence des garde-fous architecturaux. Les QA Core, Finance, Workflow, responsive, expérience standard, mobile et assistant restent obligatoires.

## Références complémentaires

- `docs/ERP_MODULE_INVENTORY.md`
- `docs/ERP_DOMAIN_ARCHITECTURE.md`
- `docs/ERP_NAVIGATION_AND_ACCESS_CONTRACT.md`
- `docs/ERP_LEGACY_DECOMMISSION_PLAN.md`
- `docs/CHANGELOG_ERP_CONSOLIDATION_ITERATION_01.md`
