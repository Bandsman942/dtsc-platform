# Changelog — Programme de stabilisation ERP #167

## 2026-08-10 — Itération 6/6

### Corrigé

- Suppression du bypass `ENTERPRISE_MANAGER_ROLES` dans l'accès Finance/comptabilité.
- Les actions Finance sont désormais résolues depuis `resolveEnterpriseModuleCapabilities()` ; `MANAGER` ne reçoit plus implicitement `canManage`, la visibilité globale ou l'accès sensible.
- La lecture sensible exige maintenant une capacité d'approbation ou de gestion au niveau module, en plus des contrôles métier/objet applicables.

### Durci

- Extension du gate RBAC permanent à `lib/enterprise/accounting/access.ts`.
- Ajout de `scripts/qa-erp-stabilization-final.mjs`, agrégateur des cinq contrats de stabilisation : readiness, onboarding, RBAC, observabilité et convergence Finance cross-module.
- Branchement du gate final dans `scripts/qa-enterprise-accounting-checks.mjs`, donc dans `qa:regression` et les Quality Gates.
- Interdiction documentée d'une seconde matrice de posting ou d'un registre Finance parallèle.

### Documenté

- Architecture finale des autorités transverses ERP.
- Runbook de clôture Production avec égalité obligatoire head validé / main / Vercel Production / GitHub Release.
- Contrat RBAC Finance final.
- Guide utilisateur comptable FR/EN aligné sur les capacités serveur.
- Checklist QA dédiée `ERP_STABILIZATION_QA_CHECKLIST_167.md`.
- Document de clôture `ERP_STABILIZATION_CLOSURE_167.md`.

### Migration

- Aucune migration Prisma.
- Aucune réécriture d'écriture `POSTED`, période, facture, paiement ou historique.

## Itérations précédentes

- #168 : autorité canonique de readiness Finance.
- #169 : onboarding Finance aligné sur les diagnostics serveur.
- #170 : convergence RBAC des modules ERP.
- #171 : états dégradés explicites, fin des faux zéros KPI, projections observables.
- #172 : acceptance production-like Sales/Procurement/Payroll vers Finance, isolation tenant, clôture et protection historique.

## Portée

Ce changelog décrit la stabilisation technique et opérationnelle du programme #167. Il ne revendique aucune certification réglementaire/fiscale globale ni validation réglementaire officielle du bootstrap SYSCOHADA.
