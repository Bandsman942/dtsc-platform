# Chaînes opérationnelles ERP communes

## Contrat général

Chaque chaîne ci-dessous est isolée par `organizationId`, appelle des services métier dédiés, applique les permissions serveur et publie des événements opérationnels. Les transitions sensibles utilisent une approbation ou une garde de révision. Documents, tâches, réunions, commentaires et notifications réutilisent les objets transversaux existants.

Les workspaces professionnels ne créent aucun moteur parallèle : ils exposent les services canoniques existants avec formulaires, détails, actions, traductions et responsive.

## Relations globales utilisateur-entreprise

```text
compte global DTSC
  -> invitation ou demande
  -> consentement utilisateur
  -> approbation entreprise éventuelle
  -> relation ACTIVE
  -> accès dérivés explicitement résolus côté serveur
```

Une révocation retire les accès dérivés sans supprimer le dossier métier. Le module global fonctionne sans organisation active et les notifications restent privées au compte destinataire. Une relation active ne donne aucun accès Finance automatique.

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

## Invoice-to-Receivable-to-Payment

```text
facture client émise
  -> créance commune unique
  -> écriture de facture idempotente
  -> paiement confirmé
  -> allocation bornée
  -> solde de créance mis à jour
  -> écriture de trésorerie
```

La facture, la créance, le paiement, l’allocation et l’écriture restent des objets distincts. Une relance ne crée jamais une seconde créance ou écriture.

## Supplier-Invoice-to-Payable-to-Payment

```text
facture fournisseur approuvée
  -> dette commune unique
  -> écriture de facture idempotente
  -> paiement fournisseur confirmé
  -> allocation bornée
  -> solde de dette mis à jour
  -> écriture de trésorerie
```

La réception d’un achat ne devient pas automatiquement une facture fournisseur. Le rapprochement commande-réception-facture reste explicite.

## Business-Event-to-Posting

```text
événement métier validé
  -> registre de posting allow-listé
  -> résolution de règle et comptes actifs
  -> période autorisée
  -> clé d’idempotence stable
  -> lot de comptabilisation
  -> écriture équilibrée
  -> POSTED
```

Un retry retourne le lot existant. Aucune écriture déséquilibrée, sans journal, sans période ou avec un compte d’un autre tenant ne peut être comptabilisée.

## Journal-Entry-to-Reversal

```text
écriture POSTED
  -> action Contrepasser
  -> date autorisée
  -> motif
  -> acteur indépendant
  -> lignes inversées
  -> écriture de contrepassation POSTED
  -> original REVERSED et conservé
```

L’original n’est jamais modifié ou supprimé. La contrepassation est liée, auditée et idempotente.

## Tax-Configuration-to-Transaction

```text
code fiscal
  -> compte collecté/déductible
  -> taux avec date d’effet
  -> facture ou opération à la date T
  -> taux applicable à T conservé
  -> ligne fiscale
  -> écriture fiscale
```

Un nouveau taux ne modifie jamais une facture ou écriture historique.

## Asset-to-Capitalization-to-Depreciation

```text
EnterpriseAsset opérationnel
  -> décision de capitalisation
  -> EnterpriseAssetAccountingProfile
  -> écriture de capitalisation
  -> plan linéaire mensuel
  -> échéance exigible
  -> écriture d’amortissement idempotente
```

Tous les actifs opérationnels ne deviennent pas automatiquement des immobilisations. Une même échéance ne peut pas être comptabilisée deux fois.

## Stock-Movement-to-Valuation

```text
mouvement physique IN
  -> couche de coût moyen pondéré
  -> événement comptable de réception
  -> écriture stock

mouvement physique OUT
  -> contrôle des couches disponibles
  -> coût moyen pondéré
  -> événement comptable de sortie
  -> écriture coût des ventes / stock
```

Une requête de valorisation ne modifie pas le stock physique. Une sortie qui excède les couches disponibles est bloquée.

## Period-to-Close-to-Publish

```text
période OPEN
  -> checklist de clôture
  -> blocages cliquables
  -> corrections
  -> soumission
  -> approbation indépendante
  -> CLOSED / LOCKED
  -> génération d’états
  -> publication d’une version immuable
```

Une réouverture exige permission, motif, acteur indépendant et audit. Elle ne supprime ni écritures de clôture ni états publiés.

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
- `JOURNAL_ENTRY_SUBMITTED`, `JOURNAL_ENTRY_APPROVED`, `JOURNAL_ENTRY_POSTED`, `JOURNAL_ENTRY_REVERSED`
- `FINANCIAL_CLOSE_PREPARED`, `FINANCIAL_CLOSE_APPROVED`, `FINANCIAL_CLOSE_COMPLETED`, `FINANCIAL_PERIOD_REOPENED`
- `INVENTORY_RECEIPT_VALUED`, `INVENTORY_ISSUE_VALUED`, `ASSET_CAPITALIZED`, `ASSET_DEPRECIATION_POSTED`
- `FINANCIAL_STATEMENT_GENERATED`, `FINANCIAL_STATEMENT_PUBLISHED`

Les adapters de workflow appellent toujours les services métier allow-listés. Aucun adapter n’exécute de JavaScript libre, SQL libre ou HTTP arbitraire.

## Continuité finale

Les chaînes ventes, achats, stock, RH/paie, projets, actifs, Health et Pharmacy utilisent les événements et mappings décrits dans `ERP_CROSS_MODULE_EVENT_CATALOG.md` et `ERP_CROSS_MODULE_FINANCIAL_MAPPING.md`.
