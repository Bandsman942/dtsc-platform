# DTSC Platform — Versionnement SemVer et livraison

**Entrée en vigueur proposée :** 06/11/2026, Issue #1037. Ce contrat entre en application seulement après fusion validée et déploiement Production de la PR correspondante.

## Source canonique

- La propriété `version` de `package.json` est la seule version applicative canonique. Les cinq surfaces DTSC (Public, Account, App, Console, Support) partagent **une version** et un SHA ; aucun module métier ne reçoit une version de produit concurrente.
- Une version candidate sur une branche ou sur `main` n'est **pas** une version livrée : seul le SHA exact déployé et confirmé `Production/success` via l'intégration native Vercel/GitHub peut créer une GitHub Release.
- Les nouvelles GitHub Releases utilisent `vMAJOR.MINOR.PATCH` et pointent vers le SHA Production exact. Les tags `prod-YYYYMMDD-HHmm-<sha7>` historiques ne sont ni effacés ni réécrits.
- Transition : `package.json` passait auparavant pour une valeur `1.0.0` non synchronisée aux releases horodatées. La première version SemVer candidate de gouvernance est `1.1.0` ; elle ne devient officielle qu'après Production réussie. Aucune rétro-conversion approximative des anciens tags.

## Convention SemVer

| Changement livré | Bump | Exemple |
| --- | --- | --- |
| Correction, sécurité compatible, maintenance ou documentation déployée | PATCH | `1.1.0 → 1.1.1` |
| Fonctionnalité compatible (`feat`) | MINOR | `1.1.1 → 1.2.0` |
| Rupture explicitement annoncée (`type(scope)!:` ou `BREAKING CHANGE:`) | MAJOR | `1.2.0 → 2.0.0` |

- Pour chaque PR qui arrive sur `main`, incrémenter exactement une composante de la version courante du dernier `origin/main` : PATCH +1, MINOR +1 avec PATCH à zéro, ou MAJOR +1 avec MINOR/PATCH à zéro.
- Les versions Production acceptées sont **stables** et strictes : pas de préfixe `v` dans `package.json`, pas de zéros superflus, ni de suffixe `-alpha`, `-rc` ou `+build`. Le préfixe `v` est réservé au tag Git.
- Les commits et titres de PR suivent Conventional Commits. `feat:` entraîne MINOR, les autres types non breaking PATCH ; `!` ou `BREAKING CHANGE:` entraîne MAJOR. Une PR de document ou CI déployée doit aussi incrémenter PATCH.
- Une version déjà publiée ne peut jamais être réassignée à un autre SHA. Un rollback Production conserve la version historique du SHA restauré ; une nouvelle correction doit utiliser une nouvelle version.
- Les branches concurrentes recalculent leur version après chaque fusion sur `main`. Une collision ou un bump incompatible échoue en CI, il ne faut ni forcer un tag ni contourner la gate.

## Flux de livraison

1. Partir du dernier `origin/main`, Issue + milestone + branche dédiée, puis choisir le bump à partir de la nature du changement.
2. Modifier `package.json` et les documents associés **dans la même PR** : changelog, documentation métier/technique, migrations/runbook/QA selon le périmètre. Le lockfile pnpm v9 n'a pas de champ de version racine à réécrire ; toute régénération de lockfile est justifiée par un changement réel.
3. Exécuter `pnpm qa:semver`, `pnpm release:version:check` (classification intégrale sur événement PR en CI), les tests, lint, type-check et build. La Quality Gate vérifie le bump par rapport à `origin/main`.
4. Revue, E2E manuel `OWNER_E2E` si requis, puis squash merge de la PR. Aucune Preview Vercel ni publication manuelle depuis une branche.
5. Vercel déploie exclusivement `main`. Le workflow `production-release.yml` lit le `package.json` du SHA déployé, vérifie l'état natif `Production/success`, l'appartenance au `main` et les collisions/monotonie de la version.
6. Création idempotente du tag `vX.Y.Z` et de la GitHub Release avec SHA, PR, Issues, preuve CI, URL Production et référence de rollback. Un échec Vercel n'autorise aucune release réussie.
7. Vérifier SHA GitHub Release = SHA du déploiement Vercel READY = SHA attendu de `main`. Archiver les preuves et clôturer l'Issue seulement si ses critères sont remplis.

## Récupération et incidents

- **Conflit de version dans une PR :** synchroniser le dernier `main`, recalculer le bump, réviser `package.json` et le changelog, relancer CI. Ne pas modifier un tag existant.
- **Échec du déploiement :** le workflow existant ouvre/actualise un blocker P1 et ne crée pas de Release. La version peut rester candidate dans `main` mais n'est pas livrée.
- **Production READY, création de Release échouée :** diagnostiquer les tags et droits GitHub, résoudre sans réécrire l'historique. Rejouer l'étape idempotente uniquement après contrôle du SHA/version ; aucun nouveau déploiement manuel de branche.
- **Rollback :** restaurer un SHA/Deployment Production sain via la procédure autorisée ; garder sa version historique et les tags `prod-*` éventuels ; publier toute correction supplémentaire avec un numéro supérieur.
- La QA automatisée ne transforme jamais un E2E en `OWNER_E2E` : le propriétaire confirme explicitement les parcours concernés.

## Contrôles

- `node scripts/github/validate-semver.mjs` : syntaxe de la version, et dans GitHub Actions PR, classification obligatoire du bump par rapport à `origin/main`.
- `pnpm qa:semver` : tests de parse/comparaison, exceptions, tags, intégration du workflow Release et présence de la documentation.
- `pnpm qa:delivery-governance` : non-régression de la gouvernance et de l'ancien historique `prod-*`.
