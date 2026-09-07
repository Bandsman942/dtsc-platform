# Hotfix #594 — Tiers ↔ CRM/Pipeline autour du tiers canonique

## Contexte

Après #591 et #593, `EnterpriseBusinessParty` est devenu la source de vérité de l’identité partagée pour Tiers et Procurement. Le CRM conservait néanmoins une entrée parallèle : le formulaire « Nouveau prospect » pouvait créer un `EnterpriseLead` portant sa propre copie de nom, e-mail et téléphone sans matérialiser immédiatement le tiers canonique.

Le correctif #594 conserve la séparation métier utile entre identité et processus, tout en supprimant la double saisie d’identité.

## Contrat cible

- `EnterpriseBusinessParty` : identité canonique d’une personne ou organisation ;
- rôle `PROSPECT` : relation commerciale potentielle ;
- rôle `CUSTOMER` : relation client ;
- `EnterpriseLead` : processus de prospection ;
- `EnterpriseOpportunity` : processus commercial qualifié.

Un rôle `PROSPECT` n’entraîne pas automatiquement la création d’un Lead. L’utilisateur démarre explicitement une prospection lorsque le processus commercial doit commencer.

## Parcours CRM

### Utiliser un tiers existant

Le formulaire « Nouveau prospect » propose un tiers actif du même tenant portant un rôle actif `PROSPECT` ou `CUSTOMER`. Le serveur revalide le `businessPartyId`, le tenant, le statut et le rôle avant de créer le Lead.

L’identité du Lead est dérivée de la fiche canonique au moment de la création et le Lead porte toujours `businessPartyId`. Ces champs restent un snapshot de processus et ne deviennent pas une seconde autorité d’identité.

### Créer un nouveau tiers

Le formulaire utilise le composant partagé `BusinessPartyIdentityFields`, déjà commun à Tiers et Fournisseurs. La transaction serveur crée :

1. le `EnterpriseBusinessParty` ;
2. son rôle `PROSPECT` ;
3. ses contacts/adresse fournis ;
4. le `EnterpriseLead` lié par `businessPartyId` ;
5. les événements opérationnels associés.

Si une identité correspondante existe déjà, la création est refusée avec un message métier et l’utilisateur doit sélectionner la fiche existante.

## Anti-doublon de processus

Un même tiers ne peut pas recevoir silencieusement plusieurs Leads actifs concurrents (`NEW`, `CONTACTED`, `QUALIFIED`). Le serveur refuse un second processus actif et invite l’utilisateur à ouvrir le Lead existant.

Les Leads historiques convertis/perdus/archivés n’empêchent pas une future prospection lorsque le métier l’autorise.

## Sélecteur commercial dédié

`/api/enterprise/[organizationId]/leads/party-options` est autorisé uniquement par `CRM_PIPELINE` et ne renvoie que les tiers actifs, non archivés, du tenant, avec rôle actif `PROSPECT` ou `CUSTOMER`.

Le payload est minimisé aux champs nécessaires à l’identification de la ligne. La liste générique `professional-lookups` ne renvoie plus la collection complète des tiers lorsqu’elle est appelée pour `CRM_PIPELINE`.

## Tiers — vue commerciale 360°

La fiche Tiers contient désormais un panneau commercial conditionnel. La route de résumé exige d’abord `CRM_CUSTOMERS`, puis vérifie séparément `CRM_PIPELINE`.

- utilisateur Tiers sans Pipeline : aucune donnée commerciale n’est renvoyée et aucun bouton CRM n’est affiché ;
- utilisateur avec lecture Pipeline : Lead actif et opportunités du même `businessPartyId` sont visibles ;
- utilisateur avec écriture Pipeline : si le tiers est actif, commercialement admissible et sans Lead actif, il peut démarrer explicitement une prospection depuis la fiche Tiers.

Cette action réutilise le tiers courant ; elle ne recrée jamais son identité.

## RBAC, abonnement et multi-tenant

Aucun package, prix, plan ou entitlement n’est modifié.

- `CRM_CUSTOMERS` reste la frontière du module Tiers ;
- `CRM_PIPELINE` reste la frontière des Leads et Opportunités ;
- créer un tiers canonique depuis CRM ne confère pas l’accès UI/API à `CRM_CUSTOMERS` ;
- consulter le panneau commercial depuis Tiers ne contourne jamais `CRM_PIPELINE` ;
- toutes les références client sont revalidées côté serveur dans le même `organizationId` ;
- session, same-origin, rate limit, transaction, audit et logs restent applicables.

## IA DTSC Platform

Le correctif ne crée aucun outil IA et ne modifie aucun wildcard/provider.

- `ERP_CUSTOMERS_READ` reste lié à `CRM_CUSTOMERS` ;
- `ERP_CRM_PIPELINE_READ` reste lié à `CRM_PIPELINE` ;
- les exécuteurs ERP continuent de réautoriser les modules via `getEnterpriseCommonDomainAccess` ;
- la convergence vers le même `businessPartyId` améliore la cohérence des données sans élargir le périmètre lisible par l’IA.

## Compatibilité

L’ancien endpoint `POST /leads` reste disponible pour les intégrations historiques, mais son implémentation passe désormais par l’onboarding canonique : un appel sans `businessPartyId` crée le tiers `PROSPECT` et le Lead dans la même transaction ; un appel avec `businessPartyId` réutilise le tiers commercial admissible.

La conversion Lead existante est conservée : un Lead qualifié réutilise son tiers canonique, active/ajoute le rôle `CUSTOMER` et crée éventuellement l’Opportunity avec le même `businessPartyId`.

## Prisma et migrations

Aucune modification du schéma Prisma et aucune migration SQL ne sont nécessaires. Aucun historique de migration n’est réécrit.

## UX et formulaires

Les formulaires modifiés suivent `docs/FORM_UX_CONTRACT.md` : éditeur DTSC, sélecteurs de références canoniques, état disabled/loading, toast global, erreur locale, formulaire conservé en échec, FR/EN via les dictionnaires existants et aucune exposition de jargon Prisma/API au client.

La validation responsive, clair/sombre, clavier/focus et libellés longs reste `NOT_EXECUTED` jusqu’à l’OWNER_E2E du head final.

## QA

`scripts/qa-594-party-crm-canonical-ux.mjs` verrouille statiquement :

- l’éditeur d’identité partagé ;
- les deux parcours CRM ;
- l’atomicité et le lien canonique ;
- l’anti-doublon identité et Lead actif ;
- la minimisation du sélecteur ;
- les frontières `CRM_CUSTOMERS` / `CRM_PIPELINE` ;
- la vue commerciale 360° ;
- la conversion vers `CUSTOMER` ;
- les scopes IA existants.

Cette QA est branchée à `qa:regression`. Une inspection statique n’est pas une preuve d’exécution : les preuves restent `NOT_EXECUTED` jusqu’aux résultats réels de CI.

## OWNER_E2E attendu

Avant merge, valider sur le head exact :

- nouveau tiers depuis CRM → même BusinessParty visible dans Tiers avec rôle `PROSPECT` + Lead lié ;
- tiers existant PROSPECT/CUSTOMER → Lead sans ressaisie ;
- tiers uniquement fournisseur/partenaire non proposé tant qu’il n’a pas de rôle commercial ;
- identité similaire et second Lead actif refusés avec saisie conservée ;
- utilisateur CRM-only capable de prospecter sans accès au module Tiers ;
- utilisateur Tiers-only ne voit aucune donnée Pipeline ;
- utilisateur avec les deux droits voit le 360° et peut démarrer une prospection ;
- conversion QUALIFIED → rôle CUSTOMER + Opportunity éventuelle sur le même tiers ;
- FR/EN, mobile/desktop, clair/sombre, clavier/focus, scroll et toasts.

## Rollback

Revert applicatif de la PR #594. Ne supprimer aucun `EnterpriseBusinessParty`, `EnterpriseLead` ou `EnterpriseOpportunity` créé pendant son utilisation. Aucune migration de base de données n’est à inverser.

## Matrice de preuves avant CI

| Contrôle | Statut | Preuve |
|---|---|---|
| diff check | NOT_EXECUTED | En attente CI |
| Prisma generate | NOT_EXECUTED | En attente CI |
| migrations clean DB | NOT_EXECUTED | En attente CI |
| type-check | NOT_EXECUTED | En attente CI |
| QA ciblée #594 | NOT_EXECUTED | En attente CI |
| regression QA | NOT_EXECUTED | En attente CI |
| lint | NOT_EXECUTED | En attente CI |
| build | NOT_EXECUTED | En attente CI |
| OWNER_E2E | NOT_EXECUTED | Requis avant merge |
