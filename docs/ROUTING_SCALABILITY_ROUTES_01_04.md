# ROUTES-01 à ROUTES-04 — Scalabilité du routage DTSC Platform

**Date** : 13 novembre 2026 · **Issue** : #1135 · **Version candidate** : v1.17.0 · **Statut** : PR, PAS EN PRODUCTION.

## Preuve et contexte exact

- Déploiement main v1.16.1 `dpl_4ZDFFtdXs2Q17qVoiUbFRQBrbrUY` : **READY**.
- Incident historique avant hotfix #1134 : Vercel `too_many_routes`, 2 064 règles pour une limite 2 048.
- Inventaire git origin/main pré-changement : **100 pages et 815 fichiers route.ts**, dont **814 routes API** et **545 routes API entreprise**.
- **Le compte de fichiers n'est PAS le compte de règles Vercel**. Les routes générées, les matchers, redirects, rewrites, filesystem et fonctions peuvent se multiplier. Le endpoint de *Project Routes* Vercel décrit une autre couche de routage et ne permet pas de déduire le compte du déploiement.
- Aucune assertion d'un nombre exact de règles après fusion n'est autorisée sans `.vercel/output/config.json` du build correspondant ou diagnostic fournisseur vérifié.

## ROUTES-01 — inventaire, garde-fous et observabilité

- `scripts/qa-routes-scalability.mjs` : compte les fichiers pages/routes, répartit les API par domaine et publie `artifacts/routing/route-budget.json`.
- Si un build fournit `.next/server/app-paths-manifest.json` / `.next/routes-manifest.json`, leurs totaux sont ajoutés sous **NEXT_BUILD_ONLY**, distincts des règles réelles Vercel.
- Si `.vercel/output/config.json` existe, le script compte explicitement `routes.length` sous **VERCEL_OUTPUT_CONFIG**, sans transformer cela en une affirmation d'activation Production.
- Référence historique : `docs/routing/route-budget-baseline.json`. Garde de cette phase : au moins 40 fichiers routables supprimés et plafond de 900 après consolidation, validés en CI Quality.
- Une nouvelle augmentation de surface au-delà du budget exige une consolidation supplémentaire et une mise à jour documentée du budget, pas un contournement des tests.
- Validation réelle Vercel : après OWNER_E2E, merge `main`, contrôler déploiement `READY` et vérifier absence de `too_many_routes`. Consigner le nombre réel seulement s'il est fourni par le build/fournisseur.

## ROUTES-02 — consolidation progressive des API à URL stable

**Pilote de faible risque** :
- HIRMS : `/api/enterprise/{organizationId}/insurance-connectors/{verify|invoices|invoices/status|ocr|ocr/status}` → un route handler `[...operation]/route.ts`, **cinq anciens handlers inchangés byte-pour-byte** déplacés dans `handler.ts`.
- Exports Console : `/api/admin/exports/{audit|organizations|payments|users}` → un `[dataset]/route.ts`, **quatre handlers inchangés**.
- Le dispatcher possède une allowlist de chemins/méthodes *statique*, pas de chemins importés depuis la requête; les anciennes validations RBAC, tenant, status HTTP, audit, rateLimit, secrets et idempotence restent exécutées dans les handlers originaux.
- Vérification de non-altération : `scripts/qa-routes-dispatch-parity.mjs` compare les SHA git blob SHA-1 de chaque handler original déplacé, contrôle la présence des méthodes, la liste stricte et les routes disparues.

**Deuxième pilote (Gaming)** : 24 routes Gaming et paramètres dynamiques regroupés en un dispatcher statique allowlisté, avec 24 handlers byte-pour-byte immuables, méthodes GET/POST/PATCH/OPTIONS, même contexte `organizationId` et identifiants (`sessionId`, `stationId`, `tournamentId`, etc.).

**Étapes suivantes sans extrapolation** : attaquer une famille de 20–50 endpoints RETAIL, puis Pharmacie, Santé, Gaming et Administration; chaque famille doit disposer de preuves GET/POST/PATCH/DELETE, params dynamiques, multipart, webhooks, E2E navigateur et interdiction des fuites multi-tenant **avant** migration. Ne pas déplacer aveuglément 545 routes API entreprise en une passe, ne pas modifier les contracts HTTP.

## ROUTES-03 — workspaces dynamiques à UI conservée

- Les 14 pages `app/enterprise-modules/FINANCE_*/page.tsx` étaient de simples wrappers, sans logique métier. Elles passent désormais dans **la page dynamique préexistante** `app/enterprise-modules/[moduleCode]/page.tsx`.
- Ce resolver appelle le composant d'origine `EnterpriseFinanceModulePage` avec son `moduleCode` validé par allowlist : **auth, membership, comptabilité, abonnement, permissions, UI 2.0 et liens préexistants identiques**.
- Les chemins imbriqués spécifiques (p. ex. taux de change et périodisation) restent inchangés.
- La prochaine étape du module-driven design sera Gaming/RETAIL, après preuve de parité des composants de page et tests de navigation profonde.
- La suppression d'un `page.tsx` ne supprime ni le code métier, ni les URLs, ni les contrôles d'accès.

## ROUTES-04 — ADR de séparation des builds (préparation uniquement)

**Décision recommandée** : extraire progressivement les **builds**, pas simplement créer des sous-domaines supplémentaires. Aujourd'hui public, `app`, `console`, `account`, `support` partagent encore le même artefact Next.js ; découper le DNS sans découper les artefacts ne libère aucune route Vercel.

Architecture candidate *non déployée* :

```text
dtsc-platform.com / account.dtsc-platform.com / support.dtsc-platform.com
         ↳ web-account-support (projet Vercel séparé)
app.dtsc-platform.com
         ↳ app-erp (projet Vercel séparé)
console.dtsc-platform.com
         ↳ console (projet Vercel séparé)
API interne ERP ou workers
         ↳ services autorisés après extraction, contrats stables
```

**Prérequis obligatoires avant découpage réel** :
1. Libérer les routes critiques dans le monolithe d'abord : ce pilote est le lot 1, pas la migration de production.
2. Paquets partagés versionnés (auth, permissions, Zod, Prisma client), schéma Neon partagé uniquement avec stratégie de migration maîtrisée; surveiller pool de connexions et régions.
3. Cookies SSO `dtsc_session` sur sous-domaines : session globale, révocation/rotation/MFA, `AUTH_COOKIE_DOMAIN`, CSRF, SameSite, redirect allowlist et anti-open redirect ; le backend demeure responsable du RBAC.
4. Frontend → API de préférence même origine via passerelle contrôlée, sinon CORS explicitement autorisé avec credentials et protection CSRF; ni secrets HSL, ni tokens dans le navigateur.
5. Vercel Cron, files, webhooks et signaux LiveKit/Upstash : désigner une **seule** instance propriétaire par tâche pour éviter les doubles traitements; idempotence et observabilité interprojets.
6. Tests E2E cross-subdomain (Account ↔ App ↔ Console ↔ Support), organisation A/B, cookies, déconnexion, documents Health/Pharmacy, factures et caisse.
7. Projets et variables de production séparés après revue, rollback DNS/alias testé, déploiements contrôlés depuis `main` et feature previews désactivées.
8. Extraire un premier produit à faible couplage uniquement lorsque l'inventaire prouve un gain de capacité et que la QA prouve la compatibilité.

**Go/no-go** : décision d'architecture et ADR approuvées, métriques du routage par build, owner E2E complet, preuves migration et rollback. **Aucune modification DNS/Vercel ni extraction réseau par cette PR**.

## Économie comptabilisée dans cette PR

| Famille | Avant | Après | Gain de fichiers de routes |
|---|---:|---:|---:|
| HIRMS child endpoints | 5 | 1 | 4 |
| Exports Console | 4 | 1 | 3 |
| Finance pages wrappers | 14 | 0 (resolver commun existant) | 14 |
| **Total** | **23** | **2** | **44** |

Projection source : 915 → **871**. Ceci **ne représente pas un chiffre Vercel**. Les contrôles CI et la mesure d'un futur déploiement pourront le confirmer/invalider.

## Matrice de validation et rollback

- QA dispatch et budget; TypeScript; lint; Prisma generate; régressions Finance/HIRMS et Console; build; tests navigateur et validation OWNER_E2E.
- Vérifier réponses et méthodes sur les URLs historiques, erreurs 400/401/403/404/405/429, export CSV, auth HSL UAT/Production, non-duplication des transactions, paramètres JSON et historique comptable.
- Rollback PR avant merge : fermer sans fusion. Après merge approuvé : revert coordonné dans `main` en conservant les données/migrations ; Vercel redeploie `main`. Aucune migration Prisma nécessaire.
- Ne pas fusionner avant E2E propriétaire BON ; ne pas déployer de branche.
