# Accounting #602 — Atomicité Retail métier → trésorerie → posting

## Contexte

Cette itération est le premier sous-lot de **#599 Accounting C** et reprend la dette explicite **#521**.

Avant #602, les créations manuelles Mobile Money, Mobile Money FX et Telco SUCCESS suivaient un modèle en deux transactions :

```text
transaction A
  objet métier
  + soldes opérationnels
  + mouvements de trésorerie
  + événement Finance
COMMIT

transaction B
  provisioning comptable si nécessaire
  + posting canonique
COMMIT ou échec
```

Si la transaction B échouait, la transaction A restait confirmée et les routes renvoyaient un état `PENDING`. Ce contrat était récupérable et idempotent, mais pas atomique.

## Cible #602

Pour les **nouvelles créations manuelles** couvertes par cette itération :

```text
UNE transaction Serializable
  objet métier
  + effets comptes / trésorerie
  + événements métier
  + provisioning ledger requis
  + postBusinessEventTx(...)
  + écriture POSTED
COMMIT

si une étape obligatoire échoue
  ROLLBACK de toute la tentative
```

Les écritures `POSTED` existantes restent immuables. Aucun historique comptable n'est réécrit.

## Primitive comptable canonique

`lib/enterprise/accounting/posting-service.ts` expose désormais :

- `postBusinessEventTx(tx, organizationId, actorUserId, input)` : logique canonique de posting dans une transaction déjà ouverte ;
- `postBusinessEvent(...)` : wrapper historique qui ouvre sa propre transaction et délègue à `postBusinessEventTx`.

La primitive Tx conserve les invariants existants :

- advisory lock transactionnel ;
- clé d'idempotence stable + version de posting ;
- `EnterprisePostingBatch` ;
- registre canonique `getPostingBuilderV2` ;
- readiness Finance ciblée ;
- période et journal autorisés ;
- conversion en devise fonctionnelle et snapshots FX ;
- équilibre débit/crédit ;
- écriture `POSTED` ;
- événement Finance de posting.

`postBusinessEventTx` n'ouvre jamais de `$transaction` Prisma : cela évite toute transaction imbriquée.

## Provisioning Mobile Money transaction-aware

`mobile-money-ledger-provisioning.ts` expose aussi des primitives Tx :

- `ensureMobileMoneyTransactionLedgerMappingTx(...)` ;
- `ensureMobileMoneyFxLedgerMappingsTx(...)`.

Les wrappers historiques restent présents pour les appelants non migrés.

## Flux migrés

### Mobile Money manuel

`createMobileMoneyTransactionWithPosting(...)` exécute dans une seule transaction :

1. revalidation organisation / opérateur / comptes / caisse ;
2. création `EnterpriseMobileMoneyTransaction` ;
3. impacts CASH et FLOAT ;
4. transactions de trésorerie / mouvement de caisse ;
5. événement Finance métier ;
6. mapping ledger Mobile Money ;
7. `RETAIL_MOBILE_MONEY_POSTED`.

La route manuelle ne renvoie plus `RETAIL_ACCOUNTING_PENDING` après avoir confirmé le métier.

### Mobile Money FX

`createMobileMoneyFxTransferWithPosting(...)` exécute dans une seule transaction :

1. résolution du couple de devises et du taux ;
2. locks des comptes concernés ;
3. création du transfert ;
4. débit source / crédit cible ;
5. deux mouvements de trésorerie ;
6. snapshot FX ;
7. événement Finance métier ;
8. provisioning des deux wallets ;
9. `RETAIL_MOBILE_MONEY_FX_POSTED`.

Un échec comptable annule donc aussi les deux impacts de soldes et les deux mouvements de trésorerie de cette tentative.

### Recharge Telco manuelle SUCCESS

`createTelcoTopupWithPosting(...)` exécute dans une seule transaction :

1. revalidation opérateur, catalogue et comptes ;
2. création de la recharge ;
3. encaissement tender ;
4. consommation du float opérateur ;
5. événement Finance métier ;
6. `RETAIL_TELCO_TOPUP_POSTED`.

Une recharge manuelle non `SUCCESS` reste un enregistrement métier sans posting, comme avant.

## Idempotence et objets PENDING historiques

Les helpers Tx recherchent d'abord l'objet existant via sa clé d'idempotence **avant de rejouer les effets de comptes**.

Conséquence : un objet créé avant #602 avec métier/trésorerie déjà confirmés mais posting manquant peut être repris par le wrapper atomique :

- l'objet existant est réutilisé ;
- aucun mouvement de compte/trésorerie n'est recréé ;
- le provisioning et le posting sont réessayés de manière idempotente ;
- un `EnterprisePostingBatch` déjà `COMPLETED` retourne l'écriture existante.

Le cutover ne supprime donc pas le mécanisme de reprise des données historiques.

## Parcours provider CONNECTED hors scope

Les opérations CONNECTED Mobile Money/Telco restent volontairement sur l'orchestration existante dans ce sous-lot.

Raison : un provider externe peut déjà avoir accepté une opération avant un échec local. Une transaction PostgreSQL ne peut pas rollback un effet externe. Le contrat correct nécessite une stratégie provider spécifique : état durable, idempotence provider, retry/compensation et réconciliation.

Ce travail reste suivi par **#599 / #521** ; #602 ne prétend pas le rendre atomique artificiellement.

## Inventaire des autres appels deux-phases

Le diagnostic du `main` montre encore des appels `postBusinessEvent(...)` après ou autour d'autres commits métier, notamment :

- POS Retail et certaines clôtures/écarts ;
- Payroll / dépenses ;
- paiements communs ;
- immobilisations ;
- inventory accounting ;
- opening balances ;
- receivables/payables et notes de crédit ;
- certains traitements de trésorerie.

Ils ne sont pas migrés silencieusement dans #602. Leur classification atomique / non atomique et leur cutover restent dans **#599 / #521**.

## Sécurité et multi-tenant

Aucun changement de RBAC, entitlement ou abonnement.

Les règles existantes restent obligatoires :

- `organizationId` sur toutes les lectures/écritures ;
- références revalidées côté serveur ;
- session, membership, module et permission via les routes existantes ;
- same-origin et rate limit conservés ;
- aucune donnée d'un autre tenant ;
- aucun secret ou jargon Prisma exposé au client.

## Base de données

Aucune migration Prisma pour #602.

## QA

`scripts/qa-602-atomic-retail-posting.mjs` est intégré à `qa:regression` et protège :

- présence et délégation de `postBusinessEventTx` ;
- absence de `$transaction` imbriquée dans cette primitive ;
- primitives Tx de provisioning wallets ;
- wrappers atomiques des trois flux ;
- routes manuelles sans second `finalize*Accounting` ;
- disparition du PENDING comptable pour les nouvelles créations manuelles ;
- maintien explicite des parcours provider historiques hors scope.

## Rollback

Rollback applicatif : rerouter les créations manuelles vers les wrappers historiques et leurs finalizeurs séparés.

Ne jamais supprimer ou réécrire :

- objets métier déjà persistés ;
- transactions de trésorerie historiques ;
- `EnterprisePostingBatch` ;
- écritures `POSTED`.

Aucune down migration n'est nécessaire.
