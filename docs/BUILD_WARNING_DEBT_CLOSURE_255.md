# Issue #255 — Build warning debt closure

## Objectif

Fermer les warnings applicatifs révélés par le build Production du commit `6f01a0d9eab0007b0a462784614312611aebdbfe` sans modifier les contrats métier, RBAC, multi-tenant, PWA, responsive ou i18n.

## Périmètre

- déplacer la configuration CLI Prisma hors de `package.json` vers `prisma.config.ts` ;
- corriger les dépendances React Hooks signalées par le build ;
- utiliser `next/image` pour les avatars et logos rendus par React lorsque leurs dimensions sont connues ;
- conserver une image HTML native uniquement lorsque la source est volontairement dynamique/transitoire et que le comportement de prévisualisation l'exige ;
- protéger ces choix par une QA ciblée intégrée à la régression existante.

## Contrat Prisma

`prisma.config.ts` devient la source de configuration CLI Prisma. DTSC utilise un schéma Prisma multi-fichiers : la source CLI reste donc le répertoire `prisma`, et non le seul fichier `prisma/schema.prisma`. Les migrations restent dans `prisma/migrations`, et `DATABASE_URL` continue d'être fourni par l'environnement d'exécution. Aucune migration de données ni de schéma n'est introduite par cette issue.

Le premier essai de migration vers `prisma.config.ts` avait ciblé uniquement `prisma/schema.prisma` et a été rejeté par la CI, car les modèles répartis dans les autres fichiers n'étaient alors plus chargés. La configuration corrigée protège explicitement le layout multi-fichiers afin qu'un futur refactor ne reproduise pas cette régression.

## Exceptions image natives

Une exception `@next/next/no-img-element` n'est autorisée que lorsqu'elle est locale, commentée et techniquement nécessaire. Le viewer plein écran des annonces peut conserver une image native car il réutilise le `currentSrc` arbitraire d'un contenu riche et applique un zoom libre.

Les avatars, logos et images distantes stables touchés par cette itération doivent utiliser `next/image` avec dimensions explicites. Une prévisualisation locale `blob:` peut également être rendue par `next/image` en mode `unoptimized` lorsqu'on veut conserver un composant unique entre l'aperçu local et l'avatar distant.

## Follow-up Production du 12 août 2026

La PR #256 a été fusionnée puis déployée en Production au commit `36dd33e153f0cf8686d9de9e5a15712ecb1ae94f`. Le déploiement Vercel est devenu `READY` et le workflow `Production release` #1447 a réussi. Cette preuve de déploiement n'a toutefois pas suffi à fermer #255 : les logs réels du build Production ont encore exposé cinq warnings applicatifs dans le périmètre de l'issue.

Warnings constatés après #256 :

1. `components/announcements/announcement-wall.tsx` — avatar React encore rendu par un `<img>` natif évitable ;
2. `components/collaborators/collaborators-workspace.tsx` — cleanup d'un effet plein écran relisant `callShellRef.current` ;
3. `components/enterprise/enterprise-ai-workspace-v2.tsx` — effet d'initialisation ne déclarant pas `refreshAll` ;
4. `components/enterprise/professional/enterprise-advanced-finance-workspace.tsx` — fallback `sections` recréant un tableau vide à chaque rendu ;
5. le même workspace Finance — fallback `items` recréant un tableau vide à chaque rendu.

L'issue #255 a donc été réouverte et le follow-up est isolé sur `fix/255-production-warning-followup`.

Remédiations du follow-up :

- l'avatar auteur/destinataire des annonces passe à `next/image` avec dimensions explicites et `unoptimized`, sans modifier son cadre visuel ;
- l'effet plein écran des appels capture une référence stable `callShell` avant de créer son cleanup ;
- les chargeurs de l'Assistant IA Entreprise et `refreshAll` deviennent des callbacks stables, tandis que l'identifiant de conversation active est conservé dans une ref synchronisée afin qu'un refresh ne change pas artificiellement la conversation sélectionnée ;
- les fallbacks Finance utilisent des constantes module `EMPTY_SECTIONS` et `EMPTY_ITEMS` pour conserver une identité référentielle stable ;
- la QA #255 interdit le retour des cinq patterns fautifs.

Ce follow-up ne transforme aucun warning en suppression globale de règle ESLint et n'ajoute aucune exception lint pour ces cinq cas.

## Validation attendue

- `prisma generate` sans avertissement `package.json#prisma` ;
- `pnpm type-check` ;
- QA ciblée #255 ;
- régression ;
- `pnpm lint` sans les warnings couverts par #255 ;
- `pnpm build` sans les warnings couverts par #255 ;
- validation E2E propriétaire ciblée sur le rendu des avatars d'annonces avant fusion, car ce follow-up touche un rendu utilisateur ;
- build Vercel Production final sans les cinq warnings couverts par ce follow-up.

Les preuves restent `NOT_EXECUTED` tant que les commandes ou jobs correspondants n'ont pas réellement terminé. La disparition des warnings dans un build de branche ne sera pas assimilée à une preuve Production ; la fermeture de #255 attend le build Production du commit fusionné.

## Dette de contribution

- Dette créée : Aucune.
- Dette maintenue : #253 (stock i18n historique), hors périmètre de #255.
- Dette remboursée : warnings Prisma/React Hooks/Next image listés dans #255 uniquement après validation effective du follow-up et preuve Production finale.
- Dette reportée : Aucune dans le périmètre de #255.

## Rollback

Pour #256 : revert de la PR #256. Pour le follow-up : revert de sa PR dédiée. Aucune restauration de données n'est nécessaire car ces changements ne modifient ni schéma ni contenu de base de données.