# ERP Stabilisation 3/6 — RBAC et capacités

Issue : #170  
Parent : #167

Cette itération remplace les décisions UI locales basées sur les rôles par le contrat canonique de capacités ERP. Elle conserve les contrôles backend comme autorité finale et ne crée aucun bypass de tenant, entitlement ou permission.

## Changements couverts

- capacités canRead/canCreate/canSubmit/canWrite/canApprove/canManage calculées depuis un snapshot canonique ;
- ancien `canAccessEnterpriseModule` réduit à un adaptateur vers le résolveur canonique ;
- suppression de la table de préfixes de permissions dupliquée dans les templates sectoriels ;
- `MANAGER` n'est plus traité comme administrateur entreprise par `canManageEnterpriseAdministration` ;
- route centrale des modules pilotée par les capacités, sans `Set` local de rôles ;
- Procurement/Fournisseurs/Achats alignés entre boutons visibles et contrôles serveur ;
- gate QA permanent empêchant la réintroduction des décisions locales ciblées.

## Données / migrations

Aucune migration Prisma et aucune réécriture de données.

## Delivery Governance

L'issue #170 et la PR portent `type:bug`, `priority:P1`, `area:erp`, `delivery-impact:high` et le milestone actif `Delivery Governance v1`. La branche respecte `fix/170-...`; la fusion reste interdite tant que les Quality Gates ne sont pas verts sur le head exact.

## Acceptance attendue

Quality Gates, module registry QA, régression globale, Shop 2 behavioral gates et build Production doivent rester verts sur le même head avant merge.