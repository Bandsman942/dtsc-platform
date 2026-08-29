# Hotfix #527 — Agence Mobile Money multi-caisses et formulaire DTSC

## Problème corrigé

L’Agence Mobile Money pouvait disposer de plusieurs sessions de caisse réellement ouvertes pour le même utilisateur, par exemple une caisse CDF et une caisse USD, alors que le dashboard Retail ne renvoyait au client que la caisse singulière historique `cashSession`. L’interface retombait donc sur une seule session et empêchait de basculer proprement la devise de travail.

Cette incohérence avait un effet en cascade : les opérateurs Mobile Money sont filtrés par la devise de la caisse active, puis le wallet opérateur est résolu par le couple opérateur + devise. Une caisse invisible pouvait donc rendre le sélecteur d’opérateur vide alors que la configuration correcte existait dans l’autre devise.

## Correctif

- le dashboard Retail conserve `cashSession` pour compatibilité mais expose également `cashSessions`, la collection canonique des sessions `OPEN`, `CLOSING` et `PENDING_VALIDATION` de l’utilisateur autorisé ;
- le gestionnaire de caisse affiche toutes les caisses `OPEN` dans un rail horizontal scrollable avec snap, cartes tactiles et état de sélection perceptible ;
- une combobox `Caisse ouverte à utiliser` est synchronisée avec les cartes et pilote la session active ;
- changer de caisse change immédiatement la devise utilisée par le formulaire d’opération ;
- le workspace Mobile Money continue de filtrer les opérateurs sur les wallets configurés dans la devise active ;
- le serveur reste l’autorité du wallet et re-résout canoniquement le compte Mobile Money à partir de `organizationId + provider + currency`, sans faire confiance à un identifiant de wallet fourni par le navigateur ;
- la validation serveur continue d’exiger une session de caisse réellement ouverte pour la caisse sélectionnée ;
- les erreurs métier déjà gérées par le formulaire conservent le double feedback DTSC : message inline et toast global au premier plan ; les erreurs backend passent par le contrat de mutation Retail commun.

## Sécurité et données

Aucune migration Prisma. Aucun changement d’entitlement ou de rôle. Les sessions sont déjà bornées au `organizationId` et au `cashierUserId` dans la construction du dashboard, et la mutation revalide la caisse ouverte côté serveur.

Le wallet opérateur n’est pas une seconde source de vérité côté UI : `resolveMobileMoneyFloatAccountTx()` reste l’autorité de résolution tenant/provider/devise.

## UX

Le rail suit la logique de navigation horizontale déjà utilisée dans les surfaces d’administration DTSC : `overflow-x-auto`, snap horizontal et éléments `shrink-0`. La largeur des cartes reste adaptée au mobile afin de rendre perceptible qu’un balayage horizontal est possible.

La combobox fournit en parallèle une sélection déterministe et accessible au clavier/tactile, particulièrement utile lorsqu’un agent dispose de plusieurs caisses ouvertes.

## QA

La gate permanente `scripts/qa-527-mobile-money-multi-cash-form.mjs` vérifie :

- exposition de `cashSessions` dans le dashboard ;
- rail horizontal scrollable et snap ;
- synchronisation de la combobox avec la session active ;
- filtrage des opérateurs selon la devise ;
- résolution du wallet de même devise ;
- revalidation serveur du wallet et de la session de caisse ;
- présence des feedbacks erreur inline + toast sur les erreurs métier du formulaire.

La gate est ajoutée à `scripts/run-regression-qa-ci.mjs`.

## Rollback

Revert applicatif de la PR. Aucun rollback de données n’est requis.
