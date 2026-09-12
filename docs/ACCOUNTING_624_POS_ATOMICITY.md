# Accounting C3 — Atomicité POS vente, retour, tenders, stock et posting

## Objet

L’itération #624 poursuit #622 et supprime la rupture transactionnelle restante entre les écritures métier Retail POS et le grand livre canonique.

Avant C3, les parcours suivants validaient d’abord une transaction Retail, puis appelaient l’orchestration comptable dans une transaction distincte :

- création d’une vente POS ;
- annulation complète d’une vente POS ;
- approbation d’un retour/remboursement.

Le preflight comptable réduisait le risque mais ne pouvait pas garantir le rollback si le posting ou la valorisation échouait après le COMMIT métier.

## Contrat C3

Pour les nouveaux traitements couverts :

```text
transaction SERIALIZABLE
→ verrou / idempotence tenant-scoped
→ vente ou décision de retour
→ mouvements stock immuables
→ effets tender / remboursement / trésorerie
→ posting métier via postBusinessEventTx(...)
→ valorisation stock via helpers ...Tx
→ statuts / événements
→ COMMIT unique
```

Une erreur de posting ou de valorisation avant le COMMIT rollback donc les créations/modifications métier couvertes dans la même transaction.

## Primitives transactionnelles

C3 expose des variantes recevant un `Prisma.TransactionClient` afin d’éviter toute transaction imbriquée :

- `valueInventoryIssueTx()` ;
- `finalizeRetailSaleAccountingTx()` ;
- `valueRetailInventoryReturnTx()` ;
- `finalizeRetailReturnAccountingTx()` ;
- `finalizeRetailSaleReversalAccountingTx()`.

Les wrappers publics historiques restent disponibles. Ils ouvrent leur propre transaction uniquement lorsqu’ils sont appelés hors d’un flux métier déjà transactionnel.

## Vente POS

`createRetailSale()` conserve dans une seule transaction :

- ticket + lignes + tenders ;
- mouvements `SALE_FULFILLMENT` ;
- effets sur comptes financiers / trésorerie / caisse ;
- événement de vente ;
- `RETAIL_POS_SALE_POSTED` ;
- valorisation des sorties et posting `INVENTORY_ISSUE_VALUED`.

Une clé `idempotencyKey` existante ne recrée ni ticket, ni tender, ni mouvement stock. Le même chemin transactionnel termine uniquement un accounting historique manquant, de façon idempotente.

## Annulation de vente

`reverseRetailSale()` conserve dans une seule transaction :

- mouvements `RETURN_IN` ;
- effets inverses sur tenders/comptes/trésorerie/caisse ;
- statut `REVERSED` et tenders `REVERSED` ;
- posting de la vente originale s’il manque historiquement ;
- `RETAIL_POS_SALE_REVERSED` ;
- valorisation des retours stock.

Une vente déjà `REVERSED` n’exécute plus les effets métier : elle ne fait qu’achever/réutiliser les écritures comptables canoniques.

## Retour / remboursement

`decideRetailReturn(... APPROVE)` conserve dans une seule transaction :

- restock des lignes `RESTOCK` ;
- remboursement sur tender d’origine ou compte explicite ;
- écritures Treasury/Cash et `EnterpriseRetailRefund` ;
- statut `COMPLETED` ;
- posting `RETAIL_POS_RETURN_POSTED` ;
- valorisation du stock retourné.

Un retour historique déjà `COMPLETED` ne rejoue pas les remboursements ni le stock. Il termine seulement son accounting idempotent.

## Wrappers de récupération

Les routes existantes appellent encore les wrappers comptables après le service métier. Après C3 ces appels ne sont plus l’autorité transactionnelle des nouveaux traitements : ils constituent une vérification/récupération idempotente compatible avec les anciens objets créés avant le cutover.

Une écriture `POSTED` n’est jamais modifiée ; `postBusinessEventTx()` réutilise la source/version/idempotence canonique.

## Offline

Le replay offline conserve exactement le chemin `executeCanonicalRetailSale()` avec la clé `offline:${operationUuid}`. Il bénéficie donc de l’atomicité C3 sans créer de deuxième implémentation POS.

## Sécurité et invariants

- `organizationId` obligatoire sur toutes les lectures/écritures ;
- RBAC/entitlements Retail inchangés ;
- mouvements de stock immuables ;
- PostgreSQL et le GL canonique restent les sources de vérité ;
- aucune somme multi-devise implicite ;
- aucun numéro SYSCOHADA codé en dur ;
- aucune transaction Prisma imbriquée ;
- aucune migration Prisma ;
- aucun nouveau secret ou `NEXT_PUBLIC_*`.

## QA

`scripts/qa-accounting-624-pos-atomicity.mjs`, importé par `qa:enterprise-accounting` puis `qa:regression`, vérifie durablement :

- présence des primitives `…Tx` ;
- absence de `$transaction` imbriqué dans ces primitives ;
- vente + posting/valorisation dans la même transaction ;
- reversal + posting/valorisation dans la même transaction ;
- retour/remboursement + posting/valorisation dans la même transaction ;
- récupération historique sans replay métier ;
- maintien du chemin offline canonique.

Les workflows Accounting production-like et Shop behavioral restent les preuves exécutées applicables aux parcours réels.

## OWNER_E2E

Valider au minimum :

1. vente POS stockée avec tender et valorisation comptable ;
2. retry du même ticket/idempotency key sans doublon ;
3. annulation complète avec restitution stock et reversal financier/comptable ;
4. retour partiel approuvé avec remboursement et restock ;
5. retry d’un retour/annulation déjà finalisé sans second mouvement ni second remboursement ;
6. replay offline CASH si disponible.

`OWNER_E2E` reste `NOT_EXECUTED` jusqu’à confirmation explicite du propriétaire sur le head final de la PR.

## Rollback

Revert applicatif vers le chemin pré-C3. Ne jamais supprimer, réécrire ni rejouer les écritures `POSTED`, mouvements stock, tenders, remboursements ou transactions Treasury historiques déjà validés.
