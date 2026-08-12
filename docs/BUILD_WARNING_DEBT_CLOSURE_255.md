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

## Validation attendue

- `prisma generate` sans avertissement `package.json#prisma` ;
- `pnpm type-check` ;
- QA ciblée #255 ;
- régression ;
- `pnpm lint` sans les warnings couverts par #255 ;
- `pnpm build` sans les warnings couverts par #255 ;
- build Vercel Production final sans les warnings couverts par #255.

Les preuves restent `NOT_EXECUTED` tant que les commandes ou jobs correspondants n'ont pas réellement terminé.

## Dette de contribution

- Dette créée : Aucune.
- Dette maintenue : #252 (coût global AppShell / présence) et #253 (stock i18n historique), hors périmètre de #255.
- Dette remboursée : warnings Prisma/React Hooks/Next image listés dans #255 après validation effective.
- Dette reportée : Aucune dans le périmètre de #255.

## Rollback

Revert de la PR #256. Aucune restauration de données n'est nécessaire car cette itération ne modifie ni schéma ni contenu de base de données.