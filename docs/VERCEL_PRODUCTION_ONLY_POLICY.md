# Vercel Production-only — branches GitHub CI, `main` Production

Statut : **politique de livraison complémentaire et opposable à `docs/CONTRIBUTING.md`**
Issue : #301
Décision propriétaire : 14 août 2026
Supersède la politique Preview issue de #264.

## 1. Décision

DTSC Platform applique désormais une règle stricte : **les commits intermédiaires de branches et de Pull Requests ne doivent pas déclencher de déploiement Vercel**.

Le cycle de travail avant merge reste entièrement sur GitHub :

- branche conforme ;
- commits intermédiaires poussés sur la PR ;
- Delivery governance ;
- Quality/Migration/QA spécialisées ;
- E2E automatisés applicables ;
- `OWNER_E2E` lorsque le contrat de l’Issue l’exige.

Aucun Preview Vercel n’est attendu, requis ou utilisé comme condition de merge.

Après merge, **le seul commit envoyé automatiquement vers Vercel est le commit final présent sur `main`**, qui doit produire le déploiement Production correspondant.

## 2. Contrat Vercel versionné

`vercel.json` porte l’autorité de configuration Git :

```json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "**": false
    }
  }
}
```

Vercel documente `deploymentEnabled` comme le mécanisme prévu pour activer ou désactiver les déploiements Git par branche et indique que les motifs sont évalués avec minimatch. Le motif globstar `**` couvre les noms de branches comprenant des `/`, comme `fix/296-...`, `feat/179-...` ou `chore/301-...`.

La règle `main: true` reste explicite. Lorsque plusieurs motifs correspondent, Vercel considère le déploiement autorisé si au moins une règle correspondante vaut `true` ; `main` reste donc autorisé même s’il correspond aussi au motif global désactivé.

## 3. Défense secondaire : Ignored Build Step

Le dépôt conserve également :

```text
if VERCEL_ENV == production → exit 1 → continuer le build
sinon → exit 0 → ignorer le build
```

Cette garde n’est pas la politique principale : `git.deploymentEnabled` doit empêcher la création automatique du déploiement de branche en amont. `ignoreCommand` reste une protection supplémentaire si un chemin externe tente malgré tout de lancer un environnement non-Production.

## 4. GitHub devient l’environnement de validation pré-merge

Les branches/PR sont validées par GitHub Actions, notamment :

- Quality Gates ;
- migrations depuis une base propre lorsqu’elles sont concernées ;
- type-check ;
- QA de régression ;
- lint ;
- build ;
- workflows spécialisés Finance/Shop/ERP selon le scope ;
- browser acceptance / Playwright lorsqu’ils sont activés par le workflow concerné.

Une preuve obtenue par GitHub Actions est `CI_PROVEN` uniquement pour le SHA réellement exécuté.

## 5. OWNER_E2E ne dépend pas d’un Preview Vercel

`OWNER_E2E` reste une preuve distincte de `CI_PROVEN`.

Lorsqu’il est requis :

- le propriétaire exécute réellement le scénario pertinent sur une surface de recette disponible ;
- il confirme explicitement le résultat ;
- la PR enregistre cette confirmation comme `OWNER_E2E` ;
- l’absence de Preview Vercel n’annule pas cette preuve et ne rend pas un Preview obligatoire.

Il est interdit de déclarer `OWNER_E2E` par simple inférence depuis Playwright ou un build CI.

## 6. Suppression de l’ancienne normalisation Preview

Le workflow qui transformait un échec Preview Vercel en statut GitHub `success` est supprimé.

Avec la nouvelle politique, un Preview Vercel inattendu n’est plus un état « normalisé » : il constitue une **violation du contrat de configuration** à diagnostiquer.

Un échec Vercel Production sur `main` reste bloquant et ne doit jamais être transformé en succès.

## 7. Chaîne officielle

```text
Issue
→ branche conforme
→ commits intermédiaires sur GitHub
→ PR
→ GitHub Actions / QA / E2E applicables
→ OWNER_E2E si requis
→ merge sur main
→ Vercel Production du SHA fusionné
→ vérification READY
→ Release
```

Aucun `vercel --prod` depuis une branche feature n’est autorisé.

## 8. Contrat de non-régression

`scripts/qa-vercel-production-only-policy.mjs` doit échouer si :

- `main` n’est plus explicitement autorisé ;
- une règle non-`main` est autorisée ;
- le motif global `**` n’est plus désactivé ;
- le fallback `ignoreCommand` ne distingue plus Production des autres environnements ;
- l’ancien workflow de normalisation Preview réapparaît ;
- la documentation ou le template de PR réintroduisent un Preview Vercel comme condition de merge.

## 9. Rollback

Toute réactivation de Preview doit faire l’objet d’une nouvelle Issue explicite, modifier `git.deploymentEnabled`, réintroduire un contrat de QA cohérent et documenter le coût/risque de la nouvelle politique.

Aucun retour implicite aux Preview n’est autorisé.
