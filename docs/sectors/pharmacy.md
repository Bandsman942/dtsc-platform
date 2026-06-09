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

Les sous-modules opérationnels utilisent `EnterpriseSectorRecord`. Les sous-modules **Produits & médicaments** et **Lots & péremptions** utilisent désormais les tables dédiées `PharmacyProduct`, `PharmacyBatch` et `PharmacyStockMovement`.

## Module Produits & médicaments

Le catalogue central couvre l'identification, la classification, la présentation, les règles de dispensation, les seuils de stock, les conditions de conservation, les prix indicatifs et le statut. Les catégories, formes pharmaceutiques, voies d'administration, unités, types de conservation, devises et statuts proviennent de listes contrôlées partagées.

Le code interne et le code-barres sont uniques par organisation. Les validations refusent notamment les prix ou stocks négatifs, un stock maximal inférieur au stock minimal, une température maximale inférieure à la minimale et un taux de remise hors de l'intervalle 0 à 100.

Les produits archivés restent conservés pour l'audit. Les autres sous-modules et les Activités utilisent le catalogue dédié dans leurs combobox; une référence produit est toujours vérifiée dans la même organisation.

## Module Lots & péremptions

Un produit peut posséder plusieurs lots. Chaque lot est isolé par `organizationId`, lié à un produit de la même pharmacie et identifié de façon unique par le couple produit + numéro de lot. Un code-barres de lot renseigné est également unique dans l'organisation.

La fiche lot couvre l'identification, les quantités reçues/disponibles/réservées/endommagées, le fournisseur et l'origine, les dates, le stockage, les prix, le statut de sécurité, les notes et les références documentaires. Le formulaire utilise de vraies sélections pour les produits, fournisseurs, commandes, réceptions et collaborateurs disponibles.

Les statuts automatiques respectent la priorité suivante: rappelé, quarantaine, bloqué, annulé, expiré, épuisé, proche péremption, actif. Les statuts forts empêchent toujours la vente. Le seuil de péremption personnalisé du lot est utilisé quand il est renseigné, sinon le seuil par défaut est de 90 jours.

Les actions quarantaine, levée de quarantaine, rappel, blocage et annulation exigent un motif, vérifient les droits côté serveur, mettent à jour le lot, créent un mouvement de stock sans double impact de quantité et écrivent un audit.

La fonction `getSellableBatchesForProduct(organizationId, productId)` prépare la logique FEFO pour les ventes futures. Elle retourne uniquement les lots de la même organisation, disponibles, non expirés et non bloqués, triés par date de péremption croissante.

Routes dédiées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/batches`;
- `GET/PATCH/DELETE /api/enterprise/[organizationId]/pharmacy/batches/[batchId]`;
- `POST /api/enterprise/[organizationId]/pharmacy/batches/[batchId]/quarantine`;
- `POST /api/enterprise/[organizationId]/pharmacy/batches/[batchId]/release-quarantine`;
- `POST /api/enterprise/[organizationId]/pharmacy/batches/[batchId]/recall`;
- `POST /api/enterprise/[organizationId]/pharmacy/batches/[batchId]/block`;
- `POST /api/enterprise/[organizationId]/pharmacy/batches/[batchId]/cancel`;
- `GET /api/enterprise/[organizationId]/pharmacy/products/[productId]/sellable-batches`.

Les permissions lots couvrent consultation, création, modification, archivage, quarantaine, levée de quarantaine, rappel, blocage, coûts et documents. Le backend réapplique toujours les droits du module `BATCH_EXPIRY`.

Les alertes proches péremption, expiré, rappelé, quarantaine, quantité faible et épuisé sont calculées depuis les données réelles du lot. La persistance dédiée dans un futur référentiel `pharmacy_alerts` reste à réaliser lors de l'itération Alertes.

## Stockage et relations

Les produits, lots et mouvements de stock sont stockés dans `PharmacyProduct`, `PharmacyBatch` et `PharmacyStockMovement`. Les autres opérations restent stockées dans `EnterpriseSectorRecord`.

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
- `GET/POST /api/enterprise/[organizationId]/pharmacy/products`;
- `GET/PATCH/DELETE /api/enterprise/[organizationId]/pharmacy/products/[productId]`.

Les routes vérifient session, organisation cliente active, `sectorCode = PHARMACY`, membership, module actif, entitlement, origine sur mutations, rate limiting, Zod, références même organisation, audit et verrouillage métier. Les impacts stock vente/réception sont appliqués dans une transaction Prisma.

## Migration

`20260608143000_pharmacy_sector_iteration` enrichit de façon idempotente le template PHARMACY et les organisations PHARMACY existantes avec les modules, sections Administration, blocs Activités et postes clés.

`20260609110000_pharmacy_products_module` crée le catalogue dédié et migre sans suppression les anciens produits génériques possédant un code interne.

`20260609173000_pharmacy_batches_module` crée les tables lots et mouvements, puis copie sans suppression les anciens lots génériques valides et génère leur mouvement initial.

## Limites restantes

- `EnterpriseSectorRecord` reste le stockage des opérations hors produits/lots; des tables dédiées seront nécessaires pour les ventes multi-lignes, inventaires ligne par ligne, factures PDF et traçabilité réglementaire avancée.
- Les alertes lots sont calculées à la lecture; leur workflow persistant sera ajouté dans l'itération Alertes.
- L'upload de documents doit continuer à passer par une route privée de stockage contrôlé avant activation dans les formulaires.
- Le calcul avancé de marge, taxe, caisse et rapports financiers consolidés reste à approfondir.

## Ajouter un sous-module

1. Ajouter le module au template et à une migration idempotente.
2. Ajouter son code et son type dans `lib/validators.ts` et les routes PHARMACY.
3. Ajouter la vue et les champs métier dans `pharmacy-admin-workspace.tsx`.
4. Ajouter les blocs Activités nécessaires et leurs champs dédiés.
5. Documenter les relations, permissions et règles de stock.
6. Étendre `scripts/qa-regression-checks.mjs` et exécuter la QA.
