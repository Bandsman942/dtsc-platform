# CI runtime — pnpm setup action (#259)

## Contexte

GitHub Actions signale que `pnpm/action-setup@v4` cible Node.js 20, désormais déprécié sur les runners GitHub. GitHub force actuellement cette action à s'exécuter sur Node.js 24, ce qui crée une dette de runtime CI même lorsque les jobs terminent avec succès.

Cette dette est indépendante des warnings applicatifs suivis par #255.

## Décision

DTSC reste sur `pnpm/action-setup`, mais migre toutes les occurrences de `@v4` vers `@v6`.

Cette décision suit le contrat officiel pnpm au 12 août 2026 :

- le dépôt DTSC déclare `pnpm@10.6.2` dans `packageManager` ;
- la documentation officielle de `pnpm/action-setup` indique que cette action reste celle à utiliser pour pnpm v10 et antérieurs ;
- son successeur `pnpm/setup` est prévu pour pnpm v11 et versions ultérieures ;
- la série v6 est la série courante supportée de `pnpm/action-setup`.

Nous ne migrons donc pas vers `pnpm/setup` dans #259, car cela imposerait simultanément une migration de pnpm 10 vers pnpm 11+ et modifierait davantage le contrat CI que nécessaire.

## Portée

Les workflows contenant `pnpm/action-setup` sont migrés vers `@v6` sans changer :

- Node.js 22 pour les commandes applicatives ;
- la version de pnpm déclarée par `packageManager` ;
- `run_install: false` ;
- `actions/setup-node` et son cache pnpm ;
- les commandes d'installation, Prisma, QA, build et E2E existantes.

## Garde anti-régression

`scripts/qa-delivery-governance.mjs` inspecte tous les fichiers YAML de `.github/workflows` et refuse toute occurrence de `pnpm/action-setup` dont la version majeure est inférieure à 6.

La garde vérifie aussi que le repository reste actuellement sur pnpm 10. Une future migration vers pnpm 11+ devra donc être une contribution explicite qui mettra à jour ce contrat et pourra adopter `pnpm/setup` conformément à la documentation officielle.

## Validation attendue

La preuve de fermeture de #259 exige au minimum :

- Delivery governance verte ;
- Quality et Migration vertes ;
- les workflows spécialisés déclenchés par les fichiers modifiés verts ;
- absence du warning `pnpm/action-setup@v4` / Node.js 20 sur les jobs exécutant la nouvelle version.

Une réussite statique seule ne prouve pas l'absence du warning du runner : la preuve doit venir d'une exécution GitHub Actions réelle.

## Sécurité et données

Aucun changement d'authentification, RBAC, secret, isolation multi-tenant, Prisma schema, migration ou donnée.

## Rollback

Le rollback technique est le revert de la PR #259. Revenir durablement à `pnpm/action-setup@v4` n'est pas considéré comme une fermeture acceptable de la dette : si un blocage de compatibilité oblige à le faire temporairement, une Issue explicite doit documenter le warning, l'impact et le plan de sortie.
