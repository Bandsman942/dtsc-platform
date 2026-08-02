# Chaînes opérationnelles ERP communes

## Contrat général

Chaque chaîne ci-dessous est isolée par `organizationId`, appelle des services métier dédiés, applique les permissions serveur et publie des événements opérationnels. Les transitions sensibles utilisent une approbation ou une garde de révision. Documents, tâches, réunions, commentaires et notifications réutilisent les objets transversaux existants.

Les workspaces de l’itération 3 ne créent aucun moteur parallèle : ils exposent les services canoniques existants avec formulaires, détails, actions, traductions et responsive.

## Relations globales utilisateur-entreprise

```text
compte global DTSC
  -> invitation ou demande
  -> consentement utilisateur
  -> approbation entreprise éventuelle
  -> relation ACTIVE
  -> accès dérivés explicitement résolus côté serveur
```

Une révocation retire les accès dérivés sans supprimer le dossier métier. Le module global fonctionne sans organisation active et les notifications restent privées au compte destinataire.

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

Le serveur recalcule lignes, remises, taxes, total et arrondis. Une conversion acceptée crée au maximum une commande par devis.

## Contract-to-Delivery

```text
EnterpriseContract ACTIVE
  -> EnterpriseSalesOrder CONFIRMED
  -> EnterpriseFulfillment partiel ou complet
  -> acceptation client éventuelle
  -> commande FULFILLED / CLOSED
```

Le cumul livré ne dépasse jamais la quantité commandée. Chaque livraison utilise une clé d’idempotence. Une livraison ne crée pas automatiquement de facture.

## Request-to-Purchase

```text
EnterpriseRequest(requestType=PURCHASE_REQUEST)
  -> approbation indépendante
  -> EnterprisePurchase
```

La demande conserve demandeur, département, justification, priorité, date souhaitée, fournisseur proposé, projet ou centre de coût éventuel.

## Purchase-to-Receipt

```text
EnterprisePurchase ORDERED
  -> réception partielle ou complète
  -> contrôle des quantités restantes et refusées
  -> événement PURCHASE_RECEIVED
```

La réception prépare le rapprochement futur commande-réception-facture, sans créer la facture fournisseur comptable.

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
EnterpriseStockTransfer
  -> soumission
  -> validation indépendante
  -> sortie source
  -> transit logique
  -> entrée cible
  -> clôture
```

Les mouvements source et cible sont créés dans une seule transaction logique. La quantité globale de l’organisation reste inchangée. Toute sortie est soumise à la politique de stock négatif.

## Inventory-Count-to-Adjustment

```text
campagne
  -> périmètre
  -> comptage théorique/réel
  -> écart
  -> validation
  -> ajustement traçable
  -> clôture
```

L’ajustement ne modifie jamais silencieusement un solde ; il crée un mouvement contrôlé et historisé.

## Hire-to-Employee

```text
EnterpriseBusinessParty PERSON facultatif
  -> EnterpriseEmployee sans compte DTSC obligatoire
  -> EnterpriseEmploymentContract
  -> EnterpriseEmployeeAssignment
  -> liaison DTSC facultative et consentie
```

Un dossier RH n’ouvre ni ne supprime automatiquement un compte utilisateur. Une révocation de relation ne supprime ni le dossier ni son contrat.

## Leave-to-Approval

```text
EnterpriseLeaveRequest
  -> soumission
  -> contrôle des chevauchements
  -> approbation indépendante
  -> APPROVED / REJECTED / CANCELLED
```

L’auto-approbation est refusée lorsque la politique l’exige. Les données sensibles ne sont pas exposées dans les notifications.

## Timesheet-to-Approval

```text
EnterpriseTimesheet
  -> lignes EnterpriseTimesheetEntry
  -> soumission
  -> approbation indépendante
  -> APPROVED / RETURNED / REJECTED
  -> verrouillage éventuel
```

Une ligne peut référencer projet, activité, contrat, client ou service. La durée est recalculée côté serveur. Le temps approuvé reste distinct de la paie.

## Payroll-Preparation-to-Approval

```text
employé actif
  + contrat actif
  + temps approuvé éventuel
  + variables motivées
  -> EnterprisePayrollRun PREPARED
  -> soumission à un autre utilisateur
  -> PENDING_APPROVAL
  -> APPROVED / REJECTED
  -> bulletins privés
```

L’approbation ne crée ni paiement bancaire, ni sortie de caisse, ni écriture comptable. Une paie `CANCELLED` peut être recréée pour la même période, mais deux paies actives restent interdites.

## Project-to-Delivery

```text
EnterpriseProject
  -> équipe
  -> jalons
  -> risques et incidents
  -> temps approuvé
  -> livrables
  -> COMPLETED -> CLOSED
```

Le retrait d’un membre est logique et conserve l’historique. L’accès d’un client exige une relation active, un partage explicite et une permission projet.

## Deliverable-to-Validation

```text
DRAFT
  -> SUBMITTED
  -> ACCEPTED
```

Boucles alternatives :

```text
SUBMITTED -> CHANGES_REQUESTED -> SUBMITTED
SUBMITTED -> REJECTED
```

Un livrable validé n’est jamais écrasé silencieusement. Les commentaires de revue et révisions restent identifiables.

## Asset-to-Assignment

```text
AVAILABLE
  -> affectation active unique
  -> ASSIGNED
  -> retour avec état
  -> AVAILABLE
```

Une double affectation active est refusée. Le bénéficiaire, les dates et l’état avant/après restent historisés.

## Asset-to-Maintenance

```text
EnterpriseAsset AVAILABLE/ASSIGNED
  -> incident éventuel
  -> maintenance PREVENTIVE/CORRECTIVE
  -> PLANNED
  -> IN_PROGRESS
  -> COMPLETED
```

La maintenance peut référencer un fournisseur, un responsable et un coût indicatif. L’amortissement et l’immobilisation comptable restent hors de cette chaîne opérationnelle.

## Meeting-to-Decision-to-Task

```text
EnterpriseMeeting
  -> EnterpriseMeetingDecision
  -> EnterpriseTask
```

Le lien vers projet, opportunité, client, contrat, actif, incident ou achat utilise une FK dédiée lorsque structurante, sinon `EnterpriseEntityLink`.

## Événements contrôlés

- `QUOTE_SENT`, `QUOTE_ACCEPTED`, `SALES_ORDER_CONFIRMED`
- `PURCHASE_SUBMITTED`, `PURCHASE_APPROVED`, `PURCHASE_RECEIVED`
- `INVENTORY_TRANSFER_SUBMITTED`, `INVENTORY_TRANSFER_APPROVED`, `INVENTORY_LOW`
- `LEAVE_SUBMITTED`, `LEAVE_APPROVED`
- `TIMESHEET_SUBMITTED`, `TIMESHEET_APPROVED`
- `PAYROLL_SUBMITTED`, `PAYROLL_APPROVED`, `PAYROLL_CANCELLED`
- `PROJECT_STARTED`, `PROJECT_MEMBER_ADDED`, `DELIVERABLE_SUBMITTED`, `DELIVERABLE_ACCEPTED`
- `ASSET_ASSIGNED`, `ASSET_RETURNED`, `ASSET_INCIDENT_REPORTED`, `ASSET_MAINTENANCE_DUE`
- `ENTERPRISE_IDENTITY_INVITED`, `ENTERPRISE_IDENTITY_ACTIVATED`, `ENTERPRISE_IDENTITY_REVOKED`

Les adapters de workflow appellent toujours les services métier allow-listés. Aucun adapter n’exécute de JavaScript libre, SQL libre ou HTTP arbitraire.
