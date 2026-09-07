# Hotfix #590 — Tiers canonique et convergence Procurement

## Statut

Implémentation sur `fix/590-canonical-party-hotfix`, issue #590. Baseline : `main@af8ec7104bd59bf871e258150c9e8d436156d3f5`.

## Incident Production

La création d'un tiers échouait avec Prisma `Unknown argument organizationId` même lorsque le formulaire était valide. La cause se trouvait dans `createEnterpriseBusinessParty()` : la création parent envoyait correctement `organizationId`, mais les `create` imbriqués de rôles, contacts et adresses renvoyaient aussi cette clé de relation composite. Dans les inputs Prisma checked `CreateWithoutBusinessParty`, `organizationId` et `businessPartyId` sont hérités de la relation parent et ne doivent pas être fournis explicitement.

Le gestionnaire d'erreur transformait ensuite cette erreur interne en HTTP 400 avec « vérifiez les champs obligatoires », ce qui donnait à l'utilisateur une fausse cause.

## Corrections

### Tiers et clients

- suppression de `organizationId` des nested creates Prisma de rôles, contacts et adresses ;
- maintien de `organizationId` sur l'objet `EnterpriseBusinessParty` parent ;
- conservation de la transaction et de l'événement opérationnel ;
- formulaire existant conservé sur le shell DTSC `Dialog presentation="editor"`, avec `ProfessionalFormSection`, footer partagé et `ProfessionalError` ;
- une erreur interne retourne désormais HTTP 500 avec un message humain, conserve la saisie et n'accuse plus les champs obligatoires ;
- aucune erreur Prisma brute, stack, payload, identifiant de tenant ou donnée saisie n'est ajoutée aux réponses client.

### Source de vérité commerciale

`EnterpriseBusinessParty` reste l'identité commune : personne/organisation, nom, coordonnées, fiscalité, rôles et adresses. Le CRM conserve `EnterpriseLead` et `EnterpriseOpportunity` comme objets de processus et ne devient pas un second registre d'identité.

### Fournisseurs et achats

Les nouvelles écritures Procurement convergent désormais immédiatement :

1. `EnterpriseSupplier` reste l'extension opérationnelle/compatibilité Procurement ;
2. un `EnterpriseBusinessParty` existant est réutilisé lorsqu'une correspondance non ambiguë existe ; sinon le tiers canonique est créé ;
3. le rôle `SUPPLIER` est créé/réactivé avec son propre statut ;
4. `EnterpriseSupplierPartyLink` matérialise la relation 1:1 ;
5. la suspension/inactivation d'un fournisseur ne désactive jamais l'ensemble du tiers partagé : seul le rôle `SUPPLIER` devient inactif ;
6. les mises à jour Procurement synchronisent les informations communes vers le tiers canonique ;
7. une modification autorisée depuis Tiers et clients rafraîchit le snapshot fournisseur lié sans conférer de nouveau droit Procurement ;
8. la route manuelle de liaison fournisseur passe par la même convergence canonique ;
9. le backfill historique conserve la même règle de statut.

Les anciennes lignes restent compatibles. Aucune table historique n'est supprimée et aucune migration existante n'est réécrite.

## Abonnement, RBAC et multi-tenant

Ce hotfix ne modifie aucun package, prix, plan minimum ou entitlement. Les frontières restent :

- `CRM_CUSTOMERS` pour les routes Tiers ;
- `SUPPLIERS_PURCHASES` pour les routes fournisseurs/achats ;
- membership actif, module, entitlement et permission continuent d'être vérifiés côté serveur ;
- la création d'une projection canonique interne depuis Procurement n'accorde pas à l'utilisateur l'accès UI/API au module CRM ;
- toutes les recherches et liaisons restent filtrées par `organizationId` ;
- les contraintes uniques `EnterpriseSupplierPartyLink(organizationId, supplierId)` et `(organizationId, businessPartyId)` restent opposables.

## IA DTSC Platform

Aucun nouvel outil IA n'est créé et aucun droit n'est élargi.

- `ERP_CUSTOMERS_READ` reste statiquement lié à `CRM_CUSTOMERS` ;
- `ERP_PROCUREMENT_READ` reste statiquement lié à `SUPPLIERS_PURCHASES` ;
- chaque exécuteur réautorise le module dans le contexte de l'utilisateur ;
- aucun accès Prisma dynamique, wildcard de modèle ou bypass Tool Gateway n'est ajouté ;
- les snapshots Procurement convergents évitent qu'une IA autorisée lise une identité fournisseur divergente de la contrepartie canonique.

## Prisma et Production

Aucune migration de schéma n'est nécessaire pour #590. Les modèles et contraintes requis existaient déjà.

Le build Production exécute désormais explicitement :

1. `pnpm prisma:generate` ;
2. `node scripts/qa-prisma-canonical-party-runtime.mjs` ;
3. `prisma migrate deploy` ;
4. le build Next.js.

Le contrôle runtime vérifie dans le DMMF du Prisma Client généré les modèles/champs critiques Tiers, fournisseurs et lien de convergence. Il empêche le déploiement si le client généré n'est pas cohérent avec le contrat attendu.

## QA permanente

`scripts/qa-hotfix-590-canonical-party-contract.mjs` est branché à `qa:regression`. Il verrouille notamment :

- absence de `organizationId` dans les nested creates fautifs ;
- contrat runtime Prisma généré ;
- classification sûre des erreurs internes ;
- création/lien/rôle fournisseur canonique ;
- statut du rôle fournisseur distinct du statut global du tiers ;
- RBAC des modules Tiers et Procurement ;
- relation 1:1 fournisseur/tiers ;
- shell de formulaire DTSC ;
- contrats IA statiques et réautorisation par module.

## Rollback

Revert des commits #590. Ne supprimer ni tiers ni liens déjà créés. `EnterpriseSupplier` reste lisible comme extension historique. Aucune migration destructive n'est introduite.

## Dette de contribution

- Dette créée : Aucune visée.
- Dette remboursée : nested create Prisma invalide ; erreur utilisateur trompeuse ; création fournisseur hors tiers canonique ; statut fournisseur contaminant potentiellement l'identité partagée ; absence de garde runtime Prisma ; route de liaison fournisseur utilisant une logique parallèle.
- Dette maintenue : `EnterpriseSupplier` demeure comme extension/snapshot opérationnel et compatibilité historique ; sa suppression physique est hors scope et non nécessaire à la source de vérité canonique.
- Dette reportée : Aucune sans Issue dédiée.

## Matrice de preuves

| Contrôle | Statut | Preuve |
|---|---|---|
| `pnpm prisma:generate` | NOT_EXECUTED | À produire par CI |
| Runtime Prisma canonique | NOT_EXECUTED | `scripts/qa-prisma-canonical-party-runtime.mjs` |
| QA hotfix #590 | NOT_EXECUTED | `scripts/qa-hotfix-590-canonical-party-contract.mjs` |
| `pnpm qa:regression` | NOT_EXECUTED | À produire par CI |
| `pnpm type-check` | NOT_EXECUTED | À produire par CI |
| `pnpm lint` | NOT_EXECUTED | À produire par CI |
| `pnpm build` | NOT_EXECUTED | À produire par CI |
| OWNER_E2E création Personne/Organisation/rôles | NOT_EXECUTED | Requis avant merge |
| OWNER_E2E fournisseur ↔ tiers ↔ CRM/achats | NOT_EXECUTED | Requis avant merge |
| OWNER_E2E lectures IA autorisées | NOT_EXECUTED | Requis avant merge |

- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
