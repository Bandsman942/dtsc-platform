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
- une erreur de mutation conserve le formulaire et ses valeurs, reste visible localement et remonte aussi via le provider de toast global avec une tonalité d'erreur, conformément à `docs/FORM_UX_CONTRACT.md` ;
- une erreur interne retourne désormais HTTP 500 avec un message humain, conserve la saisie et n'accuse plus les champs obligatoires ;
- les erreurs métier historiques encore émises sous forme de codes `Error("...")` gardent un statut et un message actionnables au lieu d'être confondues avec un défaut serveur ;
- les défauts inattendus journalisent uniquement un code, le type d'erreur, le chemin et une corrélation de requête disponible ; aucune erreur Prisma brute, stack, payload ou valeur saisie n'est ajoutée aux logs ou réponses client.

### Source de vérité commerciale

`EnterpriseBusinessParty` reste l'identité commune : personne/organisation, nom, coordonnées, fiscalité, rôles et adresses. Le CRM conserve `EnterpriseLead` et `EnterpriseOpportunity` comme objets de processus et ne devient pas un second registre d'identité.

### Fournisseurs et achats

Les nouvelles écritures Procurement convergent désormais immédiatement :

1. `EnterpriseSupplier` reste l'extension opérationnelle/compatibilité Procurement ;
2. un `EnterpriseBusinessParty` existant est réutilisé lorsqu'une correspondance non ambiguë existe ; sinon le tiers canonique est créé ;
3. les correspondances fortes par identifiant fiscal, numéro d'enregistrement ou e-mail doivent toutes désigner le même tiers ; toute contradiction est refusée au lieu de choisir arbitrairement une fiche ;
4. une correspondance personne/organisation incohérente est refusée ; la nature canonique ne peut pas être modifiée depuis le snapshot Fournisseurs ;
5. le rôle `SUPPLIER` est créé/réactivé avec son propre statut ;
6. `EnterpriseSupplierPartyLink` matérialise la relation 1:1 ; les anciennes lignes archivées sont inspectées et peuvent être réactivées au lieu de provoquer un conflit unique `P2002` ; un tiers canonique archivé n'est jamais réactivé silencieusement ;
7. la suspension/inactivation d'un fournisseur ne désactive jamais l'ensemble du tiers partagé : seul le rôle `SUPPLIER` devient inactif ;
8. les mises à jour Procurement synchronisent les informations communes vers le tiers canonique ;
9. une modification autorisée depuis Tiers et clients rafraîchit le snapshot fournisseur lié sans conférer de nouveau droit Procurement ;
10. la normalisation de `EnterpriseSupplier.normalizedName` est centralisée et réutilisée par création, convergence et projection pour éviter les divergences d'accents/casse ;
11. la route manuelle de liaison fournisseur passe par la même convergence canonique et conserve l'événement opérationnel `SUPPLIER_PARTY_LINKED` ;
12. le backfill historique applique les mêmes protections principales : type, statut du rôle, correspondances fortes cohérentes, refus des ambiguïtés, détection des liens archivés et sortie non silencieuse lorsqu'une ligne exige une correction manuelle.

Les anciennes lignes restent compatibles. Aucune table historique n'est supprimée et aucune migration existante n'est réécrite.

## Abonnement, RBAC et multi-tenant

Ce hotfix ne modifie aucun package, prix, plan minimum ou entitlement. Les frontières restent :

- `CRM_CUSTOMERS` pour les routes Tiers ;
- `SUPPLIERS_PURCHASES` pour les routes fournisseurs/achats ;
- membership actif, module, entitlement et permission continuent d'être vérifiés côté serveur ;
- la création d'une projection canonique interne depuis Procurement n'accorde pas à l'utilisateur l'accès UI/API au module CRM ;
- toutes les recherches et liaisons restent filtrées par `organizationId` ;
- les contraintes uniques `EnterpriseSupplierPartyLink(organizationId, supplierId)` et `(organizationId, businessPartyId)` restent opposables, y compris pour les lignes archivées ;
- une référence historique contradictoire est bloquée et signalée au lieu de contourner l'isolation ou de recréer une relation concurrente.

## IA DTSC Platform

Aucun nouvel outil IA n'est créé et aucun droit n'est élargi.

- `ERP_CUSTOMERS_READ` reste statiquement lié à `CRM_CUSTOMERS` ;
- `ERP_PROCUREMENT_READ` reste statiquement lié à `SUPPLIERS_PURCHASES` ;
- chaque exécuteur réautorise le module dans le contexte de l'utilisateur ;
- aucun accès Prisma dynamique, wildcard de modèle ou bypass Tool Gateway n'est ajouté ;
- les snapshots Procurement convergents évitent qu'une IA autorisée lise une identité fournisseur divergente de la contrepartie canonique ;
- la convergence interne ne donne pas à l'IA Procurement un accès aux données CRM non autorisées : elle continue à lire uniquement la projection et les données du module autorisé.

## Prisma et Production

Aucune migration de schéma n'est nécessaire pour #590. Les modèles et contraintes requis existaient déjà.

Le build Production exécute désormais explicitement :

1. `pnpm prisma:generate` ;
2. `node scripts/qa-prisma-canonical-party-runtime.mjs` ;
3. `prisma migrate deploy` ;
4. le build Next.js.

Le contrôle runtime vérifie dans le DMMF du Prisma Client généré les modèles/champs critiques Tiers, fournisseurs et lien de convergence. Il empêche le déploiement si le client généré n'est pas cohérent avec le contrat attendu.

## Backfill historique

`scripts/backfill-enterprise-supplier-parties.mjs` reste `dry-run` par défaut. En mode `--apply` :

- seuls les fournisseurs sans lien actif sont candidats ;
- un lien 1:1 archivé est réactivé uniquement si son tiers canonique est encore actif et cohérent ;
- les correspondances sont recherchées par migration key puis par identifiants forts et enfin par nom ;
- plusieurs candidats ou plusieurs identifiants pointant vers des tiers différents provoquent un `skip` explicite ;
- un tiers déjà lié à un autre fournisseur, même via une ligne historique archivée, n'est jamais réaffecté automatiquement ;
- un nouveau tiers reçoit ses coordonnées/adresse principales sans utiliser le nested create fautif ;
- lorsque le tiers existant gagne comme source de vérité, le snapshot fournisseur est réaligné avec la normalisation Procurement ;
- si une ou plusieurs lignes sont ignorées pour conflit, le script termine avec un code de sortie non nul afin que l'opérateur traite la dette au lieu de la masquer.

## QA permanente

`scripts/qa-hotfix-590-canonical-party-contract.mjs` est branché à `qa:regression`. Il verrouille notamment :

- absence de `organizationId` dans les nested creates fautifs ;
- contrat runtime Prisma généré ;
- classification sûre des erreurs internes et conservation des erreurs métier actionnables ;
- création/lien/rôle fournisseur canonique ;
- normalisation unique du snapshot fournisseur ;
- refus d'une modification du type canonique depuis Procurement ;
- refus des identités fortes contradictoires et des doublons 1:1 historiques ;
- guérison contrôlée des liens archivés ;
- conservation de l'événement de liaison fournisseur/tiers ;
- statut du rôle fournisseur distinct du statut global du tiers ;
- backfill conflict-safe et non silencieux ;
- RBAC des modules Tiers et Procurement ;
- relation 1:1 fournisseur/tiers ;
- shell de formulaire DTSC ;
- feedback d'erreur double couche : erreur locale + toast global ;
- contrats IA statiques et réautorisation par module.

## Rollback

Revert des commits #590. Ne supprimer ni tiers ni liens déjà créés. `EnterpriseSupplier` reste lisible comme extension historique. Aucune migration destructive n'est introduite. Les lignes déjà convergées ne doivent pas être supprimées lors d'un rollback applicatif.

## Dette de contribution

- Dette créée : Aucune visée.
- Dette remboursée : nested create Prisma invalide ; erreur utilisateur trompeuse ; création fournisseur hors tiers canonique ; statut fournisseur contaminant potentiellement l'identité partagée ; absence de garde runtime Prisma ; route de liaison fournisseur utilisant une logique parallèle ; rapprochement fournisseur ambigu ; normalisation divergente de la projection ; conflit des liens archivés masqué par une contrainte unique ; absence de toast global d'erreur sur le formulaire Tiers.
- Dette maintenue : `EnterpriseSupplier` demeure comme extension/snapshot opérationnel et compatibilité historique ; sa suppression physique est hors scope et non nécessaire à la source de vérité canonique.
- Dette reportée : Aucune sans Issue dédiée.

## Matrice de preuves

| Contrôle | Statut | Preuve |
|---|---|---|
| `pnpm prisma:generate` | NOT_EXECUTED | À produire par CI sur le head final |
| Runtime Prisma canonique | NOT_EXECUTED | `scripts/qa-prisma-canonical-party-runtime.mjs` |
| Migrations clean DB | NOT_EXECUTED | À produire par CI sur le head final |
| QA hotfix #590 | NOT_EXECUTED | `scripts/qa-hotfix-590-canonical-party-contract.mjs` |
| `pnpm qa:regression` | NOT_EXECUTED | À produire par CI sur le head final |
| `pnpm type-check` | NOT_EXECUTED | À produire par CI sur le head final |
| `pnpm lint` | NOT_EXECUTED | À produire par CI sur le head final |
| `pnpm build` | NOT_EXECUTED | À produire par CI sur le head final |
| OWNER_E2E création Personne/Organisation/rôles | NOT_EXECUTED | Requis avant merge |
| OWNER_E2E fournisseur ↔ tiers ↔ CRM/achats | NOT_EXECUTED | Requis avant merge |
| OWNER_E2E lectures IA autorisées | NOT_EXECUTED | Requis avant merge |

- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
- [x] Aucune preuve d'exécution n'est revendiquée avant son résultat réel sur le head final.
