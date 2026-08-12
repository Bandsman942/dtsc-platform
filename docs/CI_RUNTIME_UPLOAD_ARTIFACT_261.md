# CI runtime — actions/upload-artifact (#261)

## Contexte

La validation de #259 a révélé un warning GitHub Actions distinct : `actions/upload-artifact@v4` cible encore Node.js 20 et GitHub force cette action à s'exécuter sur Node.js 24.

Le warning a été observé sur le run `Generate enterprise accounting migration` #188, alors que le job lui-même terminait avec succès. Selon `docs/CONTRIBUTING.md`, une réussite du job ne permet pas de masquer cette dette de runtime.

## Source et cible

Au 12 août 2026, la release officielle courante de `actions/upload-artifact` est la série v7 et la documentation officielle utilise `actions/upload-artifact@v7` dans ses exemples.

DTSC migre donc les occurrences repository de `actions/upload-artifact@v4` vers `actions/upload-artifact@v7`.

## Portée

La migration conserve à l'identique :

- le nom des artefacts ;
- les chemins et wildcards transmis à l'action ;
- `if-no-files-found` ;
- les conditions `if:` des étapes de diagnostics ;
- les permissions et runners ;
- les commandes métier, Prisma, build et E2E.

Les workflows concernés dans le delta #261 sont :

- `quality-gates.yml` ;
- `shop2-behavioral.yml` ;
- `accounting-acceptance.yml` ;
- `generate-enterprise-accounting-migration.yml`.

## Garde anti-régression

`scripts/qa-github-actions-upload-runtime.mjs` inspecte tous les YAML de `.github/workflows` et échoue si une occurrence de `actions/upload-artifact` utilise une version majeure inférieure à 7.

Cette garde est injectée dans `scripts/run-regression-qa-ci.mjs`, donc elle fait partie de la régression standard au lieu de dépendre d'un grep manuel.

## Dette parallèle

La branche #261 a été réalignée après fusion de #259. Les deux contrats doivent donc coexister : `pnpm/action-setup@v6+` pour pnpm 10 et `actions/upload-artifact@v7+` pour les artefacts.

## Validation attendue

La fermeture de #261 exige :

- régression standard verte avec la nouvelle garde ;
- Quality et Migration vertes ;
- workflows spécialisés touchés verts ;
- preuve runner réelle montrant l'absence du warning Node.js 20 attribué à `actions/upload-artifact@v4` sur les jobs utilisant l'action v7.

Un contrôle source seul ne suffit pas à prouver l'absence du warning du runner.

## Sécurité et données

Aucun changement d'authentification, RBAC, permission, secret, isolation multi-tenant, schéma Prisma, migration ou donnée.

## Rollback

Le rollback technique est le revert de la PR. Un retour durable à `actions/upload-artifact@v4` ne doit pas être présenté comme une fermeture de la dette. Si un problème de compatibilité impose temporairement ce retour, la dette doit rester suivie par une Issue explicite jusqu'à résolution.
