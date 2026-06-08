# Secteur PHARMACY - Pharmacie / officine / dépôt pharmaceutique léger

## Objectif

L'itération `PHARMACY` fournit un template métier exploitable pour une officine, une pharmacie interne, une petite chaîne ou un dépôt pharmaceutique léger. Elle ne remplace pas un logiciel réglementaire complet, mais structure les produits, lots, stocks, ventes, réceptions, alertes, caisse et incidents avec isolation stricte par `organizationId`.

## Administration Pharmacie

Les organisations `PHARMACY` disposent uniquement des sous-modules sectoriels pertinents:

- tableau de bord pharmacie;
- produits & médicaments;
- lots & péremptions;
- stock & inventaire;
- entrées stock / réceptions;
- sorties, ventes & dispensation;
- ordonnances / prescriptions;
- fournisseurs & commandes;
- caisse, factures & paiements;
- retours, ajustements & pertes;
- alertes stock / péremption / rappel;
- incidents qualité & pharmacovigilance;
- documents & conformité;
- rapports pharmacie;
- paramètres pharmacie.

Chaque sous-module utilise `EnterpriseSectorRecord`, une liste recherchable et paginée, un détail, un formulaire haut responsive, des combobox liées aux enregistrements de la même organisation et des actions persistées via menu `...`.

## Stockage et relations

Les données sont stockées dans `EnterpriseSectorRecord` avec `sectorCode = PHARMACY`, `organizationId`, `moduleCode`, `recordType`, statut, priorité, responsable et `payloadJson`.

Relations logiques validées côté serveur:

- `productId` vers `MEDICINES_PRODUCTS`;
- `batchId` vers `BATCH_EXPIRY`, avec vérification du produit;
- `supplierId` et `purchaseOrderId` vers `SUPPLIERS_ORDERS`;
- `receiptId` vers `STOCK_RECEIPTS`;
- `saleId` vers `SALES_DISPENSATION`;
- `prescriptionId` vers `PRESCRIPTIONS`;
- `departmentId` vers `EnterpriseDepartment`;
- responsables vers un `OrganizationMember` actif.

Le code interne d'un produit est unique dans l'organisation. Les suppressions sont logiques par archivage.

## Règles lots, ventes et réceptions

- Une vente validée/payée diminue une seule fois la quantité disponible du lot.
- Une vente annulée restaure le stock uniquement si un impact avait été appliqué.
- Une réception validée augmente une seule fois le stock du lot lié.
- Les lots expirés, rappelés ou en quarantaine ne sont pas vendables.
- Une sortie dépassant la quantité disponible est refusée.
- Les ventes/réceptions validées sont verrouillées contre modification libre.
- La sélection des lots vendables favorise une future rotation FEFO; le tri automatique FEFO multi-lignes reste une limite connue.

## Activités Pharmacie

Les blocs Activités créent une `EnterpriseActivityRequest` persistée avec destinataire actif obligatoire:

- mes ventes / actions du jour;
- signaler rupture;
- demander réapprovisionnement;
- déclarer produit proche péremption;
- demander validation achat;
- demander validation ajustement stock;
- soumettre rapport caisse;
- signaler anomalie vente;
- signaler incident qualité;
- demander avis pharmacien;
- soumettre inventaire;
- workflows partagés.

Chaque formulaire possède ses champs métier et ses combobox produits, lots, fournisseurs, ventes, ordonnances, inventaires ou caisses.

## Postes et permissions

Le template conserve les postes initiaux et ajoute `RESPONSIBLE_PHARMACIST` et `QUALITY_MANAGER`. Les permissions recommandées couvrent produits, lots, ventes, stock, réceptions, prescriptions, fournisseurs, caisse, ajustements, alertes, qualité, documents, rapports et paramètres.

Le backend applique toujours `canAccessEnterpriseModule()`; masquer une action dans l'interface ne donne ni ne retire un droit.

## API et sécurité multi-tenant

Routes:

- `GET/POST /api/enterprise/[organizationId]/pharmacy`;
- `PATCH/DELETE /api/enterprise/[organizationId]/pharmacy/[recordId]`.

Les routes vérifient session, organisation cliente active, `sectorCode = PHARMACY`, membership, module actif, entitlement, origine sur mutations, rate limiting, Zod, références même organisation, audit et verrouillage métier. Les impacts stock vente/réception sont appliqués dans une transaction Prisma.

## Migration

`20260608143000_pharmacy_sector_iteration` enrichit de façon idempotente le template PHARMACY et les organisations PHARMACY existantes avec les modules, sections Administration, blocs Activités et postes clés.

## Limites restantes

- `EnterpriseSectorRecord` reste un stockage sectoriel générique; des tables dédiées seront nécessaires pour les ventes multi-lignes, inventaires ligne par ligne, factures PDF et traçabilité réglementaire avancée.
- L'upload de documents doit continuer à passer par une route privée de stockage contrôlé avant activation dans les formulaires.
- Le calcul avancé de marge, taxe, caisse et rapports financiers consolidés reste à approfondir.

## Ajouter un sous-module

1. Ajouter le module au template et à une migration idempotente.
2. Ajouter son code et son type dans `lib/validators.ts` et les routes PHARMACY.
3. Ajouter la vue et les champs métier dans `pharmacy-admin-workspace.tsx`.
4. Ajouter les blocs Activités nécessaires et leurs champs dédiés.
5. Documenter les relations, permissions et règles de stock.
6. Étendre `scripts/qa-regression-checks.mjs` et exécuter la QA.
