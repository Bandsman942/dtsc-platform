# CONTRIBUTING — DTSC Platform

Statut : **obligatoire avant toute contribution**

Ce document définit le contrat humain de contribution au repository `Bandsman942/dtsc-platform`. Il s'applique aux propriétaires du repository, collaborateurs, reviewers, agents IA, scripts de maintenance et contributeurs externes. Une contribution ne doit pas être ouverte, fusionnée ou livrée en Production si elle ne respecte pas ce contrat.

Les règles durables de code restent également définies dans `AGENTS.md`. La gouvernance détaillée de livraison vit dans `docs/DELIVERY_GOVERNANCE.md`. En cas de contradiction, la règle la plus restrictive et la plus récente sur `main` prévaut.

## 1. Principe cardinal : partir du vrai dernier `main`

Toute contribution commence par le **dernier état réel de `main`**.

Avant de créer une branche :

1. vérifier le SHA courant de `main` ;
2. vérifier que les travaux déjà fusionnés et déployés que la contribution doit préserver sont bien présents ;
3. créer la nouvelle branche depuis ce SHA exact ;
4. ne jamais utiliser l'arbre complet d'une ancienne branche comme remplacement de l'arbre courant de `main`.

Une branche ancienne peut contenir un travail utile, mais elle n'est jamais une autorité supérieure au `main` courant.

### Réconciliation d'un travail ancien

Lorsqu'une ancienne branche doit être réintégrée après plusieurs évolutions de `main` :

- calculer son **delta fonctionnel** par rapport à sa baseline d'origine ;
- créer une branche neuve depuis le dernier `main` ;
- appliquer uniquement ce delta par cherry-pick ciblé, patch, overlay de fichiers réellement modifiés ou réimplémentation contrôlée ;
- comparer ensuite `main...HEAD` et vérifier explicitement les suppressions, renommages, migrations et fichiers de QA ;
- toute suppression d'un fichier récent de `main` doit être intentionnelle, documentée et justifiée.

**Interdit :** recréer un commit à partir de l'arbre complet d'une branche historique puis le poser au-dessus du `main` courant. Cette méthode peut supprimer silencieusement des fichiers ajoutés entre-temps.

## 2. Une Issue avant le code

Toute contribution non triviale doit être liée à une Issue GitHub réelle.

L'Issue décrit au minimum :

- le problème ou besoin ;
- l'objectif ;
- les critères d'acceptation ;
- les risques connus ;
- les domaines impactés ;
- les contraintes de sécurité, données, migration ou Production si elles existent.

Les labels structurés sont obligatoires :

- `type:*` ;
- `priority:*` ;
- `area:*` ;
- `delivery-impact:*`.

Une contribution `delivery-impact:medium` ou `delivery-impact:high` doit avoir un milestone actif.

## 3. Convention de branches

Format obligatoire :

```text
feat|fix|refactor|chore|docs|security/<issue>-<slug>
```

Exemples :

```text
feat/179-ai00-policy-governance
fix/172-erp-cross-module-finance
chore/199-contributing-governance
```

Une branche sans numéro d'Issue n'est pas conforme. Le développement direct sur `main` est interdit.

## 4. Commits

Les commits utilisent Conventional Commits :

```text
feat(ai): enforce provider policy
fix(finance): preserve posted journal history
docs(delivery): document contribution contract
test(ai): cover policy fallback
ci(delivery): enforce PR acknowledgement
```

Les messages vagues comme `update`, `fix stuff`, `changes`, `final`, `work` ou `misc` ne sont pas acceptables.

Un commit doit représenter une intention compréhensible et ne doit jamais cacher une suppression de tests, une migration réécrite ou une modification hors scope.

## 5. Scope d'une PR

Une PR traite un objectif principal cohérent.

Éviter de mélanger dans la même PR :

- une fonctionnalité produit ;
- une refonte de gouvernance ;
- une migration de données sans lien ;
- un redesign non requis ;
- un nettoyage historique massif.

Si un problème transversal est découvert pendant une contribution et qu'il n'est pas nécessaire pour livrer correctement l'objectif courant, créer une Issue et une PR séparées.

Une correction nécessaire à la sécurité, à la compilation ou à la conformité du même contrat peut rester dans la PR à condition d'être explicitement documentée.

## 6. Contrat de Pull Request

Le titre de PR doit être Conventional Commit compatible.

La PR doit :

- fermer une Issue avec `Closes #N`, `Fixes #N` ou `Resolves #N` ;
- contenir toutes les sections du template officiel ;
- porter les labels structurés ;
- porter un milestone si son impact est matériel ;
- décrire le rollback ;
- décrire les impacts Prisma/migrations même lorsqu'il n'y en a aucun ;
- décrire sécurité/RBAC/multi-tenant ;
- fournir les preuves de validation ;
- déclarer explicitement la lecture du présent document.

La déclaration obligatoire est :

```text
- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
```

Une case non cochée est un refus de la gate de gouvernance.

## 7. Validation avant PR et avant merge

Exécuter les contrôles applicables à la contribution, dans cet ordre logique :

1. `git diff --check` et contrôle des suppressions inattendues ;
2. installation avec lockfile intact ;
3. `pnpm prisma:generate` si Prisma existe dans le projet ;
4. migrations depuis une base propre lorsqu'elles sont concernées ;
5. `pnpm type-check` ;
6. QA ciblées du domaine ;
7. `pnpm qa:regression` ou la gate de régression canonique ;
8. `pnpm lint` ;
9. `pnpm build` ;
10. E2E/acceptance spécialisés lorsque le chemin modifié les déclenche ou lorsqu'ils sont requis par le contrat de l'Issue.

La CI GitHub est la preuve opposable lorsque l'environnement local ne permet pas l'exécution complète.

### Un test ne se neutralise jamais

Il est interdit de :

- supprimer un test parce qu'il échoue ;
- commenter une assertion ;
- transformer un échec en warning pour obtenir du vert ;
- contourner un gate obligatoire ;
- baisser arbitrairement une contrainte de sécurité pour satisfaire la CI.

Si un test est devenu faux ou fragile, corriger **le contrat du test** pour mesurer le comportement réel, documenter la raison et conserver ou renforcer la couverture.

## 8. Prisma et migrations

- Une modification de schéma Prisma doit avoir sa migration SQL correspondante.
- Une migration déjà fusionnée/appliquée ne se réécrit pas.
- Privilégier les migrations additives et compatibles.
- Tester `prisma migrate deploy` depuis une base vide lorsque le domaine le requiert.
- Ne jamais supprimer dans la même release la dernière utilisation applicative d'une donnée et son stockage physique sans stratégie de cutover explicite.
- Les migrations et backfills doivent être tenant-safe, idempotents lorsque nécessaire et documentés.

## 9. Sécurité, RBAC et multi-tenant

Aucune PR ne peut considérer l'UI comme barrière de sécurité.

Toute donnée d'entreprise doit rester isolée par organisation. Les références fournies par le client sont revalidées côté serveur. Les routes sensibles conservent les contrôles de session, contexte, membership, entitlement, permission, ownership/visibilité, same-origin, validation, rate limit, transaction et audit applicables.

Aucun secret ne doit être ajouté dans le code, les logs, captures, fixtures, migrations, documents ou réponses client.

Pour l'IA, une nouvelle intégration provider ou modèle doit être **fail-closed** : un provider inconnu n'obtient jamais implicitement la confiance d'un runtime local.

## 10. UX, i18n et documentation

Une contribution utilisateur doit préserver :

- FR/EN lorsqu'ils sont supportés par la surface ;
- mobile et desktop ;
- mode sombre lorsque concerné ;
- accessibilité clavier et cibles tactiles ;
- libellés métier sans codes techniques exposés ;
- guides utilisateur et documentation de domaine lorsque le comportement change.

La documentation est modifiée dans la même contribution que le contrat qu'elle décrit.

## 11. Production

La Production provient uniquement de `main`.

Chaîne officielle :

```text
Issue
→ branche conforme
→ commits conformes
→ PR conforme
→ Delivery governance
→ Quality/Migration/QA spécialisées
→ review
→ merge
→ Vercel Production
→ preuve READY du SHA fusionné
→ Release
```

Il est interdit de faire `vercel --prod` depuis une branche feature ou de considérer une Preview comme une preuve Production.

Après merge, vérifier que le déploiement Production pointe sur le SHA fusionné attendu avant de fermer un travail dont le critère exige une preuve Production.

## 12. Rollback

Toute PR matérielle doit expliquer comment revenir au dernier état sain.

Un rollback ne consiste pas à réécrire `main`. Utiliser une PR/hotfix traçable ou le mécanisme de rollback Production autorisé, puis documenter la preuve.

## 13. Règles particulières pour les agents IA

Les agents IA suivent exactement le même contrat que les humains.

Ils doivent notamment :

- lire `AGENTS.md` et `docs/CONTRIBUTING.md` avant d'écrire ;
- inspecter le dernier `main` réel ;
- ne pas supposer qu'une branche historique est à jour ;
- ne pas inventer qu'un test, build, migration, E2E ou déploiement a réussi ;
- distinguer clairement preuve exécutée, inspection statique et hypothèse ;
- préférer une nouvelle branche propre depuis `main` lorsqu'une ancienne branche est fortement divergente ;
- ne jamais fusionner une PR dont les gates requis sont rouges ou dont le contrat de l'Issue n'est pas satisfait.

Une limitation d'outil ou de réseau n'autorise pas à déclarer une étape réussie. Dans ce cas, la preuve CI/Production doit être attendue ou l'étape marquée explicitement non exécutée.

## 14. Checklist contributeur

### Avant de coder

- [ ] J'ai lu `AGENTS.md`.
- [ ] J'ai lu `docs/CONTRIBUTING.md`.
- [ ] J'ai identifié l'Issue à traiter.
- [ ] J'ai vérifié le dernier SHA de `main`.
- [ ] Ma branche respecte le format officiel.
- [ ] Mon scope est clair et borné.

### Avant d'ouvrir la PR

- [ ] Le diff par rapport au dernier `main` ne supprime rien d'inattendu.
- [ ] Mes commits sont Conventional Commits.
- [ ] Les migrations historiques sont intactes.
- [ ] Les QA ciblées et générales applicables ont été exécutées ou seront prouvées par CI.
- [ ] J'ai documenté sécurité, multi-tenant, migrations, risques et rollback.
- [ ] La PR ferme une Issue réelle.
- [ ] Les labels et le milestone sont corrects.
- [ ] J'ai coché la déclaration de lecture de `docs/CONTRIBUTING.md`.

### Avant merge

- [ ] Delivery governance est verte.
- [ ] Migration est verte lorsqu'elle est requise.
- [ ] Type-check est vert.
- [ ] Regression QA est verte.
- [ ] QA ciblées sont vertes.
- [ ] Lint et build sont verts.
- [ ] Les E2E requis sont verts ou explicitement couverts par le contrat accepté.
- [ ] Aucune conversation de review bloquante ne reste ouverte.
- [ ] Le diff final est toujours cohérent avec l'Issue.

### Après merge

- [ ] Le SHA de `main` est le SHA attendu.
- [ ] Le déploiement Vercel Production du SHA attendu est READY lorsque requis.
- [ ] Les preuves sont attachées à l'Issue/PR.
- [ ] La Release est créée lorsque le workflow de livraison l'exige.
- [ ] L'Issue n'est fermée qu'après satisfaction de ses critères d'acceptation.

## 15. Règle de décision

Quand deux chemins sont possibles, choisir celui qui préserve le mieux :

1. l'intégrité du dernier `main` ;
2. la sécurité et l'isolation multi-tenant ;
3. la traçabilité ;
4. la reproductibilité des migrations et builds ;
5. la capacité de rollback ;
6. la lisibilité du diff ;
7. la simplicité de la future maintenance.

Une PR rapide mais difficile à auditer coûte plus cher qu'une PR propre. La gouvernance existe précisément pour éviter de transformer la livraison en séance d'archéologie Git.
