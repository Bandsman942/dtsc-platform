# CONTRIBUTING — DTSC Platform

Statut : **obligatoire avant toute contribution**

Ce document définit le contrat humain de contribution au repository `Bandsman942/dtsc-platform`. Il s'applique aux propriétaires du repository, collaborateurs, reviewers, agents IA, scripts de maintenance et contributeurs externes. Une contribution ne doit pas être ouverte, fusionnée ou livrée en Production si elle ne respecte pas ce contrat.

Les règles durables de code restent également définies dans `AGENTS.md`. La gouvernance détaillée de livraison vit dans `docs/DELIVERY_GOVERNANCE.md`. Les contrats spécialisés du repo complètent ce document : architecture ERP, formulaires, responsive, sécurité, abonnements/entitlements, IA, Finance, secteurs, QA et runbooks. En cas de contradiction, la règle la plus restrictive et la plus récente sur `main` prévaut.

## 0. Préflight opposable avant le premier changement

Une contribution ne commence pas par l'édition d'un fichier. Avant le premier changement de code ou de documentation produit, le contributeur doit établir le contrat de livraison réel du travail.

Le préflight obligatoire est :

1. lire `AGENTS.md`, `docs/CONTRIBUTING.md` et les éventuels `AGENTS.md` scoped du chemin touché ;
2. vérifier le SHA réel du dernier `main` et partir de ce SHA ;
3. créer ou identifier l'Issue réelle avec critères d'acceptation, risques, labels structurés et milestone si requis ;
4. créer une branche conforme incluant le numéro d'Issue ;
5. lire `.github/PULL_REQUEST_TEMPLATE.md` **avant de coder** et préparer dès le début les éléments qui devront être prouvés dans la PR : scope, hors-scope, dette, Prisma, sécurité, validation, E2E, risques, rollback, documentation et release note ;
6. identifier les sources de vérité et contrats déjà existants du domaine avant d'ajouter une table, une API, un helper, un composant, une erreur, un entitlement ou une source i18n ;
7. identifier les QA ciblées et les workflows CI qui devront prouver le changement ;
8. décider explicitement si `OWNER_E2E` est requis et définir le parcours avant l'implémentation ;
9. vérifier l'impact abonnement/entitlement/module/IA lorsque le travail touche un module ERP ou une capacité commerciale ;
10. vérifier les obligations documentation/changelog/runbook/rollback du domaine.

### Carte des contrats du repository à consulter selon le scope

Le contributeur ne doit pas supposer qu'un fichier visible est isolé. Les dépendances de gouvernance suivantes sont à rechercher et lire lorsqu'elles sont concernées :

- `.github/PULL_REQUEST_TEMPLATE.md` et `scripts/github/validate-pr-governance.mjs` pour le contrat de PR ;
- `docs/DELIVERY_GOVERNANCE.md` et `scripts/qa-delivery-governance.mjs` pour les gates de livraison ;
- `docs/TECHNICAL_DOCUMENTATION.md`, `docs/ERP_FINAL_ARCHITECTURE.md` et `docs/ERP_FINAL_OPERATIONAL_RUNBOOK.md` pour l'architecture et l'exploitation ERP ;
- `lib/enterprise/module-registry*`, les resolvers d'accès/entitlements et les QA de registre pour tout module ERP ;
- les contrats d'abonnement/capabilities et les resolvers d'accès avant toute activation de module ou capacité IA ;
- les gateways/outils IA, règles de permission et documents IA lorsqu'une capacité est lisible ou actionnable par un assistant ;
- `docs/FORM_UX_CONTRACT.md` pour tout formulaire ;
- `docs/RESPONSIVE_UI_CONTRACT.md` pour toute UI matérielle ;
- les catalogues i18n canoniques du domaine pour toute chaîne client ;
- les services/erreurs canoniques du domaine pour toute mutation ou message métier ;
- les scripts `qa:*` du `package.json`, les tests E2E et les workflows GitHub applicables pour les preuves ;
- les documents métier spécialisés, notamment Finance/Comptabilité/Trésorerie, Health, Pharmacy, Retail/Shop, Manufacturing et autres secteurs touchés.

Si un contrat existe déjà, il doit être étendu ou réutilisé. Une nouvelle source parallèle créée faute d'avoir cherché l'existante est une dette de contribution.

### Contrat de PR préparé dès le début

Le contenu de la future PR n'est pas un rapport rédigé après coup. Dès le démarrage, le contributeur doit pouvoir répondre à :

- quelle Issue la PR ferme ;
- quel est son objectif unique ;
- qu'est-ce qui est explicitement hors scope ;
- quelle dette elle crée, maintient, rembourse ou reporte ;
- quelles données/migrations/backfills elle touche ;
- quels contrôles de sécurité/RBAC/multi-tenant s'appliquent ;
- quels secrets/variables d'environnement changent ou ne changent pas ;
- quelles preuves automatiques et E2E sont nécessaires ;
- quels risques et quel rollback sont prévus ;
- quels documents doivent être modifiés.

Une PR dont ces réponses n'étaient pas identifiables avant le développement est un signal de scope mal borné.

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

**Interdit :** recréer un commit à partir de l'arbre complet d'une branche historique puis le poser au-dessus du `main` courant.

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

Un commit représente une intention compréhensible et ne cache jamais une suppression de tests, une migration réécrite ou une modification hors scope.

## 5. Scope d'une PR et budget de dette

Une PR traite un objectif principal cohérent.

Éviter de mélanger dans la même PR :

- une fonctionnalité produit ;
- une refonte de gouvernance sans lien avec le contrat livré ;
- une migration de données sans lien ;
- un redesign non requis ;
- un nettoyage historique massif.

Une correction transverse reste dans la même PR seulement lorsqu'elle est nécessaire pour satisfaire le même contrat produit, la sécurité, la compilation, la QA ou la gouvernance opposable de la contribution.

### Pas de nouvelle dette silencieuse

Une **dette de contribution** est toute simplification ou incohérence introduite ou consciemment conservée par une PR qui oblige un futur contributeur à payer un coût supplémentaire pour retrouver un contrat propre. Exemples :

- chaîne utilisateur codée en dur alors que la surface est i18n ;
- workaround CSS local au lieu de corriger la primitive partagée responsable ;
- nouveau fetch global ou polling sans justification de coût ;
- deuxième source de vérité ;
- test affaibli ;
- TODO sans Issue ;
- action UI sans backend réel ;
- enum, route, nom de table ou jargon technique exposé au client ;
- comportement mobile corrigé à une largeur mais cassé à une autre ;
- preuve déclarée réussie sans exécution réelle.

La règle est : **aucune nouvelle dette silencieuse**.

Toute PR remplit le registre `## Dette de contribution` du template :

- **Dette créée** : `Aucune` par défaut ; sinon indispensable, bornée, expliquée et liée à une Issue ;
- **Dette maintenue** : dette préexistante volontairement non modifiée ; Issue si matérielle ;
- **Dette remboursée** : dette réellement supprimée ;
- **Dette reportée** : aucune dette reportée sans numéro d'Issue et critère de reprise.

Un `TODO`, `FIXME`, compat bridge, fallback temporaire ou allowlist de dette ajouté dans le diff disparaît avant merge ou possède une Issue explicite.

## 6. Contrat de Pull Request

Le titre de PR doit être Conventional Commit compatible.

La PR doit :

- fermer une Issue avec `Closes #N`, `Fixes #N` ou `Resolves #N` ;
- contenir **toutes** les sections de `.github/PULL_REQUEST_TEMPLATE.md` ;
- porter les labels structurés ;
- porter un milestone si son impact est matériel ;
- décrire le rollback ;
- décrire les impacts Prisma/migrations même lorsqu'il n'y en a aucun ;
- décrire sécurité/RBAC/multi-tenant ;
- remplir le registre de dette ;
- fournir une matrice de preuves ;
- déclarer explicitement la lecture du présent document.

La déclaration obligatoire est :

```text
- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
```

Une case non cochée est un refus de la gate de gouvernance. Ne pas ouvrir une PR volontairement incomplète sur ces sections : utiliser `NOT_EXECUTED` pour les preuves non encore disponibles plutôt que d'omettre le contrat.

## 7. Matrice de preuves : ne jamais confondre exécution et intention

Chaque contrôle matériel cité dans une PR reçoit un état de preuve explicite :

- `LOCAL_EXECUTED` : réellement exécuté dans l'environnement du contributeur ;
- `CI_PROVEN` : réellement produit par la CI du SHA/PR concerné ;
- `OWNER_E2E` : scénario E2E réellement exécuté et confirmé par le propriétaire ;
- `NOT_EXECUTED` : contrôle non exécuté à ce stade.

`À faire`, `normalement vert`, `devrait passer`, `inspecté`, `semble correct` ou l'absence d'état ne sont pas des preuves.

Une inspection statique peut expliquer une décision, mais ne remplace jamais un build, un test navigateur, un E2E ou une preuve Production lorsqu'ils sont exigés.

La matrice de PR nomme au minimum :

```text
Contrôle | Statut | Preuve
```

Les checks GitHub restent l'autorité automatique.

## 8. Validation avant PR et avant merge

Exécuter les contrôles applicables dans cet ordre logique :

1. `git diff --check`, `git diff --cached --check` et contrôle des suppressions inattendues ;
2. installation avec lockfile intact ;
3. `pnpm prisma:generate` si Prisma existe ;
4. migrations depuis une base propre lorsqu'elles sont concernées ;
5. `pnpm type-check` ;
6. QA ciblées du domaine ;
7. `pnpm qa:regression` ;
8. `pnpm lint` ;
9. `pnpm build` ;
10. E2E/acceptance spécialisés lorsque requis.

La CI GitHub est la preuve opposable lorsque l'environnement local ne permet pas l'exécution complète.

Avant merge, refaire une comparaison du **diff final** avec le dernier `main` et vérifier :

- fichiers supprimés/renommés ;
- migrations historiques ;
- scripts QA ;
- documentation ;
- lockfile ;
- changements d'accès, de registre module, de plan ou d'entitlement ;
- outils/permissions IA si le module est exposé à l'assistant ;
- chaînes et composants visibles ajoutés depuis la dernière review.

### Un test ne se neutralise jamais

Il est interdit de supprimer un test parce qu'il échoue, commenter une assertion, transformer un échec en warning pour obtenir du vert, contourner une gate, exclure artificiellement le nouveau code de la QA ou baisser arbitrairement une contrainte de sécurité.

Si un test est devenu faux ou fragile, corriger son contrat pour mesurer le comportement réel, documenter la raison et conserver ou renforcer la couverture.

## 9. Prisma et migrations

- Toute modification de schéma Prisma a sa migration SQL correspondante.
- Une migration déjà fusionnée/appliquée ne se réécrit pas.
- Privilégier les migrations additives et compatibles.
- Tester `prisma migrate deploy` depuis une base vide lorsque le domaine le requiert.
- Ne jamais supprimer dans la même release la dernière utilisation applicative d'une donnée et son stockage physique sans stratégie de cutover explicite.
- Les migrations et backfills sont tenant-safe, idempotents lorsque nécessaire et documentés.
- Une colonne/table nouvelle sans consommation applicative réelle est une dette et n'est pas ajoutée « pour plus tard ».
- Avant de créer un nouveau modèle, rechercher explicitement le modèle/service canonique déjà existant et les éventuels objets legacy `READ_ONLY`.

## 10. Sécurité, RBAC, entitlements et multi-tenant

Aucune PR ne peut considérer l'UI comme barrière de sécurité.

Toute donnée d'entreprise reste isolée par organisation. Les références fournies par le client sont revalidées côté serveur. Les routes sensibles conservent les contrôles applicables : session, contexte, membership, organisation attendue, module actif, entitlement/abonnement, permission, ownership/visibilité, same-origin, validation Zod, `await rateLimit`, transaction, `ApiLog` et `AuditLog`.

Un rôle global n'accorde jamais implicitement l'accès à une donnée privée cliente. Un `MANAGER` n'est pas automatiquement admin entreprise.

Toute nouvelle capacité d'un module vérifie le contrat commercial existant : registre canonique, statut du module, plan/entitlement, dépendances et permissions. Ne pas rendre un bouton ou une route accessible si le resolver canonique refuserait la capacité.

Pour l'IA, les mêmes permissions, entitlements et limites de contexte s'appliquent. Une intégration provider ou modèle est **fail-closed** ; un assistant ne devient jamais un bypass des règles ERP.

Aucun secret ne doit être ajouté dans le code, logs, captures, fixtures, migrations, documents ou réponses client.

## 11. Contrat des erreurs client

Le backend reste l'autorité sur la cause métier. Lorsqu'une API renvoie un code d'erreur métier sûr, un message client sûr et éventuellement des `details` non sensibles :

- le client ne doit pas jeter le code ou le message utile au profit d'un fallback générique ;
- les erreurs connues doivent être traduites via le catalogue canonique lorsqu'il existe ;
- un message serveur déjà humain peut servir de fallback uniquement s'il est explicitement sûr pour le client ;
- Prisma, stack traces, SQL, route interne, payload, identifiants tenant, secrets et erreurs brutes de provider ne sont jamais exposés ;
- le message indique l'action corrective lorsqu'elle existe ;
- les détails utiles (ex. révision courante, solde bloquant, précondition) doivent être structurés et non concaténés depuis une exception brute.

Une mutation métier refusée n'est pas un « échec générique » lorsque le backend connaît la précondition exacte.

## 12. Contrat UX, composants et langage client

Une contribution utilisateur préserve : FR/EN, mobile/tablette/desktop, clair/sombre, accessibilité clavier, cibles tactiles, safe areas, clavier mobile, états hover/focus/pressed/loading/disabled, libellés métier et guides utilisateur applicables.

### Composant partagé avant workaround local

Lorsqu'un défaut apparaît sur plusieurs écrans ou provient d'une primitive partagée, corriger la primitive ou le contrat partagé avant de multiplier des classes CSS locales. `overflow-x-hidden` n'est pas une correction d'un composant trop large.

### Formulaires DTSC — contrat obligatoire

Tout formulaire nouveau ou modifié respecte `docs/FORM_UX_CONTRACT.md`.

Au minimum :

- toute relation métier existante utilise une combobox/select alimentée par la source canonique plutôt qu'un identifiant ou texte libre ;
- les options sont bornées au contexte autorisé et toute référence est revalidée côté serveur dans le même `organizationId` ;
- chaque champ a une aide contextuelle lorsqu'il dépend d'une configuration ;
- toute action visible a un état perceptible et un résultat explicite ;
- succès : toast global après succès backend confirmé ;
- erreur : toast métier, formulaire ouvert et saisie préservée ;
- aucun message visible n'expose jargon interne ou détail technique sensible ;
- mobile, clavier, safe areas, accessibilité, FR/EN et clair/sombre sont vérifiés.

Une PR qui touche un formulaire inclut une QA de succès, une QA d'échec conservant la saisie et, lorsqu'une référence tenant-scoped existe, un rejet serveur de référence invalide/hors tenant.

### Langage client humain

Tout texte visible parle du métier, de l'action ou de la conséquence utile. Un message d'erreur visible explique ce que l'utilisateur peut faire ensuite lorsqu'une action corrective existe.

## 13. Contrat i18n — aucune nouvelle chaîne utilisateur orpheline

Sur une surface FR/EN, toute nouvelle chaîne utilisateur vient de la source i18n canonique du domaine ou d'un dictionnaire partagé raccordé aux deux langues : titres, descriptions, CTA, menus, placeholders, empty states, erreurs/succès, labels accessibles, statuts/enums, dates/heures localisées.

Interdit : ajouter une chaîne FR dans un TSX puis prévoir EN « plus tard », multiplier des ternaires locaux alors qu'un catalogue existe, ou localiser visuellement sans localiser l'accessibilité.

## 14. Contrat mobile, responsive et gestes

Toute modification UI matérielle respecte `docs/RESPONSIVE_UI_CONTRACT.md` et les `AGENTS.md` scoped.

Largeurs minimales de recette : **320, 360, 375, 390, 414, 768 et 1024 px**.

Vérifier selon la surface : absence de scroll global, libellés non coupés, navigation non masquante, clavier/safe areas, PWA si applicable, clair/sombre, FR/EN, états vides/chargement/erreur et interactions tactiles.

Les gestes de navigation n'interceptent jamais un geste démarré dans un formulaire, contrôle, dialog, éditeur, carrousel ou rail horizontal.

## 15. QA visuelle et E2E — un grep ne voit pas un bouton cassé

Les audits statiques protègent un contrat de code mais ne constituent pas une validation visuelle.

Une PR UI matérielle fournit : QA automatisée du contrat, validation navigateur/E2E des parcours critiques, largeurs/langues/thèmes pertinents et preuve attachée selon la matrice.

Lorsque `OWNER_E2E` est requis par l'Issue ou le risque produit, la PR reste non mergeable tant que le propriétaire ne l'a pas confirmé explicitement. L'absence de Preview Vercel ne transforme pas une inspection statique en E2E.

## 16. Performance et coût transverse

Toute nouvelle requête, subscription, polling, timer ou provider monté globalement documente pourquoi le niveau global est nécessaire, fréquence, coût/bornes, arrière-plan, échec/fallback et alternative locale évaluée.

Les listes et agrégats restent paginés/bornés. Un polling plus fréquent ne masque jamais une dette de synchronisation.

## 17. Documentation

La documentation est modifiée dans la même contribution que le contrat qu'elle décrit.

Mettre à jour selon le scope : documentation technique, contrat métier/domaine, guide utilisateur FR/EN, changelog, checklist QA/E2E et runbook/rollback.

Une documentation décrivant une fonctionnalité non livrée est une dette documentaire.

## 18. Production

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

Les commits de branche/PR restent sur GitHub et ne doivent pas déclencher de Preview Vercel dans la politique actuelle. Il est interdit de faire `vercel --prod` depuis une branche feature ou de considérer une Preview comme preuve Production.

Après merge, vérifier que le déploiement Production pointe sur le SHA fusionné attendu lorsque le critère exige une preuve Production.

## 19. Rollback

Toute PR matérielle explique comment revenir au dernier état sain.

Un rollback ne réécrit pas `main`. Utiliser une PR/hotfix traçable ou le mécanisme de rollback Production autorisé. Une migration additive peut rester physiquement présente lors d'un rollback applicatif ; cette décision doit être explicite.

## 20. Règles particulières pour les agents IA

Les agents IA suivent exactement le même contrat que les humains. Ils doivent notamment :

- lire les contrats avant d'écrire ;
- inspecter le dernier `main` réel ;
- créer/identifier l'Issue et la branche conforme avant le code ;
- lire le template de PR et préparer la matrice de preuves dès le début ;
- ne pas inventer qu'un test, build, migration, E2E ou déploiement a réussi ;
- distinguer preuve exécutée, inspection statique et hypothèse ;
- ne jamais fusionner une PR dont les gates requis sont rouges ou dont le contrat de l'Issue n'est pas satisfait ;
- ne pas cacher une limitation d'outil derrière une formulation ambiguë.

Une limitation d'outil ou de réseau impose `NOT_EXECUTED` jusqu'à preuve CI/Production.

## 21. Checklist contributeur

### Avant de coder

- [ ] J'ai lu `AGENTS.md`, `docs/CONTRIBUTING.md` et les fichiers scoped applicables.
- [ ] J'ai vérifié le dernier SHA de `main`.
- [ ] L'Issue réelle existe avec labels/milestone applicables.
- [ ] Ma branche respecte le format officiel.
- [ ] J'ai lu `.github/PULL_REQUEST_TEMPLATE.md` et préparé le contrat de PR.
- [ ] Mon scope et mon hors-scope sont clairs.
- [ ] J'ai identifié les sources de vérité existantes et objets legacy.
- [ ] J'ai identifié module registry, abonnement/entitlement, permissions et IA si concernés.
- [ ] J'ai identifié i18n, formulaire, responsive, erreurs et documentation applicables.
- [ ] J'ai identifié les QA/workflows et si `OWNER_E2E` est requis.

### Avant d'ouvrir la PR

- [ ] Le diff contre le dernier `main` ne supprime rien d'inattendu.
- [ ] Mes commits sont Conventional Commits.
- [ ] Les migrations historiques sont intactes.
- [ ] Les QA applicables sont exécutées ou honnêtement `NOT_EXECUTED`.
- [ ] Sécurité, multi-tenant, données, migrations, risques et rollback sont documentés.
- [ ] Dette créée / maintenue / remboursée / reportée est remplie.
- [ ] Toute dette reportée a une Issue.
- [ ] La matrice de preuves est remplie sans présenter une inspection comme une exécution.
- [ ] UI/formulaire : i18n, mobile, dark mode, accessibilité, succès/échec et conservation de saisie sont couverts.
- [ ] Le contrat d'erreur client conserve les causes métier utiles sans exposer de détail sensible.
- [ ] La PR ferme l'Issue et possède labels/milestone corrects.
- [ ] La déclaration de lecture de `docs/CONTRIBUTING.md` est cochée.

### Avant merge

- [ ] Delivery governance est verte.
- [ ] Migration est verte lorsqu'elle est requise.
- [ ] Type-check est vert.
- [ ] Regression QA est verte.
- [ ] QA ciblées sont vertes.
- [ ] Lint et build sont verts.
- [ ] Les E2E requis sont réellement confirmés.
- [ ] Aucune conversation de review bloquante ne reste ouverte.
- [ ] Le diff final contre le dernier `main` reste cohérent avec l'Issue.
- [ ] Aucune dette silencieuse n'a été introduite depuis la première review.

### Après merge

- [ ] Le SHA de `main` est le SHA attendu.
- [ ] Le déploiement Vercel Production du SHA attendu est READY lorsque requis.
- [ ] Les preuves sont attachées à l'Issue/PR.
- [ ] La Release est créée lorsque le workflow l'exige.
- [ ] L'Issue n'est fermée qu'après satisfaction des critères.
- [ ] Toute dette reportée reste ouverte et traçable.

## 22. Règle de décision

Quand deux chemins sont possibles, choisir celui qui préserve le mieux :

1. l'intégrité du dernier `main` ;
2. la sécurité et l'isolation multi-tenant ;
3. une seule source de vérité ;
4. le registre canonique, les entitlements et permissions existants ;
5. l'absence de dette silencieuse ;
6. la traçabilité ;
7. la reproductibilité des migrations, tests et builds ;
8. la capacité de rollback ;
9. l'i18n, le responsive et l'accessibilité ;
10. la lisibilité du diff et la maintenance future.

Une PR rapide mais difficile à auditer coûte plus cher qu'une PR propre. La gouvernance existe précisément pour éviter de transformer la livraison en séance d'archéologie Git — ou en collection de petites dettes devenues soudain très grandes.
