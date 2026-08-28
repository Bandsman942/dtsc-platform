# Hotfix #520 — Contrat transactionnel et toasts Retail

Date : 2026-08-28

## Symptôme observé

Une conversion Mobile Money entre deux wallets du même opérateur pouvait modifier correctement les soldes puis afficher un toast rouge indiquant que l’opération Shop avait échoué. Le problème venait du fait que le transfert métier/Trésorerie était déjà validé avant une seconde phase de comptabilisation Finance. Si cette seconde phase échouait, l’API renvoyait un statut d’erreur malgré le mouvement déjà durable.

Une incohérence inverse existait aussi sur les connecteurs opérateur : certaines réponses `HTTP 200` contenaient `ok:false`, alors que le client Retail considérait tout `response.ok` comme une réussite et pouvait afficher un toast vert.

## Contrat opposable

Toute mutation Retail utilise désormais trois outcomes :

- `SUCCESS` : opération finalisée, HTTP 2xx hors 202, `ok:true`, toast succès ;
- `PENDING` : opération ou phase secondaire encore à finaliser, HTTP 202, `ok:true`, toast warning, clé d’idempotence conservée ;
- `FAILURE` : opération principale non réalisée, HTTP non-2xx, `ok:false`, toast erreur.

Un body `ok:false` ne peut jamais être interprété comme un succès, même si un endpoint legacy utilisait par erreur un HTTP 2xx.

## Comptabilisation après commit métier

Le hotfix ne prétend pas qu’un transfert déjà durable a échoué lorsque seule la phase comptable reste incomplète. Les flux Mobile Money FX, Mobile Money manuel et Télécom manuel renvoient alors `PENDING` avec le code de message `RETAIL_ACCOUNTING_PENDING`.

Le client garde la clé d’idempotence et laisse le formulaire réessayable. Une nouvelle tentative retrouve l’objet déjà créé et retente la comptabilisation sans rejouer les mouvements de soldes.

La convergence future vers une atomicité métier + posting est suivie séparément dans #521.

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
- le toast warning pour `PENDING` ;
- la conservation de l’idempotence ;
- le contrat pending de la comptabilisation Mobile Money/Telco.

Ce gate est intégré à `scripts/run-regression-qa-ci.mjs`.

## Rollback

Revert applicatif uniquement. Aucune migration Prisma ni modification de données n’est introduite par #520.
