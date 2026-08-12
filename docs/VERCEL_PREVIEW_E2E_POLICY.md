# Vercel Preview et recette E2E pré-merge

Statut : **politique de livraison complémentaire à `docs/CONTRIBUTING.md`**
Issue : #264

## 1. Décision

DTSC Platform suit une politique **Production uniquement depuis `main`**.

Les déploiements Vercel Preview de branches ou de Pull Requests sont actuellement **non autoritatifs pour la validation applicative**. Un Preview peut terminer en `ERROR` avec `Resource provisioning failed` avant le démarrage du build. Ce signal ne doit donc pas être interprété comme un échec de `pnpm build`, des migrations, du type-check ou des E2E tant qu'aucun log applicatif ne le prouve.

Le workflow `.github/workflows/vercel-production-only-status.yml` conserve ce contrat :

- il ne normalise que les événements Vercel de l'environnement `preview` ;
- il marque le statut GitHub `Vercel` comme succès attendu pour un Preview volontairement non autoritatif ;
- il ne normalise jamais un échec Production ;
- la Production reste livrée uniquement depuis `main`.

Cette politique ne signifie pas « ignorer Vercel ». Un échec `main`/Production reste bloquant et doit être diagnostiqué.

## 2. Preuve observée le 12 août 2026

Le diagnostic de #264 a montré le même comportement sur plusieurs branches indépendantes :

- Preview #263 `dpl_3ZxnaYe7nnhbeabq27mV1bvjwWgf` : `BUILD_FAILED / Resource provisioning failed`, aucun événement de build exploitable ;
- Preview #256 `dpl_3ej26N1M6a5iWTbn7nGPVUEkMApa` : même erreur avant build ;
- plusieurs autres branches techniques ont le même profil ;
- les commits fusionnés sur `main` correspondants atteignent `READY` en Production ;
- `main@a452a2f1276282a1ecd2da603a3710a0816fef6a` est `READY` en Production.

La sous-cause interne Vercel exacte (quota, allocation de build, provisioning d'une intégration ou autre ressource plateforme) n'est pas exposée par les logs disponibles. Elle ne doit donc pas être inventée.

## 3. Recette automatisée avant merge

Lorsqu'une contribution exige une recette navigateur avant merge, utiliser le workflow GitHub Actions **Quality gates** en mode manuel :

1. ouvrir **Actions → Quality gates → Run workflow** ;
2. sélectionner **la branche exacte de la PR** ;
3. lancer le workflow ;
4. vérifier que le SHA exécuté correspond au head de la PR ;
5. exiger le succès de `Delivery governance`, `Migration` et `Quality` ;
6. en mode `workflow_dispatch`, exiger aussi le job **Authenticated browser acceptance**.

Ce job construit l'application sur le SHA de branche, applique les migrations sur PostgreSQL isolé, démarre Next.js localement et exécute Playwright. Il fournit donc une recette navigateur automatisée indépendante de Vercel Preview.

La preuve correspondante est `CI_PROVEN` uniquement si le run du SHA exact est réellement vert.

## 4. OWNER_E2E reste distinct

`Authenticated browser acceptance` ne devient jamais automatiquement `OWNER_E2E`.

Lorsqu'une Issue ou une PR exige une validation propriétaire visuelle, tactile, métier ou appareil réel :

- le propriétaire doit réellement exécuter les scénarios concernés ;
- la PR reste `NOT_EXECUTED` pour `OWNER_E2E` jusqu'à cette confirmation explicite ;
- l'indisponibilité d'un Preview Vercel ne permet pas de contourner cette exigence ;
- si aucune surface de recette réelle n'est disponible pour l'OWNER_E2E requis, la PR reste non fusionnable.

## 5. Matrice de lecture des statuts

| Signal | Interprétation |
|---|---|
| Preview Vercel `Resource provisioning failed` sans logs de build | Incident de provisioning Preview non discriminant ; ne prouve pas un échec applicatif |
| Statut GitHub `Vercel: success` sur une PR | Preview volontairement non autoritatif normalisé par la politique Production-only |
| Quality Gates PR vertes | `CI_PROVEN` pour les contrôles réellement exécutés sur le SHA |
| Quality Gates `workflow_dispatch` + Authenticated browser acceptance vert | `CI_PROVEN` pour la recette navigateur automatisée du SHA |
| Confirmation explicite du propriétaire après scénarios réels | `OWNER_E2E` |
| Déploiement Vercel `main` Production `READY` | preuve Production du SHA fusionné |
| Échec Vercel Production | bloquant ; jamais normalisé comme Preview |

## 6. Rollback

Cette politique ne modifie aucun paramètre Vercel, secret, domaine, migration ou comportement applicatif. Le rollback consiste à retirer cette documentation et son gate de contrat. Le workflow Production-only historique reste indépendant tant qu'une décision explicite ne réactive pas les Preview Vercel comme environnement autoritatif.
