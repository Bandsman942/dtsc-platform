# #1187 — Avoirs, paiements partiels et retours RETAIL (candidat v1.19.0)

**État :** code sur branche `fix/1187-retail-partial-credit-refund-engine`, non déployé et E2E propriétaire non validé.

## Logique comptable canonique

Une facture **émise/comptabilisée** n'est ni effacée ni simplement annulée en changeant son statut. Les avoirs proviennent de lignes de facture historisées, avec quantité, base hors taxe, TVA et arrondis du document d'origine. Les validations, écritures, allocations, paiements et stocks appartiennent toujours au moteur commun Finance / Inventory.

Un retour portant sur un montant `C` pour une facture dont la créance restant due avant retour est `O` produit :

- **Avoir comptable** : `C` (montant de lignes annulées, sans recréer de chiffre d'affaires ni TVA).
- **Remboursement effectif** : `max(0, C - O)`, plafonné par les allocations clients confirmées et traçables dans les comptes de la **même boutique**.
- **Compensation de créance** : `min(C, O)`. L'avoir n'est pas un paiement : les deux circuits doivent rester disjoints.
- Lors de la liquidation, le montant de l'allocation de paiement nécessaire au remboursement est annulé avant de comptabiliser l'avoir ; l'invariant `payé + crédité + restant dû = total de facture` doit rester vrai. L'opération est intégralement transactionnelle et réversible seulement par un nouveau document comptable.

Exemple : facture de **100 CDF**, **40 CDF encaissés**, **60 CDF restant dus**, annulation totale = **avoir 100 CDF**, **remboursement 40 CDF** et **créance finale 0 CDF**. Annulation de **25 CDF** sur la même facture = **avoir 25 CDF**, **remboursement 0 CDF**, créance finale **35 CDF**.

## Prestations, marchandises non livrées, ventes mixtes

- Une prestation est marquée `SERVICE_CREDIT` et ne crée aucun mouvement de stock.
- Une marchandise **pas encore sortie du dépôt** est marquée `UNDELIVERED_CREDIT` : la quantité créditée libère la promesse de stock. Ne jamais simuler une entrée physique.
- Une marchandise **déjà livrée** passe par inspection indépendante, puis `RESTOCK`, `QUARANTINE` ou `DISPOSE` ; seule `RESTOCK` a le droit de produire un mouvement `RETURN_IN` avec valorisation sur le mouvement de sortie originel.
- Pour une facture mixte, l'avoir peut concerner une ou plusieurs lignes de chaque type. Une éventuelle réception ultérieure de marchandise non créditée reste exécutée uniquement sur la quantité restante, dans le journal stock habituel.
- Le serveur refuse tout double retour de quantité déjà engagée ou intégralement créditée, et les écarts entre montant d'origine et document crédité.

## Autorisations et sécurité

L'auteur de la demande, le vérificateur indépendant, le décideur et les acteurs Finance (préparateur, approbateur, liquidateur) sont distincts selon les règles de séparation des fonctions en vigueur. Une auto-approbation métier expressément déléguée par le propriétaire **n'autorise ni l'auto-inspection ni l'auto-liquidation financière**. La vérification des services peut être réalisée par un responsable Finance habilité de la même boutique ; les biens livrés exigent un inspecteur ayant la capacité de stock.

Le nouvel approbateur financier `financeApproverUserId` est contrôlé dans les deux modules Finance (créances/paiements) et sur la boutique ; les approbations sont des objets Finance canoniques. Les comptes sortants sont liés aux allocations entrantes confirmées sur le site ; pas de compte arbitraire ni de paiement sortant lorsque le montant remboursé est zéro.

Toutes les vérifications de révision et de fonds sont rejouées lors de la liquidation dans une transaction PostgreSQL Serializable. Aucune interface ne peut modifier directement le grand livre.

## Schéma et compatibilité

- **Migration additive :** `20261115194500_retail_partial_credit_refund_split`.
- `EnterpriseRetailInvoiceReturnRequest.refundAmount` conserve son sens historique : valeur totale de l'avoir.
- `refundPayoutAmount Decimal?` correspond au seul remboursement en trésorerie. `null` sur l'historique ne signifie pas zéro.
- `financeApproverUserId String?` ajoute le contrôle d'approbateur indépendant. Les demandes anciennes avec approbateur financier implicite conservent le chemin canonique d'origine lorsque les règles de séparation sont respectées.
- Aucun changement sur les tables de factures, mouvements de stock, comptes financiers, comptabilité ou allocations.

## Contrôles et E2E obligatoires

- `pnpm qa:hotfix-1187-returns` : **réels appels** à `assertRetailInvoiceReturnSettlementReadinessTx` avec Prisma Decimal et mocks transactionnels, et contrats sources complémentaires. Ce test n'est **pas** un E2E DB.
- `scripts/qa-hotfix-1042-retail-invoice-return-finance.mjs` : maintien des scénarios intégralement payés, remboursements multi-comptes, refus de fonds insuffisants et annulation atomique du stock en cas d'échec.
- TypeScript, ESLint, build, migration, QA d'ensemble.
- **À certifier en PostgreSQL réel** : annulation totale de 100 avec paiement 40 ; avoir partiel 25 sur 100 payé 40 ; service seul payé/non payé ; article non livré ; vente mixte partiellement encaissée ; stock livré + lot ; paiements en deux comptes ; financement du mauvais site ; taux FX USD/CDF historique, TVA et arrondis ; 2 liquidateurs concurrents ; déclassement d'un approbateur ; période comptable clôturée ; version obsolète ; test navigateur mobile (320/360/390) et desktop FR/EN.
- Un défaut de QA ou la moindre incohérence de comptabilité est un **bloqueur de fusion**. `E2E final BON` par le propriétaire reste obligatoire avant `main`.

## Livraison et dépendances

La PR #1190 couvre séparément le lot antérieur de #1187 (FX, permissions propriétaire et achats). **Fusionner #1190 seulement après son E2E validé**, puis actualiser cette branche depuis `main` pour résoudre le versionnement et les fichiers de documentation communs, sans jamais forcer un déploiement de branche.

Cette implémentation ne change pas les paramètres de déploiement Vercel. **Aucune variable d'environnement supplémentaire**.

## Rollback

Avant fusion, fermer la PR sans déploiement. Après une éventuelle mise en production validée, rétablir le code par nouvelle PR en conservant les colonnes additives et les écritures déjà comptabilisées (pas de suppression ni de décrément manuel).
