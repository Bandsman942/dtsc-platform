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

## Module Stock & inventaire

Le stock théorique est calculé depuis `PharmacyBatch`; il n'est jamais inventé dans l'interface. La vue globale agrège les quantités disponibles, réservées et endommagées, la valeur estimée, les ruptures, stocks faibles, surstocks, péremptions, quarantaines, rappels, écarts et ajustements en attente.

Le stock par produit additionne les lots du produit et détermine le statut `AVAILABLE`, `LOW_STOCK`, `OUT_OF_STOCK`, `OVERSTOCK`, `BLOCKED` ou `NOT_TRACKED` à partir des seuils du référentiel produit. Le stock par lot expose les quantités, la péremption, l'emplacement et le dernier mouvement.

Les mouvements `PharmacyStockMovement` sont enrichis avec direction, statut et commentaire. Ils restent immuables; une annulation d'ajustement crée un mouvement inverse au lieu de supprimer l'ancien impact.

Les sessions `PharmacyInventorySession` génèrent des lignes `PharmacyInventoryLine` depuis les lots du tenant. Chaque comptage persiste la quantité physique, calcule `variance = countedQuantity - systemQuantity` et classe l'écart. La validation d'un ajustement `PharmacyStockAdjustment` modifie le lot dans une transaction et crée le mouvement correspondant; une sortie qui rendrait le stock négatif est refusée.

Les emplacements `PharmacyStockLocation` utilisent un code unique par organisation et peuvent représenter rayon, étagère, armoire, réfrigérateur, réserve, comptoir, quarantaine, produits expirés ou réception. Leur archivage est logique.

Route dédiée:

- `GET /api/enterprise/[organizationId]/pharmacy/stock`: KPI, stock produit/lot, mouvements, sessions, lignes, ajustements, emplacements et référentiels;
- `POST /api/enterprise/[organizationId]/pharmacy/stock`: création de session, ajustement ou emplacement, génération de lignes, comptage, soumission/validation, application ou annulation d'ajustement et archivage d'emplacement.

Chaque opération vérifie session, module `STOCK_INVENTORY`, rôle, origine, rate limit, références de la même organisation et audit. Les départements et collaborateurs sont réutilisés depuis le socle commun ERP.

## Module Entrées stock / réceptions

Le sous-module `STOCK_RECEIPTS` gère l'arrivée officielle des produits dans le stock. Il utilise les modèles dédiés `PharmacyReceipt`, `PharmacyReceiptLine`, `PharmacyReceiptBatch`, `PharmacyReceiptDiscrepancy` et `PharmacyReceiptDocument`.

- Une réception peut être liée à une commande fournisseur existante ou être saisie sans commande selon les permissions.
- Chaque ligne référence un produit de la même organisation et répartit exactement la quantité reçue entre un ou plusieurs lots.
- La validation est transactionnelle et idempotente: elle crée ou alimente les lots, augmente le stock et écrit un mouvement `RECEIPT`.
- Une annulation validée crée des mouvements inverses `CANCELLATION` et refuse toute opération qui rendrait le stock négatif.
- Les quantités commandées, déjà reçues et reçues maintenant déterminent les réceptions partielles et le statut de la commande liée.
- Les écarts de quantité sont créés automatiquement; les autres écarts peuvent être persistés avec criticité, responsable et statut.
- Les documents fournisseur sont liés à la réception. Leur téléversement doit passer par le système documentaire privé; aucun champ URL libre ou faux bouton d'upload n'est affiché.
- Les fournisseurs et commandes utilisent désormais les modèles dédiés `PharmacySupplier*` et `PharmacyPurchaseOrder*`; les anciens enregistrements génériques restent non destructivement conservés mais ne sont plus affichés dans le module dédié.

Routes dédiées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/receipts`;
- `GET/PATCH /api/enterprise/[organizationId]/pharmacy/receipts/[receiptId]`.

Toutes les routes vérifient session, origine pour les mutations, rate limit, membership actif, module PHARMACY, permission, validation Zod et appartenance des clés étrangères à `organizationId`.

## Stockage et relations

Les produits, lots et mouvements de stock sont stockés dans `PharmacyProduct`, `PharmacyBatch` et `PharmacyStockMovement`. Les autres opérations restent stockées dans `EnterpriseSectorRecord`.

Relations logiques validées côté serveur:

- `productId` vers `MEDICINES_PRODUCTS`;
- `batchId` vers `BATCH_EXPIRY`, avec vérification du produit;
- `supplierId` vers `PharmacySupplier` et `purchaseOrderId` vers `PharmacyPurchaseOrder`;
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

`20260609203000_pharmacy_stock_inventory_module` enrichit les mouvements et crée les sessions, lignes, ajustements et emplacements de stock sans supprimer les données existantes.

`20260610113000_pharmacy_receipts_module` crée les réceptions, lignes, répartitions par lots, écarts et documents sans supprimer les anciens enregistrements.

`20260610150000_pharmacy_sales_module` crée les ventes, lignes, remboursements, lignes remboursées et anomalies sans supprimer les anciens enregistrements.

`20260610183000_pharmacy_prescriptions_module` crée les ordonnances, lignes prescrites, documents liés et événements d'audit sans supprimer les anciens enregistrements génériques.

`20260610213000_pharmacy_suppliers_purchase_orders` crée les fournisseurs, associations produits, demandes de réapprovisionnement, commandes, lignes, documents et alertes achats sans supprimer les anciens enregistrements génériques.

## Module Sorties, ventes & dispensation

Le module `SALES_DISPENSATION` centralise les ventes comptoir, dispensations sur ordonnance, prises en charge, crédits et sorties internes ou exceptionnelles. Chaque ligne sélectionne un produit actif et un lot vendable proposé selon FEFO.

La confirmation applique une sortie stock idempotente dans une transaction Prisma. Une vente exigeant une validation pharmacien reste bloquée jusqu'à validation. L'annulation restaure les quantités par mouvement inverse; un remboursement peut aussi remettre en stock les lignes autorisées.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/sales`;
- `GET/PATCH /api/enterprise/[organizationId]/pharmacy/sales/[saleId]`.

Les mutations vérifient l'origine, le rate limiting, Zod, le secteur `PHARMACY`, le membership, l'accès à `SALES_DISPENSATION`, les références du même tenant et l'audit.

## Module Ordonnances / prescriptions

Le module `PRESCRIPTIONS` couvre le flux pharmaceutique depuis la réception d'une ordonnance jusqu'à sa dispensation, sans devenir un dossier médical. Il conserve les informations minimales du patient ou client, le prescripteur structuré, les lignes prescrites, le rapprochement avec `PharmacyProduct`, la substitution générique autorisée, le contrôle pharmacien, les documents et l'historique.

Les lignes peuvent rester libres quand un médicament n'existe pas encore dans le référentiel. Tout rapprochement, produit substitut ou collaborateur responsable est validé dans le même `organizationId`. Une substitution garde le produit prescrit, le produit servi, le motif et l'événement d'audit.

Une ordonnance validée peut générer une seule vente brouillon active via `createSaleFromPrescription()`. Les lots vendables sont proposés selon FEFO, mais la génération ne modifie jamais le stock; seule la validation du module Ventes & dispensation applique la sortie réelle.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/prescriptions`;
- `GET/PATCH /api/enterprise/[organizationId]/pharmacy/prescriptions/[prescriptionId]`.

Les actions PATCH couvrent soumission, validation, rejet motivé, demande d'information, rapprochement, substitution, indisponibilité, génération de vente, dispensation partielle ou totale et archivage. Chaque mutation vérifie session, origine, rate limiting, secteur et module actifs, membership, permission, Zod, références du tenant et audit.

Les documents d'ordonnance sont stockés dans `PharmacyPrescriptionDocument` et affichés selon leur confidentialité. Aucun champ URL libre ni faux téléversement n'est exposé; l'ajout de nouveaux fichiers reste conditionné à la route privée de stockage documentaire contrôlé.

## Module Fournisseurs & commandes

Le module `SUPPLIERS_ORDERS` structure le flux depuis le besoin de réapprovisionnement jusqu'à la préparation d'une réception. Les fournisseurs sont stockés dans `PharmacySupplier`; les produits proposés restent ceux de `PharmacyProduct` et sont associés par `PharmacySupplierProduct`, sans duplication du catalogue.

Les demandes de réapprovisionnement identifient le produit, la quantité, la source réelle du besoin, le demandeur, le département et le fournisseur suggéré. Une demande validée peut créer une commande liée. Les commandes et leurs lignes calculent les montants estimés côté serveur, suivent les quantités commandées, reçues et restantes, ainsi que la date de livraison attendue.

`createReceiptFromPurchaseOrder()` accepte uniquement une commande validée, commandée ou partiellement reçue. Il crée une réception brouillon avec les lignes restantes, sans lot et sans impact stock. Le contrôle des lots et l'entrée réelle restent dans Entrées stock / réceptions. À validation, la réception synchronise les quantités reçues/restantes et le statut de commande; une annulation validée contre-passe aussi ces quantités.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/purchases`;
- `PATCH /api/enterprise/[organizationId]/pharmacy/purchases/[entity]/[id]`.

Les actions couvrent soumission, validation, rejet motivé, annulation motivée, suspension/réactivation fournisseur, conversion d'une demande, commande fournisseur, création de réception et résolution d'alerte persistée. Les retards sont également détectés depuis les dates attendues réelles.

Les documents fournisseurs sont liés par `organizationId` au fournisseur, à la commande ou à la réception. Aucun champ URL libre ni faux bouton d'upload n'est affiché: les futurs ajouts doivent réutiliser le stockage documentaire privé.

## Module Incidents qualité & pharmacovigilance

Le module `QUALITY_PHARMACOVIGILANCE` est désormais un registre dédié et structuré. Il relie les incidents aux produits, lots, ventes, ordonnances, réceptions, retours/pertes, fournisseurs, alertes, collaborateurs, départements et emplacements de la même organisation.

Les quatorze vues couvrent le tableau de bord, le registre, la création, les erreurs de dispensation, la pharmacovigilance, les produits suspects, les plaintes, la conservation, les investigations, les CAPA, les escalades, les documents privés, l'audit et les rapports. Les règles fortes empêchent la clôture d'un incident critique sans résolution, d'un incident élevé/critique sans investigation terminée ou d'un dossier avec CAPA obligatoire non validée.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/quality`;
- `PATCH /api/enterprise/[organizationId]/pharmacy/quality/[entity]/[id]`.

La création d'un incident ne modifie jamais automatiquement le lot. La quarantaine, le blocage et la création d'alerte sont des actions explicites, motivées et auditées. La documentation complète est dans `docs/sectors/pharmacy-quality-incidents.md`.

## Module Documents & conformité

Le module `PHARMACY_DOCUMENTS` est désormais un référentiel privé structuré avec quinze vues: tableau de bord, bibliothèque, regroupement par module, vues métier, conformité administrative, expirations, documents manquants, confidentialité et historique. Les nouveaux documents utilisent un modèle unifié et peuvent être liés aux produits, lots, fournisseurs, commandes, réceptions, ventes, paiements, factures, ordonnances, inventaires, retours/pertes/destructions, incidents qualité, alertes et caisses de la même organisation.

Les fichiers sont téléversés uniquement si Supabase Storage est configuré et sont téléchargés par une route privée auditée. Les documents spécialisés historiques restent dans leurs modules d'origine et sont agrégés dans les KPI sans duplication. Les règles complètes sont dans `docs/sectors/pharmacy-documents-compliance.md`.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/documents`;
- `PATCH /api/enterprise/[organizationId]/pharmacy/documents/actions/[entity]/[id]`;
- `GET /api/enterprise/[organizationId]/pharmacy/documents/[id]/download`.

## Module Rapports pharmacie

Le module `PHARMACY_REPORTS` remplace le placeholder historique par quinze vues de pilotage alimentées uniquement depuis les tables métier Pharmacie. Il couvre le tableau de bord, ventes, stock, lots/péremptions, achats/fournisseurs, réceptions, caisse/paiements, ordonnances, retours/pertes/destructions, qualité, alertes, documents/conformité, activité collaborateurs, vues personnalisées simples et historique des exports.

Les filtres période, produit, lot, fournisseur, collaborateur, département et statut sont appliqués côté serveur et restent confinés à `organizationId`. Les montants financiers et rapports sensibles sont masqués sans permission. Les ventes annulées ne participent pas aux ventes nettes, les encaissements viennent de `PharmacyPayment` et les stocks viennent des lots.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/reports`;
- `PATCH /api/enterprise/[organizationId]/pharmacy/reports/actions/[entity]/[id]`;
- `POST /api/enterprise/[organizationId]/pharmacy/reports/export`.

La documentation et le dictionnaire KPI sont dans `docs/sectors/pharmacy-reports.md`.

## Limites restantes

- `EnterpriseSectorRecord` reste le stockage des opérations hors produits, lots, stock, réceptions, ventes, ordonnances et achats; des tables dédiées seront nécessaires pour les factures PDF et la traçabilité réglementaire avancée.
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
# Module Caisse, factures & paiements

Le module organise la finance opérationnelle du comptoir sans devenir un ERP comptable complet. Il relie les ventes aux paiements persistés, reçus, factures, sessions de caisse, remboursements, clôtures et écarts.

## Parcours et règles

- Une session est ouverte pour un caissier actif, un point de vente, une devise et un solde initial. Un même caissier ne peut pas posséder plusieurs sessions actives.
- Les paiements supportent espèces, Mobile Money, carte, virement, crédit client, assurance, bon/coupon et autre. Les encaissements comptoir exigent une session ouverte.
- Les paiements recalculent côté serveur les montants payé/restant et le statut de la vente. Une facture active unique peut être générée depuis une vente et un reçu depuis un paiement validé.
- Les remboursements sont persistés et plafonnés au montant réellement payé. La remise en stock reste traitée par le workflow Ventes/Stock afin de conserver les mouvements auditables.
- La clôture agrège les paiements par mode, les remboursements et les ventes, calcule le cash théorique, le cash compté et l'écart. Un écart significatif exige une justification.
- La validation de clôture est réservée aux rôles de gestion; le caissier ne peut pas valider sa propre clôture.

## Interface

Administration Entreprise expose treize vues: tableau de bord, sessions, ouverture, encaissements, paiements, factures, reçus, remboursements, clôture, écarts, validation, historique et rapports. Les formulaires relationnels utilisent les ventes, sessions, paiements, collaborateurs et départements de l'organisation active.

## API et multi-tenant

- `GET|POST /api/enterprise/[organizationId]/pharmacy/cash`
- `PATCH /api/enterprise/[organizationId]/pharmacy/cash/[entity]/[id]`

Toutes les routes vérifient le membership actif, le secteur PHARMACY, l'activation de `CASH_INVOICES_PAYMENTS`, les permissions, Zod et les références de la même organisation. Les mutations sont protégées par origine, rate limit et audit.

## Intégration finances et limites

Les champs de liaison aux finances communes sont présents, mais aucune synchronisation n'est affichée tant qu'un compte financier multi-tenant entreprise n'est pas disponible. Le reçu HTML est persisté et consultable; aucun faux téléchargement PDF n'est proposé.

## Module Retours, ajustements & pertes

Le module `RETURNS_ADJUSTMENTS_LOSSES` centralise les retours clients et fournisseurs, ajustements de stock, pertes, casses, produits expirés retirés, rappels de lots, destructions et transferts exceptionnels. Il conserve le motif, la criticité, les références métier, les validations, les documents et alertes dans des modèles dédiés isolés par `organizationId`.

La validation applique l'entrée ou la sortie de stock dans une transaction idempotente et crée un mouvement traçable. Une annulation après validation crée le mouvement inverse `RETURN_LOSS_REVERSAL`; elle ne réécrit pas silencieusement l'historique. Les références vers vente, remboursement, fournisseur, commande, réception, inventaire, produit, lot, emplacement, responsable et témoin sont vérifiées dans la même pharmacie.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/returns-losses`;
- `PATCH /api/enterprise/[organizationId]/pharmacy/returns-losses/[entity]/[id]`.

Les mutations contrôlent l'origine, le rate limiting, Zod, le secteur et module actifs, le membership, les permissions et l'audit. L'interface fournit douze vues, des libellés français, des aides contextuelles et des formulaires plein écran bornés sur mobile.

## Paramètres pharmacie

Le sous-module `PHARMACY_SETTINGS` remplace le placeholder par un centre de configuration réel. Il couvre les informations générales, numérotations, produits et lots, stock, FEFO, ventes, ordonnances, achats, caisse, pertes, alertes, documents, qualité, rapports, sécurité, intégrations ERP et historique.

Les paramètres sont isolés par `organizationId`, appliqués côté serveur et audités lorsqu'ils sont critiques. Les séquences de numérotation alimentent les objets métier concernés sans dépendre d'un numéro saisi par le client. Voir `docs/sectors/pharmacy-settings.md`.

## Module Activités pharmacie

`Activités [Entreprise]` fournit aux collaborateurs PHARMACY un espace opérationnel distinct de l'administration sensible. Les dix-sept vues couvrent tableau de bord personnel, tâches, ventes et caisses du jour, validations, alertes assignées, demandes et signalements, documents/procédures, workflows et historique.

Chaque action est persistée dans `PharmacyActivityItem` et `PharmacyActivityEvent`. Les demandes alimentent les modèles métier concernés, sans appliquer directement un ajustement de stock, valider une commande, bloquer un lot ou approuver une clôture de caisse. La visibilité reste limitée au demandeur, au responsable assigné ou aux rôles de gestion autorisés. Voir `docs/sectors/pharmacy-activities.md`.

## Module Alertes stock / péremption / rappel

Le module `ALERTS_EXPIRY_LOW_STOCK` centralise des alertes persistées issues de données réelles: stock, péremption, rappel/quarantaine, achats, réceptions, ventes, inventaire, ajustements, retours/pertes et caisse. `PharmacyAlert` garde la condition, la source, la criticité, le responsable, les dates et le traitement; `PharmacyAlertEvent` conserve chaque détection et transition.

La déduplication utilise `organizationId`, le type, le module et objet source, le produit et le lot. Une nouvelle détection met à jour `lastDetectedAt` et `detectedCount`; une condition réapparue rouvre l'alerte. Les règles et seuils sont persistés par organisation. Les alertes critiques peuvent notifier les gérants actifs.

Routes privées:

- `GET/POST /api/enterprise/[organizationId]/pharmacy/alerts`;
- `PATCH /api/enterprise/[organizationId]/pharmacy/alerts/[entity]/[id]`.

Le cycle de vie couvre ouverture, vue, assignation, prise en charge, commentaire, résolution, ignorance motivée, annulation motivée et archivage. Toutes les mutations sont protégées par origine, rate limiting, Zod, RBAC et audit. Les règles détaillées sont documentées dans `docs/sectors/pharmacy-alert-rules.md`.

## Dépendances avec le socle commun ERP

PHARMACY conserve ses référentiels spécialisés comme sources métier. Chaque activité pharmacie crée également un objet transversal lié par `EnterpriseEntityLink` : les demandes de réapprovisionnement, ajustements, avis pharmacien et documents alimentent Demandes internes ; les rapports caisse et inventaires alimentent Rapports entreprise ; les ruptures, péremptions, anomalies et incidents qualité alimentent Tâches & opérations.

Cette liaison rend le travail visible dans les modules communs aux collaborateurs concernés sans contourner les validations ni modifier directement les lots, stocks, ventes, caisses ou incidents. Les règles détaillées sont documentées dans `docs/enterprise-core.md`.
