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

Toute PR doit remplir le registre `## Dette de contribution` du template :

- **Dette créée** : doit être `Aucune` par défaut. Si elle n'est pas nulle, elle doit être indispensable, bornée, expliquée et liée à une Issue dédiée ;
- **Dette maintenue** : dette préexistante rencontrée et volontairement non modifiée ; si elle est matérielle pour le domaine touché, elle doit être liée à une Issue ;
- **Dette remboursée** : dette réellement supprimée par la PR ;
- **Dette reportée** : aucune dette reportée ne peut rester sans numéro d'Issue et critère de reprise.

Un `TODO`, `FIXME`, compat bridge, fallback temporaire ou allowlist de dette ajouté dans le diff doit donc soit disparaître avant merge, soit avoir une Issue explicite.

Si un problème transversal hors scope est découvert et n'est pas nécessaire pour livrer correctement l'objectif courant, créer une Issue séparée plutôt que de l'enfouir dans le code.

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
- remplir le registre de dette ;
- fournir une matrice de preuves ;
- déclarer explicitement la lecture du présent document.

La déclaration obligatoire est :

```text
- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
```

Une case non cochée est un refus de la gate de gouvernance.

## 7. Matrice de preuves : ne jamais confondre exécution et intention

Chaque contrôle matériel cité dans une PR reçoit un état de preuve explicite. Les états autorisés sont :

- `LOCAL_EXECUTED` : commande ou scénario réellement exécuté dans l'environnement du contributeur, avec résultat disponible ;
- `CI_PROVEN` : résultat réellement produit par la CI du SHA/PR concerné ;
- `OWNER_E2E` : scénario E2E exécuté et confirmé explicitement par le propriétaire/acceptance prévue par le contrat ;
- `NOT_EXECUTED` : contrôle non exécuté à ce stade.

`À faire`, `normalement vert`, `devrait passer`, `inspecté`, `semble correct` ou l'absence d'état ne sont pas des preuves.

Une inspection statique peut expliquer une décision, mais elle ne remplace jamais un build, un test navigateur, un E2E ou une preuve Production lorsque ceux-ci sont exigés.

Il est interdit de déclarer `LOCAL_EXECUTED`, `CI_PROVEN`, `OWNER_E2E`, `READY`, `déployé`, `vert` ou équivalent si l'événement correspondant n'a pas réellement eu lieu.

La matrice de PR doit au minimum nommer :

```text
Contrôle | Statut | Preuve
```

Les contrôles requis mais non encore exécutés restent `NOT_EXECUTED` jusqu'à obtention de la preuve. Une PR ne devient pas mergeable par simple changement de texte : les checks GitHub restent l'autorité automatique.

## 8. Validation avant PR et avant merge

Exécuter les contrôles applicables à la contribution, dans cet ordre logique :

1. `git diff --check`, `git diff --cached --check` et contrôle des suppressions inattendues ;
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

Avant merge, refaire une comparaison du **diff final** avec le dernier `main` et vérifier :

- fichiers supprimés/renommés ;
- migrations historiques ;
- scripts QA ;
- documentation ;
- lockfile ;
- changements d'accès ou d'entitlement ;
- chaînes et composants visibles ajoutés depuis la dernière review.

### Un test ne se neutralise jamais

Il est interdit de :

- supprimer un test parce qu'il échoue ;
- commenter une assertion ;
- transformer un échec en warning pour obtenir du vert ;
- contourner un gate obligatoire ;
- exclure artificiellement le nouveau code de la QA ;
- baisser arbitrairement une contrainte de sécurité pour satisfaire la CI.

Si un test est devenu faux ou fragile, corriger **le contrat du test** pour mesurer le comportement réel, documenter la raison et conserver ou renforcer la couverture.

## 9. Prisma et migrations

- Une modification de schéma Prisma doit avoir sa migration SQL correspondante.
- Une migration déjà fusionnée/appliquée ne se réécrit pas.
- Privilégier les migrations additives et compatibles.
- Tester `prisma migrate deploy` depuis une base vide lorsque le domaine le requiert.
- Ne jamais supprimer dans la même release la dernière utilisation applicative d'une donnée et son stockage physique sans stratégie de cutover explicite.
- Les migrations et backfills doivent être tenant-safe, idempotents lorsque nécessaire et documentés.
- Une colonne/table nouvelle sans consommation applicative réelle est une dette et n'est pas ajoutée « pour plus tard ».

## 10. Sécurité, RBAC et multi-tenant

Aucune PR ne peut considérer l'UI comme barrière de sécurité.

Toute donnée d'entreprise doit rester isolée par organisation. Les références fournies par le client sont revalidées côté serveur. Les routes sensibles conservent les contrôles de session, contexte, membership, entitlement, permission, ownership/visibilité, same-origin, validation, rate limit, transaction et audit applicables.

Aucun secret ne doit être ajouté dans le code, les logs, captures, fixtures, migrations, documents ou réponses client.

Pour l'IA, une nouvelle intégration provider ou modèle doit être **fail-closed** : un provider inconnu n'obtient jamais implicitement la confiance d'un runtime local.

Un deep link, badge, bouton masqué ou donnée déjà présente côté client ne constitue jamais une autorisation.

## 11. Contrat UX, composants et langage client

Une contribution utilisateur doit préserver :

- FR/EN lorsqu'ils sont supportés par la surface ;
- mobile, tablette et desktop ;
- mode clair/sombre lorsque concerné ;
- accessibilité clavier et cibles tactiles ;
- safe areas et clavier mobile ;
- états hover, focus-visible, active/pressed, loading et disabled cohérents ;
- libellés métier sans codes techniques exposés ;
- guides utilisateur et documentation de domaine lorsque le comportement change.

### Composant partagé avant workaround local

Lorsqu'un défaut apparaît sur plusieurs écrans ou provient d'une primitive partagée, corriger la primitive ou le contrat partagé avant de multiplier des classes CSS locales.

Un contournement local est acceptable uniquement si la différence est réellement spécifique au métier et documentée. `overflow-x-hidden` n'est pas une correction de composant trop large.

Pour une action mobile :

- aucun libellé ne doit déborder d'une hauteur fixe ;
- une CTA principale doit rester courte et compréhensible ;
- les actions secondaires nombreuses utilisent divulgation progressive/menu ;
- la cible tactile reste adaptée ;
- l'utilisateur reçoit un effet visuel au hover/focus/press lorsque le dispositif le permet.

### Langage client humain

Tout texte visible par un client parle de son métier, de son action ou de la conséquence utile. Les détails d'implémentation restent dans les logs/diagnostics protégés.

Ne pas exposer inutilement : noms de tables/Prisma, routes API, enums bruts, stack traces, provider errors brutes, `organizationId`, `tenant`, `membership`, `payload`, `webhook`, noms de composants ou concepts internes lorsqu'un équivalent métier existe.

Un message d'erreur visible doit expliquer ce que l'utilisateur peut faire ensuite lorsqu'une action corrective existe.

## 12. Contrat i18n — aucune nouvelle chaîne utilisateur orpheline

Sur une surface FR/EN, toute nouvelle chaîne utilisateur modifiable par la langue doit provenir de la source i18n canonique du domaine ou d'un dictionnaire partagé explicitement raccordé aux deux langues.

Sont concernés notamment :

- titres, descriptions, CTA, menus ;
- placeholders ;
- empty states ;
- erreurs/succès ;
- `aria-label`, `title` et textes de lecteurs d'écran ;
- labels de statuts/enums ;
- dates et heures localisées.

Interdit dans une nouvelle contribution FR/EN :

- ajouter une chaîne française directement dans un TSX puis prévoir l'anglais « plus tard » ;
- ajouter un ternaire local `locale === "en" ? ... : ...` lorsque le domaine possède déjà une source i18n ;
- utiliser `fr-FR` ou `en-US` en dur pour un affichage dépendant de la préférence utilisateur ;
- faire traduire visuellement le texte tout en laissant les labels accessibles dans une autre langue.

Les noms propres, marques, codes techniques non rendus et données utilisateur ne sont pas des chaînes i18n.

Le changement de langue doit produire une interface cohérente après le mécanisme de persistance/refresh prévu par l'application. Une page moitié FR moitié EN est une régression.

## 13. Contrat mobile, responsive et gestes

Toute modification UI matérielle respecte `docs/RESPONSIVE_UI_CONTRACT.md` et les `AGENTS.md` scoped.

Les largeurs minimales de recette sont : **320, 360, 375, 390, 414, 768 et 1024 px**.

Vérifier lorsque la surface est concernée :

- absence de scroll horizontal global ;
- titres, boutons, identifiants et badges non coupés ;
- barre de navigation ne masquant pas le contenu ;
- clavier mobile et safe areas ;
- PWA standalone ;
- clair/sombre ;
- FR/EN ;
- empty/loading/error states ;
- interactions tactiles.

Les navigations gestuelles ne doivent jamais intercepter un geste démarré dans un formulaire, un contrôle, un dialog, un éditeur, un carrousel ou un rail horizontal. Les zones de bord réservées au navigateur/système sont protégées.

Une navigation primaire ne doit pas être dupliquée simultanément dans deux barres mobiles sans justification produit explicite.

## 14. QA visuelle et E2E — un grep ne voit pas un bouton cassé

Les audits statiques restent utiles pour protéger un contrat de code, mais ils ne constituent pas à eux seuls une validation visuelle.

Une PR `area:ui`, `area:ux` ou `area:mobile` avec impact matériel doit fournir :

1. une QA automatisée du contrat lorsque celui-ci est automatisable ;
2. une validation rendue navigateur/E2E des parcours visuellement critiques ;
3. les largeurs/langues/thèmes pertinents ;
4. une preuve attachée à la PR/Issue selon la matrice de preuves.

Un test qui vérifie seulement qu'une classe existe ne prouve pas qu'un bouton tient réellement sur 320 px. À l'inverse, un screenshot isolé ne remplace pas les contrôles d'accès ou la QA structurelle. Les deux niveaux se complètent.

Pour un changement de shell/navigation mobile, l'E2E doit couvrir au minimum : Chrome/Samsung Internet compatible, PWA si applicable, swipe/scroll, changement de contexte, contenu long et clavier si un formulaire est impliqué.

## 15. Performance et coût transverse

Une contribution ne doit pas ajouter silencieusement du travail global à chaque page privée.

Toute nouvelle requête, subscription, polling, timer ou provider monté dans `AppShell`, layout racine, middleware ou composant global doit documenter :

- pourquoi le niveau global est nécessaire ;
- fréquence et déclencheurs ;
- coût approximatif et bornes ;
- comportement en arrière-plan ;
- stratégie d'échec/fallback ;
- alternative locale évaluée.

Un polling plus fréquent ne doit jamais être utilisé pour masquer l'absence de synchronisation sans Issue/plan de convergence.

Les listes et agrégats restent paginés/bornés. Ne pas charger plus de données « au cas où ».

## 16. Documentation

La documentation est modifiée dans la même contribution que le contrat qu'elle décrit.

Mettre à jour selon le scope :

- documentation technique ;
- contrat métier/domaine ;
- guide utilisateur FR/EN ;
- changelog ;
- checklist QA/E2E ;
- runbook/rollback si l'exploitation change.

Une documentation décrivant une fonctionnalité non livrée est une dette documentaire et n'est pas acceptée.

## 17. Production

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

## 18. Rollback

Toute PR matérielle doit expliquer comment revenir au dernier état sain.

Un rollback ne consiste pas à réécrire `main`. Utiliser une PR/hotfix traçable ou le mécanisme de rollback Production autorisé, puis documenter la preuve.

Une migration additive peut parfois rester physiquement présente lors d'un rollback applicatif ; cette décision doit être explicitée au lieu d'inventer un rollback destructif.

## 19. Règles particulières pour les agents IA

Les agents IA suivent exactement le même contrat que les humains.

Ils doivent notamment :

- lire `AGENTS.md` et `docs/CONTRIBUTING.md` avant d'écrire ;
- inspecter le dernier `main` réel ;
- ne pas supposer qu'une branche historique est à jour ;
- ne pas inventer qu'un test, build, migration, E2E ou déploiement a réussi ;
- remplir honnêtement la matrice de preuves ;
- distinguer clairement preuve exécutée, inspection statique et hypothèse ;
- préférer une nouvelle branche propre depuis `main` lorsqu'une ancienne branche est fortement divergente ;
- ne jamais fusionner une PR dont les gates requis sont rouges ou dont le contrat de l'Issue n'est pas satisfait ;
- ne pas cacher une limitation d'outil derrière une formulation ambiguë.

Une limitation d'outil ou de réseau n'autorise pas à déclarer une étape réussie. Dans ce cas, la preuve CI/Production doit être attendue ou l'étape marquée explicitement `NOT_EXECUTED`.

## 20. Checklist contributeur

### Avant de coder

- [ ] J'ai lu `AGENTS.md` et les fichiers scoped applicables.
- [ ] J'ai lu `docs/CONTRIBUTING.md`.
- [ ] J'ai identifié l'Issue à traiter.
- [ ] J'ai vérifié le dernier SHA de `main`.
- [ ] Ma branche respecte le format officiel.
- [ ] Mon scope est clair et borné.
- [ ] J'ai identifié les contrats impactés : sécurité, données, i18n, UI, mobile, performance, documentation.

### Avant d'ouvrir la PR

- [ ] Le diff par rapport au dernier `main` ne supprime rien d'inattendu.
- [ ] Mes commits sont Conventional Commits.
- [ ] Les migrations historiques sont intactes.
- [ ] Les QA ciblées et générales applicables ont été exécutées ou sont explicitement `NOT_EXECUTED` en attente de CI.
- [ ] J'ai documenté sécurité, multi-tenant, migrations, risques et rollback.
- [ ] J'ai rempli **Dette créée / maintenue / remboursée / reportée**.
- [ ] Toute dette reportée est liée à une Issue.
- [ ] J'ai rempli la matrice de preuves sans présenter une inspection comme une exécution.
- [ ] Si UI : j'ai vérifié i18n, tailles mobiles, actions, dark mode et accessibilité applicables.
- [ ] Si shell/global : j'ai vérifié le coût des requêtes/pollings/subscriptions ajoutés.
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
- [ ] Les E2E requis sont réellement verts/confirmés, pas simplement prévus.
- [ ] Aucune conversation de review bloquante ne reste ouverte.
- [ ] Le diff final contre le dernier `main` est toujours cohérent avec l'Issue.
- [ ] Aucune nouvelle dette silencieuse n'a été introduite depuis la première review.

### Après merge

- [ ] Le SHA de `main` est le SHA attendu.
- [ ] Le déploiement Vercel Production du SHA attendu est READY lorsque requis.
- [ ] Les preuves sont attachées à l'Issue/PR.
- [ ] La Release est créée lorsque le workflow de livraison l'exige.
- [ ] L'Issue n'est fermée qu'après satisfaction de ses critères d'acceptation.
- [ ] Toute Issue de dette explicitement reportée reste ouverte et traçable.

## 21. Règle de décision

Quand deux chemins sont possibles, choisir celui qui préserve le mieux :

1. l'intégrité du dernier `main` ;
2. la sécurité et l'isolation multi-tenant ;
3. une seule source de vérité ;
4. l'absence de dette silencieuse ;
5. la traçabilité ;
6. la reproductibilité des migrations, tests et builds ;
7. la capacité de rollback ;
8. l'i18n, le responsive et l'accessibilité ;
9. la lisibilité du diff ;
10. la simplicité de la future maintenance.

Une PR rapide mais difficile à auditer coûte plus cher qu'une PR propre. La gouvernance existe précisément pour éviter de transformer la livraison en séance d'archéologie Git — ou en collection de petites dettes devenues soudain très grandes.
