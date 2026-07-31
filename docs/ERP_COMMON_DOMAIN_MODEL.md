# Modèle canonique des domaines ERP communs

## Objet

Ce document définit le Core ERP opérationnel commun de DTSC Platform pour toutes les organisations clientes. Il complète le registre canonique de modules livré par l’itération 1 et interdit la création de référentiels concurrents par secteur.

## Principes structurants

1. Chaque enregistrement métier porte `organizationId`.
2. Les identifiants métier uniques sont tenant-aware.
3. Une relation structurante entre deux objets canoniques utilise une vraie clé étrangère.
4. `EnterpriseEntityLink` reste réservé aux liens transversaux ou polymorphes.
5. Les mutations passent par un service métier, appliquent une concurrence optimiste et publient un événement opérationnel.
6. Les objets Health et Pharmacy existants ne sont ni migrés ni supprimés pendant l’itération 2.
7. Aucun objet de cette itération ne produit d’écriture comptable, de paiement, de créance ou de dette définitive.

## Objets existants réutilisés

| Agrégat | Objet existant | Responsabilité canonique |
|---|---|---|
| Travail | `EnterpriseTask` | tâches transversales et actions de suivi |
| Demandes | `EnterpriseRequest` | demandes internes, notamment `PURCHASE_REQUEST` |
| Validation | `EnterpriseApproval` | séparation demandeur/approbateur et décisions |
| Réunions | `EnterpriseMeeting` | réunions, participants et décisions |
| Documents | `EnterpriseDocument` | métadonnées, versions privées et contrôle d’accès |
| Fournisseurs | `EnterpriseSupplier` | profil fournisseur spécialisé |
| Achats | `EnterprisePurchase` | acquisition canonique avant comptabilité fournisseur |
| Réceptions | `EnterprisePurchaseReceipt` | réception opérationnelle d’un achat |
| Budgets | `EnterpriseBudget` | enveloppes opérationnelles existantes |
| Dépenses | `EnterpriseExpense` | dépense opérationnelle existante, sans grand livre |
| Rapports | `EnterpriseReport` | snapshots opérationnels immuables |
| Workflows | `EnterpriseWorkflowDefinition` | définitions versionnées et adapters statiques |
| Liens | `EnterpriseEntityLink` | liens transversaux non structurants |
| Timeline | `EnterpriseOperationalEvent` | journal opérationnel append-only |
| Commentaires | `EnterpriseOperationalComment` | discussions métier bornées et contrôlées |

## Nouveaux agrégats

### Référentiel des tiers

- `EnterpriseBusinessParty`: identité légale ou usuelle d’une personne ou organisation.
- `EnterpriseBusinessPartyRole`: rôles contrôlés `CUSTOMER`, `PROSPECT`, `SUPPLIER`, `PARTNER`, `INSURER`, `DONOR`, `BENEFICIARY`, `SERVICE_PROVIDER`, `OTHER`.
- `EnterpriseBusinessPartyContact`: moyens de contact structurés.
- `EnterpriseBusinessPartyAddress`: adresses structurées et archivables.

`EnterpriseSupplier` reste le profil fournisseur spécialisé et référence un `EnterpriseBusinessParty`.

### Catalogue commun

- `EnterpriseCatalogCategory`
- `EnterpriseUnitOfMeasure`
- `EnterpriseCatalogItem`

Types d’item: `PRODUCT`, `SERVICE`, `FEE`, `SUBSCRIPTION`, `OTHER`. Les montants sont indicatifs et commerciaux; ils ne déclenchent aucune écriture.

### Sites et stockage

- `EnterpriseSite`
- `EnterpriseWarehouse`
- `EnterpriseStorageLocation`

Les contraintes réglementaires Pharmacy restent dans le secteur Pharmacy.

### CRM et ventes opérationnelles

- `EnterpriseLead`
- `EnterpriseOpportunity`
- `EnterpriseQuote` et `EnterpriseQuoteItem`
- `EnterpriseContract`
- `EnterpriseSalesOrder` et `EnterpriseSalesOrderItem`
- `EnterpriseFulfillment` et `EnterpriseFulfillmentItem`

Les devis et commandes sont des objets commerciaux. Une commande n’est pas une facture comptable.

### Stock et logistique

- `EnterpriseInventoryItem`
- `EnterpriseStockLot`
- `EnterpriseStockMovement`
- `EnterpriseInventoryBalance`
- `EnterpriseInventoryCount` et `EnterpriseInventoryCountLine`
- `EnterpriseStockTransfer` et `EnterpriseStockTransferLine`
- `EnterpriseStockAdjustment`

Source de vérité: `EnterpriseStockMovement` est le journal opérationnel immuable; `EnterpriseInventoryBalance` est une projection transactionnelle contrôlée. Le stock négatif est interdit par défaut.

### Ressources humaines clientes

- `EnterpriseEmployee`
- `EnterpriseEmploymentContract`
- `EnterpriseEmployeeAssignment`
- `EnterpriseWorkSchedule`
- `EnterpriseAttendance`
- `EnterpriseLeaveRequest`
- `EnterpriseTimesheet` et `EnterpriseTimesheetEntry`
- `EnterprisePayrollPeriod`
- `EnterprisePayrollRun` et `EnterprisePayrollItem`
- `EnterprisePayslip`

Ces objets appartiennent aux organisations clientes. Ils ne réutilisent pas `HrcfoEmployee` ou `HrcfoPayroll`, réservés au tenant interne DTSC. Une paie approuvée n’est pas un paiement.

### Projets et prestations

- `EnterpriseProject`
- `EnterpriseProjectMember`
- `EnterpriseProjectMilestone`
- `EnterpriseProjectDeliverable`
- `EnterpriseProjectRisk`
- `EnterpriseProjectIssue`

Le temps projet est porté par `EnterpriseTimesheetEntry`; aucune table concurrente de temps n’est créée.

### Actifs et maintenance

- `EnterpriseAssetCategory`
- `EnterpriseAsset`
- `EnterpriseAssetAssignment`
- `EnterpriseAssetMaintenance`
- `EnterpriseAssetIncident`

La valeur d’acquisition est informative. L’amortissement est différé à l’itération 3.

## Machines d’état principales

- Lead: `NEW -> CONTACTED -> QUALIFIED -> CONVERTED`; perte ou archivage contrôlé.
- Opportunité: `OPEN -> QUALIFIED -> PROPOSAL -> NEGOTIATION -> WON -> CLOSED`; perte contrôlée.
- Devis: `DRAFT -> SENT -> ACCEPTED -> CONVERTED`; rejet, expiration ou annulation contrôlés.
- Contrat commercial: `DRAFT -> PENDING_APPROVAL -> ACTIVE -> SUSPENDED/EXPIRED/TERMINATED`.
- Commande: `DRAFT -> PENDING_APPROVAL -> CONFIRMED -> IN_FULFILLMENT -> PARTIALLY_FULFILLED -> FULFILLED -> CLOSED`.
- Congé: `DRAFT -> SUBMITTED -> APPROVED/REJECTED -> CANCELLED`.
- Timesheet: `DRAFT -> SUBMITTED -> APPROVED/CORRECTION_REQUESTED/REJECTED`.
- Paie: `DRAFT -> PREPARED -> PENDING_APPROVAL -> APPROVED_AWAITING_PAYMENT`; rejet ou annulation contrôlés.
- Projet: `DRAFT -> PENDING_APPROVAL -> PLANNED -> ACTIVE -> ON_HOLD -> COMPLETED -> CLOSED`.
- Livrable: `DRAFT -> SUBMITTED -> ACCEPTED/CHANGES_REQUESTED/REJECTED`.
- Maintenance: `PLANNED -> IN_PROGRESS -> COMPLETED`; annulation contrôlée.

## Dépendances structurantes

- Ventes dépend du tiers commun et du catalogue.
- Stock dépend du catalogue, des sites et des entrepôts.
- Réception d’achat réutilise `EnterprisePurchaseReceipt` et ne crée un mouvement que pour un produit suivi en stock.
- Paie opérationnelle dépend de RH et, si configuré, du temps approuvé.
- Projet peut référencer un client, un contrat et un budget existant.
- Actif peut référencer un fournisseur, un achat source, un site et un emplacement.

## Frontières explicites

### Itération 3 — Finance

Différés: factures comptables finales, créances, dettes, paiements, caisse commune, banque, journaux, écritures débit/crédit, grand livre, balance, états financiers, valorisation officielle du stock, comptabilisation de la paie, amortissements, fiscalité et FX comptable.

### Itération 4 — Health et Pharmacy

Différés: extension obligatoire de `PharmacyProduct`, `PharmacySale`, `PharmacyInvoice`, `PharmacyPayment`, `HealthBillingServiceCatalog`, `HealthMedicalInvoice` et `HealthMedicalInvoicePayment` vers les objets communs.

### Itération 5 — Legacy

Différés: migration finale, lecture seule, décommissionnement et suppression éventuelle d’objets legacy après backfill vérifié.
