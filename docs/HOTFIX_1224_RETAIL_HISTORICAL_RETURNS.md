# Hotfix #1224 — RETAIL : reprise des retours historiques et filtre des factures POS

> **Candidat — DRAFT, E2E final propriétaire non validé.** Issue #1224.
> Branche : `fix/1224-retail-historical-returns-recovery-status-filter`.
> Pas de fusion ni de déploiement hors `main`, et uniquement après `E2E final BON`.

## Diagnostic métier confirmé

Une facture `ISSUED` reste juridiquement/fonctionnellement **émise** même si un retour `APPROVED` a été accepté. Une décision `APPROVED` ne comptabilise pas l'avoir et **ne libère pas** les réservations des articles jamais livrés. `CREDIT_NOTE` n'est atteint qu'après comptabilisation du crédit complet et rapprochement canonique de la créance.

Le registre de réservation `readActiveRetailInvoiceStockHoldsTx` ne déduit les quantités retournées qu'une fois `COMPLETED` ou `REFUND_PENDING`. Ne jamais restituer le stock sur une demande seulement `APPROVED` ou `FINANCE_PENDING`, sous peine de vente en double.

## Fonctionnalités livrées en candidat

1. **Registre des factures POS** : filtre de statut `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ISSUED`, `OVERDUE`, `PARTIALLY_PAID`, `PAID`, `CREDIT_NOTE`, `REJECTED`, `CANCELLED`, `VOIDED`. Filtre traité par PostgreSQL **avant** la pagination ; boutique, recherche intelligente et dates conservées. Sélection = retour à la première page. FR/EN, mobile.
2. **Deux états explicitement séparés sur chaque facture** : statut Finance (une facture en attente de comptabilisation reste `ISSUED`) ET retour actif (`SUBMITTED`, `INSPECTED`, `APPROVED`, `FINANCE_PENDING`, `REFUND_PENDING`), avec avoir déjà lié le cas échéant.
3. **Reprise des retours historiques** : panneau repliable Design 2.0 dans le registre, recherche RIR/INV/CN, filtre par état, pagination, périmètre de boutique contrôlé par le serveur et liens vers le dossier d'origine. L'interface classe chaque dossier selon le prochain contrôle et signale les cas où des pièces Finance existent déjà. **Lecture seule** : elle ne crée aucun avoir/paiement, ne contourne aucune approbation et ne réécrit pas les snapshots historiques.
4. **Reprise métier effective** : emprunte les actions canoniques existantes dans le POS — Inspecter → Approuver → Préparer avoir/remboursement → Approbations Finance indépendantes → Liquider → Finaliser le remboursement différé. Respecte la séparation des acteurs, le step-up, l'idempotence et la comptabilité. Les anciens dossiers ne sont **pas migrés silencieusement vers SIMPLIFIED**.
5. QA ciblée `pnpm qa:hotfix-1224` ajoutée à Quality Gates.

## Tous les cas métier à vérifier en E2E final

| Cas | Attendu |
| --- | --- |
| C01 Demande SUBMITTED | Inspection requise ; aucun mouvement stock/Finance |
| C02 Demande INSPECTED | Approbation désignée ; pas d'écriture anticipée |
| C03 Retour APPROVED non livré et non encaissé | Préparation Finance standard ; avoir une fois ; libération de promesse **après liquidation** |
| C04 Retour APPROVED non livré partiellement encaissé | Avoir imputé sur créance ; remboursement uniquement d'un véritable trop-perçu |
| C05 Retour APPROVED non livré, payé intégralement | Remboursement réel après validations ; pas de caisse fictive |
| C06 FINANCE_PENDING avec avoir APPROVED existant | Réutiliser la pièce ; interdiction de créer un duplicata ; liquidation par tiers |
| C07 FINANCE_PENDING avec paiement non approuvé | Compléter l'approbation du paiement avant liquidation |
| C08 Paiement cash | Caisse et compte réels, droits, séance ; écriture idempotente |
| C09 BANQUE / MOBILE_MONEY / CARD | Preuve de paiement externe, confirmation indépendante |
| C10 Plusieurs sources de règlement | Allocation/rapprochement exacts, sans mélange de boutiques/comptes |
| C11 Stock non livré | Réservation jusqu'à statut terminal ; pas de `RETURN_IN` fictif |
| C12 Stock livré avec lots | Inspection, quantité, traçabilité FEFO, mouvement `RETURN_IN` et valorisation |
| C13 Quarantaine/destruction | Non réintégration au stock vendable, traçabilité de détention |
| C14 Service non stocké | Aucun mouvement physique |
| C15 Remboursement LATER | Avoir comptabilisé, `REFUND_PENDING` jusqu'à confirmation réelle |
| C16 RETAIL STANDARD historique | Aucun privilège SIMPLIFIED rétroactif |
| C17 Période close/FX invalide/solde insuffisant | Échec contrôlé, zéro mutation partielle |
| C18 Concurrence/rejeu | Un avoir, un ensemble de paiements, un jeu de mouvements |
| C19 Multi-boutique / multi-tenant | Refus d'accès transversal, confidentialité |
| C20 Statuts facture/retour distincts | Facture `ISSUED` et retour `APPROVED` simultanément visibles |
| C21 Filtre statut + recherche + date + boutique | Appliqué côté serveur avant pagination |
| C22 Navigation ancienne facture/avoir | Lien exact vers le retour d'origine |

## Cas de terrain du client

- `INV-MWT6CFSV-ADE0B1` — 482 000 CDF, cinq lignes non livrées, `APPROVED`. La réservation ne peut pas être libérée avant `COMPLETED`.
- `CN-MWTBUA09-303820` — 96 000 CDF, avoir `APPROVED`, retour `RIR-MWTAUSPN-6CDC3A` en `FINANCE_PENDING`. Interdire le bouton générique « Comptabiliser » et revenir au dossier RETAIL pour achever les validations et liquider.

## Réserves de livraison

- Ce hotfix apporte **une file de reprise guidée**, et non une opération administrative magique qui comptabilise tous les dossiers historiques. Les validations des anciennes demandes demeurent opposables et doivent être effectuées par des intervenants réels distincts.
- Un cas réellement bloqué faute de validateur Finance ou d'autorisations doit faire l'objet d'une correction des affectations ou d'une procédure de gouvernance auditée, pas d'une mutation SQL forcée.
- L'issue ne peut être considérée comme `E2E final BON` avant la réussite des pipelines et la validation explicite du propriétaire ; les C01–C22 doivent être attestés avec des preuves distinctes.
