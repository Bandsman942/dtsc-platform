# Hotfix #592 — Onboarding fournisseur sur le tiers canonique

## Statut

Implémentation sur `fix/592-unify-supplier-party-form`, issue #592. Baseline : `main@32e42bb1caea3aa25c53f0a3f4223b6ebe48a692`.

## Problème

Après #591, les écritures fournisseur convergeaient déjà vers `EnterpriseBusinessParty`, mais l’interface conservait deux formulaires d’identité : un dans **Tiers, prospects et clients** et un autre dans **Fournisseurs et achats**. L’utilisateur pouvait donc ressaisir le nom, le type, les coordonnées et les identifiants d’une même contrepartie dans deux modules différents.

## Cible

- `EnterpriseBusinessParty` reste l’unique identité partagée : personne/organisation, nom, fiscalité, coordonnées, adresses et rôles.
- `EnterpriseSupplier` reste l’extension/snapshot opérationnel Procurement nécessaire aux achats historiques et aux relations `supplierId` existantes.
- `EnterpriseSupplierPartyLink` matérialise la relation 1:1 entre l’extension Procurement et le tiers canonique.
- le rôle `SUPPLIER` appartient au tiers canonique et possède son propre statut, sans contaminer le statut global du tiers.

## UX

Le bouton **Nouveau fournisseur** ouvre désormais un onboarding avec deux parcours :

1. **Utiliser un tiers existant** : recherche tenant-scoped par nom, code, e-mail ou identifiants, puis création de l’extension fournisseur ;
2. **Créer un nouveau tiers** : utilisation des mêmes champs d’identité canoniques que `Tiers et clients`, puis ajout des seuls paramètres Procurement.

Le composant `BusinessPartyIdentityFields` est partagé par les deux modules pour le type, le nom, la fiscalité, les coordonnées et l’adresse principale. Le formulaire Procurement ne possède plus son propre jeu parallèle de champs d’identité.

Les informations Procurement visibles restent séparées de l’identité commune : catégorie fournisseur, statut fournisseur et site web.

## Backend et transaction

`POST /api/enterprise/[organizationId]/suppliers/onboarding` est autorisé par `SUPPLIERS_PURCHASES` en écriture et exécute une transaction unique.

### Tiers existant

- revalidation de `businessPartyId` dans le même `organizationId` ;
- tiers obligatoire actif et non archivé ;
- refus si une relation fournisseur active ou historique existe déjà ;
- création du snapshot `EnterpriseSupplier` depuis les champs canoniques ;
- création/réactivation logique du rôle `SUPPLIER` ;
- création du lien 1:1 ;
- événement opérationnel et audit.

### Nouveau tiers

- validation par le contrat `businessPartyCreateSchema` partagé ;
- refus d’un tiers correspondant déjà existant afin d’éviter une duplication silencieuse ;
- création du `EnterpriseBusinessParty` avec rôle `SUPPLIER` ;
- création du snapshot Procurement depuis le tiers ;
- création du lien 1:1 ;
- l’ensemble est atomique : un échec annule la transaction.

## Sélecteur de tiers

`GET /api/enterprise/[organizationId]/suppliers/party-options` :

- exige `SUPPLIERS_PURCHASES` en écriture ;
- ne dépend pas de `CRM_CUSTOMERS` ;
- ne renvoie que les données minimales nécessaires à la sélection ;
- filtre par `organizationId`, `status=ACTIVE` et `archivedAt=null` ;
- signale les tiers déjà liés à un fournisseur afin que l’UI ne les propose pas comme nouvelle extension ;
- le backend revalide toujours la référence au moment de la mutation.

## Abonnement, RBAC et multi-tenant

Aucun package, prix, plan minimum ou entitlement n’est modifié.

- `CRM_CUSTOMERS` reste la frontière du module **Tiers et clients** ;
- `SUPPLIERS_PURCHASES` reste la frontière du module **Fournisseurs et achats** ;
- un utilisateur Procurement-only peut sélectionner/créer l’identité canonique nécessaire à son action sans obtenir la navigation ou les APIs CRM ;
- aucune UI ne sert de barrière de sécurité ;
- toutes les références restent revalidées côté serveur dans le tenant courant.

## IA DTSC Platform

Aucun nouvel outil IA et aucun élargissement de droit.

- `ERP_CUSTOMERS_READ` reste lié à `CRM_CUSTOMERS` ;
- `ERP_PROCUREMENT_READ` reste lié à `SUPPLIERS_PURCHASES` ;
- les exécuteurs conservent leur réautorisation par module ;
- l’IA Procurement lit la projection fournisseur autorisée, désormais dérivée de la même identité canonique ;
- aucun accès Prisma dynamique, wildcard de modèle ou bypass du Tool Gateway n’est ajouté.

## Compatibilité

Aucune migration Prisma n’est nécessaire. `EnterpriseSupplier` et les relations achats existantes ne sont pas supprimés. L’ancien endpoint `/suppliers` demeure compatible avec les intégrations historiques et converge déjà vers le tiers canonique grâce à #591, mais le formulaire utilisateur principal n’utilise plus ce parcours supplier-first.

## QA permanente

`scripts/qa-592-supplier-party-onboarding-checks.mjs`, branché à `qa:regression`, verrouille notamment :

- usage du même composant d’identité par Tiers et Procurement ;
- présence des deux parcours existant/nouveau ;
- disparition du POST supplier-first dans le formulaire visible ;
- transaction `BusinessParty + Supplier + rôle + lien` ;
- refus des doublons et liens historiques ;
- filtrage tenant et statut actif ;
- RBAC `SUPPLIERS_PURCHASES` sans dépendance `CRM_CUSTOMERS` ;
- limites IA inchangées ;
- FR/EN ;
- erreur locale + toast global et conservation du formulaire.

## OWNER_E2E attendu

- tiers existant sans rôle fournisseur → création fournisseur sans ressaisie d’identité ;
- tiers créé dans `Tiers et clients` avec rôle `SUPPLIER` → sélection et matérialisation Procurement ;
- nouveau tiers depuis Procurement → visible ensuite comme même identité canonique ;
- tiers déjà lié → refus humain sans doublon ;
- tiers hors tenant / archivé / inactif → refus ;
- utilisateur `SUPPLIERS_PURCHASES` sans `CRM_CUSTOMERS` → onboarding autorisé, module CRM toujours inaccessible ;
- erreur de mutation → dialog ouvert, valeurs conservées, erreur locale et toast global ;
- FR/EN, mobile/desktop, clair/sombre, clavier/focus ;
- lectures IA autorisées/refusées selon les modules.

## Rollback

Revert applicatif des commits #592. Ne supprimer aucun `EnterpriseBusinessParty`, `EnterpriseSupplier` ou `EnterpriseSupplierPartyLink` déjà créé par l’onboarding. Aucune migration de schéma n’est à inverser.

## Dette de contribution

- Dette créée : Aucune visée.
- Dette maintenue : `EnterpriseSupplier` reste physiquement présent comme extension/snapshot de compatibilité, car les achats historiques référencent encore `supplierId`.
- Dette remboursée : double formulaire d’identité fournisseur, sélection par ressaisie, absence de parcours canonique Procurement-only, divergence possible des champs communs dans l’UX.
- Dette reportée : Aucune sans Issue dédiée.

## Matrice de preuves

| Contrôle | Statut | Preuve |
|---|---|---|
| diff check | NOT_EXECUTED | CI attendue sur le head final |
| Prisma generate | NOT_EXECUTED | CI attendue |
| migrations clean DB | NOT_EXECUTED | CI attendue ; aucune nouvelle migration |
| type-check | NOT_EXECUTED | CI attendue |
| QA #592 | NOT_EXECUTED | `scripts/qa-592-supplier-party-onboarding-checks.mjs` |
| regression QA | NOT_EXECUTED | CI attendue |
| lint | NOT_EXECUTED | CI attendue |
| build | NOT_EXECUTED | CI attendue |
| OWNER_E2E | NOT_EXECUTED | Requis avant merge |

- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
- [x] Aucune preuve d’exécution n’est revendiquée avant son résultat réel sur le head final.
