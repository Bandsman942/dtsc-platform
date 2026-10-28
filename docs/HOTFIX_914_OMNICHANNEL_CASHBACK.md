# Hotfix #914 — Cashback relationnel omnicanal

**Statut : développement partiel, non publié.** Liens : parent #886 / #785 ; après DELIVERY #912. La branche démarre du SHA `1b3a964831c3b711adf96ee8eaae426b5dbe60dd` de `main`.

## Sources canoniques et dépendances

| Preuve / opération | Source unique |
| --- | --- |
| Commande et lignes | `EnterpriseSalesOrder`, `EnterpriseSalesOrderItem` |
| Canal et site | `EnterpriseRetailOrderOrchestration` |
| Livraison | `EnterpriseFulfillment` et preuve client/document versionné |
| Facture | `EnterpriseSalesInvoice` liée explicitement à la commande, même client/devise/montant |
| Paiement reçu | `EnterprisePaymentAllocation` `CONFIRMED` vers la créance de facture, paiement `INBOUND/CUSTOMER_PAYMENT` `CONFIRMED|RECONCILED`, compte financier réel |
| Avoir | `EnterpriseRetailStoredValueAccount/Entry` et `changeRelationalStoreCreditTx` |
| Bénéficiaire, attribution et quota | `EnterpriseIdentityLink`, `EnterprisePersonBusinessReference`, `EnterpriseRelationshipBenefit[Assignment/Usage]` |

## Phase intégrée dans cette branche : éligibilité au paiement

`resolvePaidDeliveredOmnichannelOrderTx` enregistre **zéro écriture financière**. Il retourne `null` si livraison/facture/paiement du client ne sont pas vérifiables, si plusieurs factures pourraient répondre à la commande, s'il y a un retour non rejeté ou si les paiements réellement affectés ne couvrent pas le montant total. L'autorité Finance reste les allocations confirmées, pas un montant affiché dans le navigateur.

Cette première phase est volontairement conservatrice : aucune acquisition d'avoir avant le justificatif client ou un document versionné lié à la commande. Un paiement partiel, même avec facture marquée `PAID`, ne suffit pas.

## Étapes restant **à développer et à prouver avant toute fusion**

1. Au devis/confirmation de commande : calculer et réserver les décisions de cashback sur les lignes tarifées réelles, relation active, limites et devise ; conserver une seule source d'autorité pour les quotas.
2. Aux événements canoniques `EnterpriseFulfillment` complet et `EnterprisePaymentAllocation` confirmé : appeler le même orchestrateur idempotent **dans la transaction appropriée**, en recontrôlant les preuves et les droits, puis écrire exactement une entrée `EARN` dans l'avoir magasin canonique.
3. Retours `EnterpriseRetailOmnichannelReturn` et remboursement Finance réellement confirmé : `REVERSAL` proportionnelle aux lignes éligibles, sans double reprise ni suppression historique des écritures.
4. Verrous, version de calcul et idempotency key à l'ordre et avantage ; compensation d'annulation et réconciliation contrôlée des crédits.
5. Tests PostgreSQL et Playwright : livraison puis paiement, paiement puis livraison, paiement partiel, facture doublon, mauvais client/devise, absence de preuve, retour partiel/intégral, concurrence et replays.
6. Owner E2E FR/EN et responsive 320–1024 px, Quality/Migration/Shop2 verts, revue, merge squash main puis Production Vercel READY.

**Risque P0** : un paiement non reçu ou un simple panier pourrait produire une dette d'avoir. En l'absence de données vérifiées, ne jamais émettre de cashback. Pas de mode Preview Vercel. Aucun impact Prisma/migration/backfill, secret ou feature switch en phase de preuve. Rollback : retrait du code non appelé; si la phase d'émission est intégrée ultérieurement, les écritures seront compensées, jamais supprimées.

## Matrice de preuves actuelle

| Contrôle | État |
| --- | --- |
| Inspection des services canon Finance et Sales | LOCAL_EXECUTED (lecture GitHub) |
| Vérification structurelle dédiée | NOT_EXECUTED (automatisée en CI PR) |
| Type-check / lint / build / regression | NOT_EXECUTED |
| Tests comportementaux Finance & paiement | NOT_EXECUTED |
| OWNER_E2E et Production | NOT_EXECUTED |
