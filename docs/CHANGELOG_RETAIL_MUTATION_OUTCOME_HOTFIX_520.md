# Hotfix #520 — Contrat transactionnel et toasts Retail

Date : 2026-08-28

## Symptôme observé

Une conversion Mobile Money entre deux wallets du même opérateur pouvait modifier correctement les soldes puis afficher un toast rouge indiquant que l’opération Shop avait échoué. Le problème venait du fait que le transfert métier/Trésorerie était déjà validé avant une seconde phase de comptabilisation Finance. Si cette seconde phase échouait, l’API renvoyait un statut d’erreur malgré le mouvement déjà durable.

Une incohérence inverse existait aussi sur les connecteurs opérateur : certaines réponses `HTTP 200` contenaient `ok:false`, alors que le client Retail considérait tout `response.ok` comme une réussite et pouvait afficher un toast vert.

## Contrat opposable

Toute mutation Retail utilise trois outcomes :

- `SUCCESS` : opération finalisée, HTTP 2xx hors 202, `ok:true`, toast succès ;
- `PENDING` : opération ou phase réellement asynchrone encore à finaliser, HTTP 202, `ok:true`, toast warning, clé d’idempotence conservée ;
- `FAILURE` : opération principale non réalisée, HTTP non-2xx, `ok:false`, toast erreur.

Un body `ok:false` ne peut jamais être interprété comme un succès, même si un endpoint legacy utilisait par erreur un HTTP 2xx.

## Comptabilisation et évolution #602

Le contrat initial de #520 permettait à Mobile Money FX, Mobile Money manuel et Télécom manuel de renvoyer `PENDING` avec un code `RETAIL_ACCOUNTING_PENDING` lorsque le métier/Trésorerie avait déjà été durablement validé mais que la comptabilisation échouait ensuite.

Depuis #602, ce comportement n’est plus autorisé pour ces trois flux manuels : métier, Trésorerie et posting comptable sont exécutés dans une transaction atomique commune. Si le posting échoue, la tentative locale entière est rollbackée ; la route ne doit donc plus exposer un `ACCOUNTING_PENDING` post-commit pour ces créations manuelles.

Les codes et messages `RETAIL_ACCOUNTING_PENDING*` restent disponibles pour les parcours historiques/retry et autres flux qui conservent volontairement une phase comptable séparée. Les opérations CONNECTED conservent également `PENDING` lorsqu’un provider externe est réellement en attente, car un effet externe ne peut pas être rollbacké par la transaction PostgreSQL locale.

## Connecteurs opérateur

Pour Mobile Money et Télécom connectés :

- provider `FAILED` => HTTP 422 + `FAILURE` ;
- provider en attente => HTTP 202 + `PENDING` ;
- provider finalisé => `SUCCESS`.

Le client partagé n’utilise donc plus le seul statut `response.ok` pour décider de la couleur et du sens du toast.

## i18n

Les messages spécifiques `PENDING`/provider sont centralisés dans `lib/enterprise/retail/mutation-outcome.ts` en FR/EN. Aucun second système de toast n’a été créé : `notifyToast()` et le `ToastProvider` global restent la source d’affichage.

## QA

Le gate permanent `scripts/qa-520-retail-mutation-outcome-contract.mjs` vérifie notamment :

- la présence des trois outcomes ;
- l’interdiction du legacy `HTTP 200 + ok:false` pour provider FAILED ;
- l’interprétation client de `ok:false`, `FAILURE`, `PENDING` et HTTP 202 ;
- le toast warning pour les opérations réellement `PENDING` ;
- la conservation de l’idempotence côté client ;
- le maintien de `PENDING` pour les providers externes asynchrones ;
- l’interdiction de `RETAIL_ACCOUNTING_PENDING` sur les routes manuelles Mobile Money/Telco et du statut comptable `PENDING` sur le transfert FX désormais atomique ;
- l’utilisation des wrappers atomiques introduits par #602.

Ce gate est intégré à `scripts/run-regression-qa-ci.mjs`.

## Rollback

#520 n’introduisait aucune migration Prisma. #602 reste également un changement applicatif sans migration : un rollback se fait par revert des wrappers transactionnels/routes/QA/documentation, avec conservation des finalizers historiques utilisés par les parcours explicitement hors cutover.
