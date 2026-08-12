# i18n 1/4 — convergence travail partagé (#266)

## Objectif

Réduire la dette i18n historique des surfaces de collaboration, Activités et Calendrier en réutilisant le moteur canonique DTSC, sans modifier les règles métier, les permissions, le multi-tenant, les appels, les accusés de lecture ou la persistance.

## Baseline

Branche créée depuis `main@90f64a49966c7feb897437245f11f3903adc9277` le 12 août 2026.

## Contrat de traduction

Le domaine partagé utilise désormais `locales/shared-work.fr.json` et `locales/shared-work.en.json`, enregistrés dans `lib/i18n.ts` et exposés par `translateSharedWork(...)`.

Ce mécanisme suit le contrat déjà utilisé par les dictionnaires de domaine Finance et Procurement : un seul module i18n canonique choisit la locale et applique le fallback FR. Les composants ne créent pas de dictionnaire local parallèle.

## Premier lot convergé

- `components/activities/entity-comments-thread.tsx`
  - copies commentaires centralisées ;
  - suppression des ternaires FR/EN locaux ;
  - date visible via `formatUserDateTime(...)`.
- `components/collaborators/collaborators-immersive-conversation-shell.tsx`
  - action flottante Ajouter un contact / Add a contact centralisée.
- `components/collaborators/contact-discovery-workspace.tsx`
  - recherche, invitations, erreurs, empty states et libellés d’accessibilité centralisés.
- `components/collaborators/collaboration-meeting-message-content.tsx`
  - réunion planifiée, join, suivi, compte-rendu et erreurs centralisés.
- `components/calendar/unified-work-calendar-panel.tsx`
  - titres, filtres, sources, recherche, empty state et action source centralisés ;
  - format de date et normalisation de recherche basés sur `userLocale(...)`.

## QA

`scripts/qa-shared-work-i18n-convergence.mjs` vérifie :

- parité stricte des clés FR/EN ;
- valeurs non vides ;
- enregistrement dans `lib/i18n.ts` ;
- absence des ternaires/locales codées en dur sur les fichiers déjà convergés ;
- utilisation effective des helpers i18n/date canoniques.

La QA est ajoutée à `scripts/run-regression-qa-ci.mjs` afin de devenir opposable dans les Quality Gates.

## Frontières de sécurité

Aucun endpoint, schéma Prisma, membership, `organizationId`, RBAC, entitlement, règle d’appel, règle de groupe, mécanisme de mention ou accusé de lecture n’est modifié.

## État de la vague

Ce premier lot ne ferme pas encore #266. Les gros workspaces actifs (`activities-dashboard-v3`, `work-prestations-panel-v2`, `collaborators-conversation-workspace`, calendrier professionnel et planning DTSC) gardent encore une dette historique à converger. La PR reste donc en draft tant que le périmètre de l’Issue et l’E2E FR/EN mobile + desktop ne sont pas réellement prouvés.

## E2E propriétaire à exécuter avant clôture

- Commentaires Activités : FR → EN → FR, création/réponse/modification/suppression autorisée ;
- Mes Collaborateurs : action Ajouter un contact, recherche, invitation, acceptation/refus ;
- Réunion dans une conversation : état planifié, rejoindre, suivi, compte-rendu ;
- Calendrier : recherche, filtres sources, date/heure et deep link source ;
- mobile et desktop ;
- absence de mélange FR/EN ;
- aucune régression permissions/tenant.

## Rollback

Revert applicatif de la PR. Aucune migration ni restauration de données n’est nécessaire.
