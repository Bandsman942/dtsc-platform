# PR #1136 — E2E final propriétaire

Statut propriétaire : **NOT_EXECUTED — « E2E final BON » non reçu**.

PR : https://github.com/Bandsman942/dtsc-platform/pull/1136

## Environnement et preuves

La branche `feat/1135-routes-scalability-01-04` est une candidate v1.17.0, sans Preview ni déploiement manuel. La Production ne permet donc pas de valider le code de cette branche avant fusion. Ne pas présenter son URL comme une Preview de cette PR.

Le workflow **Gaming Lounge #646 commercial readiness** construit la branche, applique les migrations à une base PostgreSQL jetable et charge le seed ERP canonique. L’étape **ROUTES-02/03 historical HTTP and Finance browser acceptance** publie son rapport HTML dans l’artefact **routes-1135-e2e** du run associé au SHA courant de la PR. Télécharger cet artefact pour consulter `playwright-report/index.html` et les éventuelles captures/traces d’échec. Ce rapport automatique ne remplace pas la recette du propriétaire.

Pour reproduire : Node 22, pnpm 10.6.2, base PostgreSQL/Redis exclusivement de test, variables du workflow, `pnpm install --frozen-lockfile`, `pnpm prisma:generate`, `pnpm prisma:deploy`, seed `scripts/seed-erp-professional-e2e.mjs`, `pnpm type-check`, `pnpm lint`, `pnpm qa:regression`, `pnpm qa:routing-scalability`, `pnpm build`, puis `pnpm start`. Exécuter ensuite :

```sh
E2E_ROUTING_1135_ISOLATED=true pnpm exec playwright test tests/e2e/issue-1135-routing-scalability.spec.mjs --workers=1
```

Ce test exige une application locale isolée. Il n’appelle pas HSL ni ne soumet de données de santé réelles. Les comptes et mots de passe de fixtures ne sont jamais des comptes Production.

## Couverture automatique

- Intégrité des 33 handlers d’origine, y compris sous checkout Windows.
- Contrat exécutable de 47 délégations : méthode, tenant, chaque ID, query string, headers, signal, corps JSON/multipart non consommé et réponse originale.
- HTTP réel : GET/HEAD/POST/PATCH/PUT/DELETE/OPTIONS pour les 33 URL API historiques ; refus 401, 403, 404, 405 ; OPTIONS et Allow par endpoint lorsque le middleware autorise la requête.
- Refus des chemins inconnus, surnuméraires et séparateurs HIRMS encodés ; refus same-origin et inter-tenant ; aucun accès Console accordé au propriétaire d’un tenant client.
- Les 14 liens Finance affichent leur workspace d’origine avec le propriétaire du tenant de test. Finance overview est contrôlé à 320, 360, 375, 390, 414, 768 et 1024 px.
- Un module Finance désactivé et un membership retiré ne permettent pas de rouvrir le lien profond ; les fixtures sont restaurées dans `finally` et les mutations de test exigent la base locale dédiée `dtsc_gaming_646_acceptance`.
- Les suites Gaming existantes conservent les parcours métier, états, factures, paiements et idempotence.

## Parcours à confirmer manuellement

Exécuter sur le build local du **SHA courant** avec des données synthétiques. Indiquer le SHA, l’environnement, le rôle et le résultat pour toute anomalie.

| Parcours | Attendu | Résultat propriétaire |
|---|---|---|
| Finance : ouvrir les 14 URL `FINANCE_*` listées dans `tests/fixtures/routing-1135.mjs`, revenir par la navigation et suivre les liens profonds | Même workspace, URL et permissions ; aucun écran générique substitué | NOT_EXECUTED |
| Finance : membre non autorisé, membre retiré, module désactivé et dépendance/plan refusé | Aucune donnée ni action privée accessible ; refus serveur conservé | NOT_EXECUTED |
| Finance : FR/EN, clair/sombre, clavier, sept largeurs, formulaires et listes longs | Aucun débordement global ; focus, dialogues, navigation et libellés conservés | NOT_EXECUTED |
| Gaming : stations/candidates, sessions, bookings, pricing/simulate, checkouts/receipt, daily-closes, tournaments/registrations/stations, dashboard/onboarding/reports | Paramètres dynamiques corrects, états métier et permissions conservés ; une opération idempotente ne crée aucun doublon | NOT_EXECUTED |
| Console : quatre exports audit/organizations/payments/users avec administrateur interne autorisé et rôle sans capacité | CSV filtré, borné, audité et protégé ; aucun export pour un tenant client | NOT_EXECUTED |
| HIRMS : verify, invoices, invoices/status, ocr, ocr/status, filtres/historiques CSV, multipart et erreurs | Méthodes et paramètres conservés ; permissions, audit, pagination, 400/429 et isolation tenant inchangés | NOT_EXECUTED |
| HIRMS : séparation UAT/Production | Aucune activation ou émission HSL Production par cette recette ; utiliser uniquement un environnement de test explicitement autorisé pour un éventuel test externe | NOT_EXECUTED |
| Budget de routage | 915 → 871 fichiers source, gain 44 ; aucune affirmation du nombre exact de règles Vercel | NOT_EXECUTED |

## Décision finale

Consigner les résultats et les anomalies dans la PR. **Aucune fusion vers `main`, aucun déploiement manuel ni promotion commerciale avant la confirmation explicite du propriétaire « E2E final BON ».**

Après accord et fusion autorisée uniquement : vérifier séparément le SHA Production, Vercel READY, l’absence de `too_many_routes` et les smoke tests. Le nombre exact de règles Vercel demeure non vérifié tant qu’aucun artefact fournisseur correspondant ne le prouve.
