# i18n 1/4 — convergence travail partagé (#266)

## Objectif

Réduire la dette i18n historique des surfaces Collaboration, Activités et Calendrier en réutilisant le moteur canonique DTSC, sans modifier les règles métier, les permissions, le multi-tenant, les conflits calendrier ou la persistance.

## État vérifié

- **#272 — i18n 1A** : terminé via PR #271, OWNER_E2E confirmé et Production READY sur `main@98eedfb4712924e7410f9164cd4ff298532e5036`.
- **#273 — i18n 1B** : ouvert ; parent des sous-lots Calendrier profond et dialogues Collaborateurs.
- **#275 — i18n 1B-a** : terminé via PR #274, OWNER_E2E confirmé et Production READY sur `main@75859ce83c2a24167828b7802ee737ecfe2a1293`.
- **#276 — i18n 1B-b** : en cours sur le Calendrier interne et les outils avancés. CI, OWNER_E2E et Production restent `NOT_EXECUTED` jusqu’à preuve réelle.
- **#277 — i18n 1B-c** : reste à exécuter pour les dialogues Collaborateurs résiduels.

#266 reste ouverte jusqu’à la fin de #273 et de son OWNER_E2E FR↔EN mobile + desktop.

## Contrat de traduction

`lib/i18n.ts` reste le moteur canonique de sélection de locale et de fallback. #272 utilise `shared-work`, `collaboration-experience` et `activities`. #275 a ajouté `calendar-schedule`. #276 ajoute `calendar-workspace` pour le Calendrier interne et ses outils avancés.

Aucun composant migré ne doit recréer un dictionnaire FR/EN parallèle. Les données métier saisies par l’utilisateur ne sont jamais traduites automatiquement. Les valeurs persistées peuvent être projetées par un libellé localisé, mais leur valeur envoyée aux APIs reste inchangée.

## #275 — i18n 1B-a : terminé

Le planning personnel/équipe a été convergé : jours de semaine locale-aware, types d’exception et modes de travail localisés, formulaires disponibilité/exception/absence et vue équipe lecture seule.

Les valeurs persistées `Non défini`, `Site DTSC`, `Télétravail`, `Hybride`, `Externe`, `Mission`, les codes d’exception, les endpoints `/api/calendar/availabilities` et `/api/calendar/exceptions`, le RBAC, le tenant et l’ownership sont restés inchangés.

Preuves : Quality Gates #3779, OWNER_E2E `E2E #274 bon`, merge `75859ce83c2a24167828b7802ee737ecfe2a1293`, Vercel Production READY et Production release #1509 réussie.

## #276 — i18n 1B-b : en cours

Périmètre actif :

- `components/calendar/internal-calendar-workspace-v2.tsx` délègue vers un workspace modulaire canonique ;
- titres, vues, recherche, invitations, disponibilités, détails et formulaire événement ;
- projection localisée des types, priorités, statuts, visibilités, réponses, rôles, modes de travail et récurrences sans mutation des valeurs persistées ;
- dates/heures via locale et fuseau utilisateur ;
- `components/calendar/calendar-advanced-tools-panel.tsx` délègue vers un panneau modulaire ;
- ressources, réservations, calendrier externe et suggestions de créneaux ;
- codes ressources conservés dans les payloads mais remplacés par des libellés métier à l’affichage ;
- threading `locale`/`timezone` depuis `app/calendar/page.tsx` ;
- QA #276 dédiée et QA historique de confirmation adaptée au nouveau chemin actif sans affaiblir le contrôle.

Contrat opposable : endpoints événement/invitation/ressources/réservations/suggestions/intégrations, propriétaire d’événement, acceptation/refus, conflits bloquants, permissions et tenant inchangés. Aucune migration Prisma/donnée.

## #277 — i18n 1B-c : à faire

Après #276 restent les dialogues legacy de `components/collaborators/collaborators-conversation-workspace.tsx`, leurs QA historiques et la validation finale FR↔EN mobile + desktop de #273.

## QA

- `scripts/qa-shared-work-i18n-convergence.mjs` protège #272.
- `scripts/qa-calendar-work-schedule-i18n-275.mjs` protège #275.
- `scripts/qa-calendar-internal-i18n-276.mjs` protège #276 : parité `calendar-workspace` FR/EN, enregistrement dans `lib/i18n.ts`, entrypoints modulaires, absence de formatage `fr-FR` local actif, conservation des valeurs/endpoints, projection des codes ressource et propagation locale/fuseau.
- Les QA livrées sont intégrées à `scripts/run-regression-qa-ci.mjs`.

## Frontières de sécurité

Aucun endpoint, schéma Prisma, membership, `organizationId`, RBAC, entitlement, ownership de réunion, règle de groupe, conflit calendrier ou persistance métier ne doit être modifié par cette vague i18n.

## E2E propriétaire

#276 exigera FR → EN → FR en mobile + desktop sur calendrier personnel/équipe, invitations, disponibilités, événement, ressources et suggestions de créneaux, avec smoke clavier/focus/touch et permissions/tenant/ownership. #277 exigera ensuite son propre E2E, puis #273 recevra une validation finale avant clôture de #266.

## Rollback

Chaque sous-lot est réversible par revert applicatif. Aucune restauration de données ni migration n’est attendue pour la convergence i18n.
