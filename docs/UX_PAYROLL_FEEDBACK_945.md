# UX-03B — Contrat de feedback des validations de paie CEO/COO (#945)

Statut : PR de certification avant fusion. Périmètre pilote de [#938](https://github.com/Bandsman942/dtsc-platform/issues/938).

## Objectif métier

Une réponse HTTP refusée ou un échec réseau ne peut jamais se présenter comme une validation financière réussie. Les approbateurs CEO et COO reçoivent un retour clair dans la langue active.

## Source de vérité

- API CEO : `app/api/admin/ceo/payroll-approvals/[id]/review/route.ts`.
- API COO : `app/api/admin/coo/payroll-approvals/[id]/review/route.ts`.
- Workspace commun : `components/admin/payroll-approval-panel.tsx`.
- Feedback canonique : `useToastMessage` avec un `ToastNotice` à tonalité explicite.
- Traductions : `locales/fr.json` et `locales/en.json`, bloc `payrollWorkflow`.

Le succès exige **HTTP 2xx et `{ ok: true, payroll }`**. Un body vide, un JSON erroné ou une erreur ne ferme pas le dialogue. Chaque refus réémet un nouvel avis ; la décision et le commentaire restent saisis.

## Erreurs humaines

- 401 : session expirée ; demander reconnexion.
- 403 : permission insuffisante.
- 409 : état du dossier changé ; actualiser la liste.
- 429 : trop de tentatives ; recommencer plus tard.
- 400/422 : décision invalide.
- >=500 : indisponibilité du service, sans afficher de diagnostic interne.
- Échec réseau : vérifier la connexion.
- Réponse 2xx sans confirmation : réponse inattendue, sans faux succès.

Les réponses et décisions serveur, les permissions, l'audit, les règles d'approbation et les transactions financières **ne changent pas**.

## Vérifications

1. QA statique ciblée : `node scripts/qa-hotfix-945-payroll-feedback.mjs` (Quality Gates de PR).
2. CI : TypeScript, régression canonique, lint, build et gouvernance.
3. OWNER_E2E requis : CEO approuve une paie autorisée ; COO approuve une paie CEO autorisée ; refus permissions et conflit 409 ; 429 ; réseau hors ligne ; répétition du même refus ; vérification dialogue et commentaire conservés, FR/EN, thèmes, 320/390/1440.
4. Vérifier la déduplication/idempotence de la transaction réelle d'approbation et l'audit côté API, sans manipuler de données clients privées.

## Rollback et limites

Revert applicatif ciblé du commit #945 ; aucune migration Prisma, backfill, variable d'environnement, entitlement ou accès tenant n'est introduit. L'ancienne inférence textuelle utilisée par d'autres interfaces subsiste jusqu'à migration sûre, suivie dans #938.

## Suite

Migrer par petits lots les validations Finance/Caisse, Retail/Gaming, CRM puis Health/Pharmacy, avec un contrat d'erreur HTTP par domaine, tests E2E et suppression du fallback regex seulement une fois tous les consommateurs migrés.
