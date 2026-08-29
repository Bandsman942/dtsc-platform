# Hotfix #527 — Agence Mobile Money multi-caisses et formulaire DTSC

Suivi livraison : Issue #527 · PR #528.

## Problème corrigé

L’Agence Mobile Money pouvait disposer de plusieurs sessions de caisse réellement ouvertes pour le même utilisateur, par exemple une caisse CDF et une caisse USD, alors que le dashboard Retail ne renvoyait au client que la caisse singulière historique `cashSession`. L’interface retombait donc sur une seule session et empêchait de basculer proprement la devise de travail.

Cette incohérence avait un effet en cascade : les opérateurs Mobile Money sont filtrés par la devise de la caisse active, puis le wallet opérateur est résolu par le couple opérateur + devise. Une caisse invisible pouvait donc rendre le sélecteur d’opérateur vide alors que la configuration correcte existait dans l’autre devise.

Le formulaire d’opération utilisait aussi des contraintes HTML natives sur plusieurs champs. Une validation bloquée avant le handler React pouvait donc ne pas emprunter le contrat DTSC de feedback métier, et le CTA était désactivé sur certaines préconditions, ce qui rendait l’action silencieuse au lieu d’expliquer clairement le blocage.

## Correctif

- le dashboard Retail conserve `cashSession` pour compatibilité mais expose également `cashSessions`, la collection canonique des sessions `OPEN`, `CLOSING` et `PENDING_VALIDATION` de l’utilisateur autorisé ;
- le gestionnaire de caisse affiche toutes les caisses `OPEN` dans un rail horizontal scrollable avec snap, cartes tactiles et état de sélection perceptible ;
- une combobox `Caisse ouverte à utiliser` est synchronisée avec les cartes et pilote la session active ;
- changer de caisse change immédiatement la devise utilisée par le formulaire d’opération et réinitialise l’opérateur devenu incompatible ;
- les opérateurs sont filtrés sur les wallets configurés dans la devise active ;
- dès qu’un opérateur est choisi, le wallet correspondant à la même devise est affiché automatiquement en lecture seule dans le formulaire avec une aide contextuelle ;
- le formulaire d’opération utilise `noValidate` et centralise ses préconditions métier dans le handler : caisse, wallet, opérateur, téléphone, montant, frais et commission produisent une erreur métier inline et un toast global ;
- le CTA `Vérifier l’opération` n’est plus rendu silencieusement inactif pour une caisse ou un mapping absent : tant que la configuration n’est pas en chargement et qu’aucune mutation n’est en cours, l’action reste déclenchable et explique précisément le blocage ;
- la référence opérateur reste optionnelle comme le prévoit déjà le schéma serveur ;
- le serveur reste l’autorité du wallet et re-résout canoniquement le compte Mobile Money à partir de `organizationId + provider + currency`, sans faire confiance à un identifiant de wallet fourni par le navigateur ;
- la validation serveur continue d’exiger une session de caisse réellement ouverte pour la caisse sélectionnée ;
- les erreurs backend passent toujours par le contrat de mutation Retail commun, qui conserve le formulaire et affiche un toast global d’erreur.

## Sécurité et données

Aucune migration Prisma. Aucun changement d’entitlement ou de rôle. Les sessions sont déjà bornées au `organizationId` et au `cashierUserId` dans la construction du dashboard, et la mutation revalide la caisse ouverte côté serveur.

Le wallet opérateur n’est pas une seconde source de vérité côté UI : `resolveMobileMoneyFloatAccountTx()` reste l’autorité de résolution tenant/provider/devise. Le wallet affiché côté client sert uniquement à rendre visible le résultat de la configuration canonique.

## UX

Le rail suit la logique de navigation horizontale déjà utilisée dans les surfaces d’administration DTSC : `overflow-x-auto`, snap horizontal et éléments `shrink-0`. La largeur des cartes reste adaptée au mobile afin de rendre perceptible qu’un balayage horizontal est possible.

La combobox fournit en parallèle une sélection déterministe et accessible au clavier/tactile, particulièrement utile lorsqu’un agent dispose de plusieurs caisses ouvertes. La carte et la combobox utilisent la même source de sélection et restent synchronisées.

Dans le formulaire, l’ordre visuel devient plus explicite : opérateur → wallet automatique → opération → données client/montants. L’utilisateur voit donc avant validation quel portefeuille de même devise sera réellement utilisé.

## QA

La gate permanente `scripts/qa-527-mobile-money-multi-cash-form.mjs` vérifie :

- exposition de `cashSessions` dans le dashboard ;
- rail horizontal scrollable et snap ;
- synchronisation de la combobox avec la session active ;
- filtrage des opérateurs selon la devise ;
- sélection et affichage automatique du wallet de même devise ;
- usage de la validation métier explicite au lieu d’une validation navigateur silencieuse ;
- CTA `Vérifier l’opération` non silencieux ;
- revalidation serveur du wallet et de la session de caisse ;
- présence des feedbacks erreur inline + toast sur les erreurs métier du formulaire.

La gate est ajoutée à `scripts/run-regression-qa-ci.mjs`.

## Rollback

Revert applicatif de la PR. Aucun rollback de données n’est requis.
