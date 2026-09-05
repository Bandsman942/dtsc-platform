# Hotfix #578 — Parité Prisma ↔ migrations des liaisons Procurement/ERP

## Contexte

Le hotfix Finance #576 a révélé qu'une base PostgreSQL reconstruite uniquement avec `prisma migrate deploy` ne possédait pas certaines contraintes uniques pourtant déclarées dans les modèles Prisma des liaisons Procurement↔ERP. Le symptôme observable est PostgreSQL `42P10` lors d'un `upsert` utilisant une clé composée déclarée dans Prisma mais absente physiquement.

`EnterpriseSupplierPartyLink` a été réparé dans #576 car cette contrainte était directement requise par la convergence fournisseur→tiers. #578 rembourse la même dette historique pour les quatre autres tables créées par les migrations `20260731083010b` à `20260731083010e`.

## Tables concernées

- `EnterprisePurchaseOperationalLink`
- `EnterprisePurchaseItemCatalogLink`
- `EnterprisePurchaseReceiptOperationalLink`
- `EnterprisePurchaseReceiptItemStockLink`

Les migrations historiques de création ont posé les tables et leur clé primaire, mais pas les `@@unique`/`@@index` aujourd'hui déclarés dans `prisma/enterprise-procurement-links.prisma`.

## Correction

La migration additive `20260905133000_repair_procurement_erp_link_constraints` :

1. refuse explicitement de poursuivre si des doublons historiques violent une clé métier à rendre unique ;
2. ne supprime, fusionne ni réécrit aucune donnée ;
3. restaure les contraintes composées nécessaires aux opérations Prisma ;
4. restaure les index de lecture tenant-scoped déclarés par le modèle ;
5. ne modifie aucune migration historique.

Les doublons contrôlés sont :

- achat : `(organizationId, purchaseId)` ;
- ligne achat↔catalogue : `(organizationId, purchaseItemId)` ;
- réception opérationnelle : `(organizationId, purchaseReceiptId)` ;
- idempotence réception : `(organizationId, idempotencyKey)` lorsque non nul ;
- ligne réception↔stock : `(organizationId, purchaseReceiptItemId)` ;
- mouvement de stock : `(organizationId, stockMovementId)` lorsque non nul.

## Preuve fonctionnelle

`lib/enterprise/sector-convergence/pharmacy-procurement-service.ts` utilise déjà `enterprisePurchaseItemCatalogLink.upsert()` avec `organizationId_purchaseItemId`. Le garde `scripts/qa-hotfix-578-procurement-link-parity.mjs` vérifie ce contrat statiquement et, dans le workflow Accounting production-like, exécute deux `upsert` identiques sur la même clé puis exige le même `id` et exactement une ligne.

Ainsi, le test reproduit directement la classe de défaillance `42P10` découverte pendant #576.

## Sécurité et multi-tenant

Toutes les clés réparées conservent `organizationId` dans leur composition. Aucun rôle, entitlement, permission, route ou frontière tenant n'est élargi. Le hotfix ne crée aucune nouvelle source métier.

## Rollback

Le code peut être revert. Les contraintes et index additifs peuvent rester en place : ils expriment déjà le modèle Prisma canonique et ne suppriment aucune donnée. Si un retrait devenait exceptionnellement nécessaire, il devrait passer par une migration inverse dédiée ; les migrations historiques ne doivent jamais être réécrites.

## Dette

Aucune dette de parité connue n'est volontairement maintenue sur les quatre tables couvertes. Toute nouvelle divergence Prisma↔migration de cette famille doit être détectée par la QA #578 et corrigée de manière additive.
