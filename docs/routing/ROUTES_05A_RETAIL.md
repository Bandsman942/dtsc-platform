# ROUTES-05A — Premier lot Retail à URL stable

Issue #1145, parent #1140. Candidat v1.17.2, **NON FUSIONNÉ / NON DÉPLOYÉ**.

## Baseline livrée et mesures

La [Release v1.17.1](https://github.com/Bandsman942/dtsc-platform/releases/tag/v1.17.1), son tag, main et [Vercel Production READY](https://vercel.com/bandsmans-projects/dtsc-platform/8pNrCAn2zxEKzPCX8PRYpoFaZjnZ) portent tous `101e903abe2c8ce5f6c4428c1ee6315f2202cfe6` (correctif catalogue #1144). La branche Retail a été actualisée après cette fusion concurrente ; son incrément PATCH devient donc v1.17.2. La livraison précédente [v1.17.0 / #1136](https://github.com/Bandsman942/dtsc-platform/releases/tag/v1.17.0), `6fe0f09e7e406e46c51370ab22d8c88163208d3e`, reste incluse dans cette base ; son tree Git testé était `c72e9d545c71ee96bf5956a9682c929e3d74fb79`.

L’inventaire exécuté sur cette baseline compte 86 pages, 785 handlers et **871 fichiers routables**, dont **92 API Retail**. Les règles CI s’appliquent ensemble : plafond source 900 et au moins 40 fichiers libérés depuis la baseline historique 915. Le plafond effectif est donc `min(900, 915 − 40) = 875`, soit **4 ajouts source possibles**, et non 29.

| Famille déplacée | Avant | Après | Gain |
|---|---:|---:|---:|
| Sous-routes des factures, paiements et retours | 14 | 1 | 13 |
| Commandes et retours omnicanaux | 7 | 1 | 6 |
| Catalogue tarifaire, conditions et simulation | 3 | 1 | 2 |
| Total | 24 | 3 | 21 |

Après consolidation : **850 fichiers routables**, dont **71 API Retail** ; économie cumulée 65 depuis la baseline historique 915 ; marge source effective **25**, sans desserrer aucun garde-fou. La collection `/retail/invoices` reste une route autonome inchangée.

**Ces chiffres ne sont pas des règles Vercel.** La limite fournisseur du programme est 2048 règles ; son occupation exacte et sa marge restent inconnues sans `.vercel/output/config.json` du build correspondant ou diagnostic fournisseur explicite. Le nouveau rapport conserve `rules: null` et `remainingRules: null` en l’absence de cette preuve. READY confirme l’acceptation du déploiement précédent, pas une quantité précise.

## Contrat HTTP et sécurité

La matrice exhaustive chemins / verbes / SHA d’origine est `docs/routing/routes-05a-retail-manifest.json`. Chaque `route.ts` du pilote devient un `handler.ts` de contenu Git identique. Les trois nouveaux fichiers `[...operation]/route.ts` effectuent exclusivement une sélection explicite de chemin et de méthode avec import littéral : aucun import construit depuis une requête, proxy, CRUD ou accès Prisma générique.

- Les URI, méthodes GET/POST, paramètres `organizationId`, `invoiceId`, `paymentId`, `requestId`, `orderId`, `returnId`, query strings et flux Request/Response sont transmis aux gestionnaires originaux.
- L’authentification, le contexte actif, membership, module, entitlement, permissions, visibilité, same-origin, Zod, rate limit, services financiers/inventaire, transactions, audit et idempotence demeurent dans les handlers d’origine.
- Les réponses métier et erreurs originales sont retournées sans interception : 200/201/202/204, erreurs de saisie, 401/403/404/409/413/422/429/503 selon l’API existante. Les exports/impressions conservent leur type et leurs en-têtes.
- Les chemins de la liste qui reçoivent un verbe non autorisé répondent 405 avec leur Allow propre ; OPTIONS répond 204 et expose les méthodes propres au chemin. PATCH/PUT/DELETE passent par la sélection fermée sans pouvoir appeler un gestionnaire métier ; Next.js conserve HEAD automatique et les tests HTTP vérifient son corps vide.
- Les formes inconnues répondent 404 pour les sept méthodes HTTP Next.js, et les segments statiques encodés ne deviennent pas plusieurs segments. Les tests utilisent aussi le vrai mécanisme automatique de méthodes Next.js pour éviter le repli 405 d’une méthode non exportée. Un identifiant dynamique décodé reste transmis à son handler d’origine, qui garde sa validation et ses refus d’accès.
- Aucun schéma Prisma, migration, paramètre applicatif, secret, cookie, webhook, UI ou permission commerciale ne change.

## Preuves à exécuter

`pnpm qa:routing-scalability` conserve les preuves #1135 et ajoute : 24 SHA de handlers, racine invoices intacte, budget effectif et exécution des trois vrais dispatchers avec seules les frontières des handlers remplacées. Le test couvre les identifiants dynamiques, priorité des chemins littéraux, JSON/multipart, statuts, identité des flux, erreurs originales et refus de méthodes/chemins.

`node scripts/qa-routes-retail-build.mjs --require-build`, après `pnpm build`, exige les trois traces Next `.nft.json`, publie le nombre de fichiers et leur poids dédupliqué dans `artifacts/routing/retail-functions-1145.json`. L’option ponctuelle `--require-pilot-counts` contrôle le résultat exact 850 / 71 / 25 pour cette PR ; le contrôle permanent conserve le budget partagé et autorise donc les futurs ajouts dans la marge disponible. Il distingue **NEXT_TRACE_SOURCE_BYTES** de la taille finale ZIP Vercel. Les cold starts et P95 Production restent **NOT_EXECUTED** ; la latence du test HTTP local ne les remplace pas.

`pnpm qa:routing-retail-http` exécute des requêtes HTTP sans moteur de navigateur, uniquement avec `E2E_ROUTING_RETAIL_ISOLATED=true`, un host local et une base locale dédiée Shop 2. La suite vérifie les 24 endpoints × sept méthodes, paramètres encodés, chemins inconnus, racine conservée, protection same-origin, refus tenant étranger et lectures Retail autorisées avec le seed canonique. Les sessions restent en mémoire ; aucun cookie ou mot de passe n’est écrit dans le rapport.

Les preuves CI sont publiées en artefacts `routes-01-build-budget` et `routes-05a-retail-http`. La suite HTTP partage les fixtures isolées du workflow Shop 2 ; son Redis jetable est remis à zéro ensuite, selon la convention déjà présente, pour ne pas consommer le quota d’authentification des recettes suivantes. Le contrat `qa-ci-auth-rate-limit-provisioning` contrôle cet ordre supplémentaire, les six resets exacts et les nouveaux déclencheurs de chemins ; il conserve les cinq séparations historiques et l’exécution unique de chaque ancienne spec. Les contrôles historiques ne sont ni retirés ni neutralisés. Les anciennes QA de source ciblent désormais le contenu inchangé `handler.ts` plutôt que son ancien emplacement routable.

## Checklist de revue et livraison

- [ ] Diff et index propres, 24 renommages sans changement de contenu.
- [ ] Prisma generate, type-check, lint, QA ciblée, régression générale, build et traces de fonctions vérifiés sur le SHA de la PR.
- [ ] Tests HTTP locaux isolés prouvés en CI et conversations de revue résolues.
- [ ] Mesures source et preuves fournisseur distinctes, sans chiffre inventé de règles Vercel.
- [ ] Validation propriétaire spécifique à #1145 avant toute fusion ; l’accord #1136 ne vaut pas pour ce lot.
- [ ] Aucun contrôle interactif de Production dans un navigateur, conformément à la demande utilisateur ; aucune validation navigateur nouvelle revendiquée.

## Dette, suite et rollback

Aucune source métier parallèle ni nouvelle dépendance applicative. Les autres familles Retail/Pharmacy/Health restent dans #1140 et l’extraction multi-build dans #1141. L’absence de métriques Vercel exactes et de cold start/P95 Production demeure explicitement mesurée comme indisponible, jamais remplacée par une estimation source.

Avant fusion : branche et PR uniquement. Après approbation et fusion autorisée : déploiement natif depuis main, vérification distincte READY/Release. Rollback par revert de la PR avec Quality Gates, sans réécriture de migrations ni modification des données. Aucun déploiement manuel de branche.
