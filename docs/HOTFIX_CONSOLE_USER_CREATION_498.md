# Hotfix #498 — Création de comptes depuis la Console DTSC

## Baseline

- Repository : `Bandsman942/dtsc-platform`
- Baseline : `main@e785a2b82add803bbb5c2b53b4e297b6b66a9872`
- Issue : #498
- Branche : `fix/498-console-user-creation-errors`

## Incident

Le formulaire **Console DTSC → Utilisateurs → Créer un compte utilisateur** pouvait envoyer un payload refusé par `adminCreateUserSchema`, notamment lorsque le mot de passe temporaire comportait moins de 10 caractères. Le frontend ignorait ensuite le corps JSON de l’API et remplaçait toute erreur par le même message générique.

En parallèle, le toast global avait un niveau d’empilement inférieur au `Dialog` partagé : l’erreur pouvait donc apparaître derrière le formulaire. La route de création utilisait aussi encore le contrôle historique `role === ADMIN`, alors que la Console possède désormais la capability canonique `USERS_MANAGE`.

## Contrat corrigé

### Autorisation serveur

`POST /api/admin/users` applique désormais :

1. contrôle same-origin ;
2. session authentifiée ;
3. contexte interne DTSC ;
4. capability Console `USERS_MANAGE` ;
5. validation `adminCreateUserSchema` ;
6. provisioning transactionnel du compte et de l’abonnement Freemium ;
7. audit de succès ou de rejet sans mot de passe ni payload sensible.

Aucun rôle client ou membership d’une entreprise cliente ne devient un bypass d’administration globale.

### Réponses d’erreur

Les réponses conservent des codes métier stables :

- `VALIDATION_ERROR` + `fieldErrors` : données à corriger ;
- `EMAIL_ALREADY_EXISTS` : adresse déjà utilisée ;
- codes d’accès de `requireConsoleCapability` : action non autorisée ;
- `PROVISIONING_UNAVAILABLE` : provisioning momentanément indisponible ;
- `USER_CREATION_FAILED` : erreur inattendue sans détail technique exposé.

Les messages Zod, Prisma, routes, noms de tables, mots de passe et stack traces ne sont pas exposés au client.

## UX et accessibilité

- le mot de passe temporaire impose explicitement `minLength=10` et `maxLength=128` ;
- tout contrôle HTML invalide alimente aussi l’erreur inline et le toast avant l’appel réseau ;
- les autres contraintes HTML reflètent le validateur serveur ;
- l’UI lit le JSON d’erreur et affiche une erreur dédiée au bon champ ;
- `FormField` relie désormais aide et erreur au contrôle via `aria-describedby` et `aria-invalid` ;
- `PasswordInput` accepte des labels accessibles FR/EN pour afficher/masquer le mot de passe ;
- le flux de création utilise un dictionnaire FR/EN dédié ;
- le `ToastProvider` passe au-dessus du niveau des dialogs et les erreurs utilisent `role=alert` tout en conservant un conteneur global non bloquant.

## Atomicité des données

Le compte et son abonnement Freemium sont créés dans la même transaction Prisma. Si le plan Freemium n’est pas disponible, aucun compte partiel n’est créé et l’API répond `PROVISIONING_UNAVAILABLE`.

Une collision d’email concurrente (`P2002`) est reconvertie en `EMAIL_ALREADY_EXISTS` au lieu d’une erreur 500 générique.

## Prisma / migrations

- Modification du schéma Prisma : **aucune**.
- Migration : **aucune**.
- Backfill : **aucun**.

## QA

Le script `scripts/qa-hotfix-498-console-user-creation.mjs` vérifie statiquement :

- capability `USERS_MANAGE` + same-origin ;
- contrat d’erreurs structuré ;
- conflit email dédié ;
- transaction compte + abonnement ;
- lecture JSON côté client ;
- minimum de 10 caractères et remontée de la validation navigateur ;
- accessibilité des erreurs ;
- dictionnaire FR/EN ;
- toast au-dessus du `Dialog` ;
- suppression de l’ancien message générique.

Cette QA est ajoutée à `scripts/run-regression-qa-ci.mjs` afin de devenir une garde permanente de Regression QA.

### Matrice de preuves au moment du commit initial

| Contrôle | Statut | Preuve |
|---|---|---|
| Baseline et diff GitHub | NOT_EXECUTED | Inspection outillée effectuée, mais aucun `git diff` local n’a pu être exécuté dans cette session ; CI/PR reste l’autorité |
| QA ciblée #498 | NOT_EXECUTED | À produire par CI sur le SHA de la PR |
| `pnpm prisma:generate` | NOT_EXECUTED | Environnement local complet non disponible dans cette session |
| `pnpm type-check` | NOT_EXECUTED | À produire par CI |
| `pnpm qa:regression` | NOT_EXECUTED | À produire par CI |
| `pnpm lint` | NOT_EXECUTED | À produire par CI |
| `pnpm build` | NOT_EXECUTED | À produire par CI |
| OWNER_E2E mobile + desktop | NOT_EXECUTED | Requis avant merge |

Les statuts seront mis à jour dans la PR uniquement à partir de preuves réellement produites.

## OWNER_E2E attendu

Tester au minimum :

1. compte valide → création + fermeture du formulaire + utilisateur visible après refresh ;
2. mot de passe de 9 caractères → blocage avant envoi avec explication ;
3. email existant → erreur dédiée sur le champ email ;
4. erreur serveur volontairement provoquée/contrôlée si un environnement de test le permet → message humain ;
5. toast visible au-dessus du formulaire sur mobile et desktop ;
6. utilisateur DTSC avec `USERS_MANAGE` autorisé ; utilisateur sans cette capability refusé ;
7. FR/EN et clair/sombre sur le flux modifié.

## Rollback

Revert applicatif du commit/PR #498. Aucun rollback de base de données n’est nécessaire.

## Dette de contribution

- Dette créée : **Aucune**.
- Dette remboursée : erreur générique, contrat formulaire/serveur désaligné, toast derrière modal, contrôle API historique incompatible avec la capability Console.
- Dette maintenue : aucune dette matérielle connue dans le scope immédiat.
- Dette reportée : aucune.

- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
