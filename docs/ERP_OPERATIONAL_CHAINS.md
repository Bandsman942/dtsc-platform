# Chaînes opérationnelles ERP communes

## Contrat général

Chaque chaîne ci-dessous est isolée par `organizationId`, appelle des services métier dédiés, applique les permissions serveur et publie des événements dans `EnterpriseOperationalEvent`. Les transitions sensibles utilisent `EnterpriseApproval`. Les documents, tâches, réunions et commentaires réutilisent les objets transversaux existants.

## Lead-to-Order

```text
EnterpriseLead
  -> qualification
  -> EnterpriseBusinessParty + rôle CUSTOMER/PROSPECT
  -> EnterpriseOpportunity
  -> EnterpriseQuote
  -> EnterpriseSalesOrder
```

La conversion d’un lead est transactionnelle et idempotente. Aucun paiement ou facture comptable n’est créé.

## Quote-to-Order

```text
DRAFT -> SENT -> ACCEPTED -> CONVERTED
```

Le serveur recalcule les lignes, remises et taxes indicatives. Une conversion acceptée crée au maximum une commande par devis.

## Contract-to-Delivery

```text
EnterpriseContract ACTIVE
  -> EnterpriseSalesOrder CONFIRMED
  -> EnterpriseFulfillment
  -> acceptation client éventuelle
```

Une livraison partielle est autorisée; le cumul livré ne peut dépasser la quantité commandée.

## Request-to-Purchase

```text
EnterpriseRequest(requestType=PURCHASE_REQUEST)
  -> EnterpriseApproval
  -> EnterprisePurchase
```

La demande conserve demandeur, département, justification, priorité, date souhaitée, fournisseur proposé et budget éventuel.

## Purchase-to-Receipt

```text
EnterprisePurchase ORDERED
  -> EnterprisePurchaseReceipt
  -> contrôle des quantités restantes
  -> événement PURCHASE_RECEIVED
```

La réception ne crée pas de facture fournisseur comptable.

## Receipt-to-Stock

```text
EnterprisePurchaseReceiptItem
  -> produit suivi en stock ?
  -> EnterpriseStockMovement(PURCHASE_RECEIPT)
  -> EnterpriseInventoryBalance mis à jour dans la même transaction
```

Une prestation de service ne crée aucun mouvement de stock. L’idempotence est garantie par une clé source stable.

## Inventory-to-Transfer

```text
EnterpriseStockTransfer DRAFT
  -> SUBMITTED
  -> APPROVED
  -> TRANSFER_OUT + TRANSFER_IN
  -> COMPLETED
```

Les deux mouvements sont créés dans une seule transaction logique. La quantité globale de l’organisation reste inchangée.

## Hire-to-Employee

```text
EnterpriseBusinessParty PERSON facultatif
  -> EnterpriseEmployee
  -> EnterpriseEmploymentContract
  -> EnterpriseEmployeeAssignment
```

Un dossier RH n’ouvre ni ne supprime automatiquement un compte utilisateur. Le lien `OrganizationMember` est optionnel et vérifié.

## Leave-to-Approval

```text
EnterpriseLeaveRequest DRAFT
  -> SUBMITTED
  -> EnterpriseApproval
  -> APPROVED / REJECTED
```

L’auto-approbation est refusée par défaut. Les données sensibles ne sont pas exposées dans les notifications système.

## Timesheet-to-Approval

```text
EnterpriseTimesheet DRAFT
  -> lignes EnterpriseTimesheetEntry
  -> SUBMITTED
  -> EnterpriseApproval
  -> APPROVED / CORRECTION_REQUESTED / REJECTED
```

Une ligne peut référencer projet, tâche, contrat, client, service ou mission. La durée est recalculée côté serveur.

## Payroll-Preparation-to-Approval

```text
Employé actif
  + contrat actif
  + temps approuvé éventuel
  + ajustements motivés
  -> EnterprisePayrollRun PREPARED
  -> EnterpriseApproval
  -> APPROVED_AWAITING_PAYMENT
```

L’approbation ne crée ni paiement bancaire, ni sortie de caisse, ni écriture comptable. Le brut provient du contrat actif. Les primes et retenues exigent un motif.

## Project-to-Delivery

```text
EnterpriseProject
  -> membres
  -> jalons
  -> tâches
  -> livrables
  -> temps approuvé
  -> COMPLETED -> CLOSED
```

Les livrables passent par soumission et acceptation. Les dépenses et achats existants peuvent être liés, sans produire une marge comptable officielle.

## Asset-to-Maintenance

```text
EnterpriseAsset AVAILABLE/ASSIGNED
  -> EnterpriseAssetIncident éventuel
  -> EnterpriseAssetMaintenance PLANNED
  -> IN_PROGRESS
  -> COMPLETED
```

La maintenance peut créer une tâche, une demande, un achat, un document ou une dépense existante. L’amortissement est hors périmètre.

## Meeting-to-Decision-to-Task

```text
EnterpriseMeeting
  -> EnterpriseMeetingDecision
  -> EnterpriseTask
```

Le lien vers projet, opportunité, client, contrat, actif, incident ou achat utilise une FK dédiée lorsque structurante, sinon `EnterpriseEntityLink`.

## Événements contrôlés

- `QUOTE_SENT`, `QUOTE_ACCEPTED`
- `CONTRACT_SUBMITTED`, `CONTRACT_ACTIVATED`
- `SALES_ORDER_CONFIRMED`
- `PURCHASE_RECEIVED`
- `INVENTORY_LOW`
- `LEAVE_SUBMITTED`, `LEAVE_APPROVED`
- `TIMESHEET_SUBMITTED`, `TIMESHEET_APPROVED`
- `PAYROLL_SUBMITTED`, `PAYROLL_APPROVED`
- `PROJECT_STARTED`, `DELIVERABLE_SUBMITTED`
- `ASSET_MAINTENANCE_DUE`

Les adapters de workflow appellent toujours les services métier allow-listés. Aucun adapter n’exécute de JavaScript libre, SQL libre ou HTTP arbitraire.
