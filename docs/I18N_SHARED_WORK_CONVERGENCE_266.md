# i18n 1/4 — convergence travail partagé (#266)

## Objectif

Réduire la dette i18n historique des surfaces Collaboration, Activités et Calendrier en réutilisant le moteur canonique DTSC, sans modifier les règles métier, les permissions, le multi-tenant, les appels, les accusés de lecture, les conflits calendrier ou la persistance.

## Découpage vérifiable

L’audit du 12 août 2026 a montré que Collaboration + Activités + Calendrier formaient une vague trop large pour une seule PR opposable. Le parent #266 est donc exécuté en deux lots sans réduire sa définition de terminé :

- **#272 — i18n 1A** : collaboration partagée, Activités DTSC et agenda de travail unifié ;
- **#273 — i18n 1B** : dialogues Collaborateurs legacy restants et convergence profonde des surfaces Calendrier.

La PR #271 livre #272 uniquement. #266 reste ouverte après #272 et ne devient clôturable qu’après #273 et l’OWNER_E2E FR↔EN complet.

## Baseline

Branche #271 créée depuis `main@90f64a49966c7feb897437245f11f3903adc9277` le 12 août 2026.

## Contrat de traduction

Les copies du lot 1A utilisent trois dictionnaires de domaine raccordés à `lib/i18n.ts` :

- `locales/shared-work.fr.json` / `shared-work.en.json` ;
- `locales/collaboration-experience.fr.json` / `collaboration-experience.en.json` ;
- `locales/activities.fr.json` / `activities.en.json`.

`lib/i18n.ts` reste l’unique moteur de sélection de locale et de fallback. `lib/collaboration-experience-i18n.ts` est désormais un adaptateur vers ce moteur au lieu d’héberger un dictionnaire parallèle.

## Lot #272 convergé

### Activités DTSC

- `components/activities/entity-comments-thread.tsx`
  - copies commentaires centralisées ;
  - suppression des ternaires FR/EN locaux ;
  - date visible via `formatUserDateTime(...)`.
- `components/activities/activities-dashboard-v3.tsx`
  - en-tête, métriques, filtres, Kanban, actions et empty states localisés ;
  - statuts/priorités via `formatEnumLabelForLocale(...)` ;
  - recherche/tri via `userLocale(...)`.
- `components/activities/work-prestations-panel-v2.tsx`
  - Prestations hebdomadaires et Historique localisés ;
  - dates locale-aware ;
  - valeurs historiques persistées de `locationMode` conservées exactement (`Site DTSC`, `Télétravail`, `Hybride`, `Externe`, `Mission`, `Non défini`) ;
  - seule leur projection d’affichage est traduite.

### Collaboration

- `components/collaborators/collaborators-immersive-conversation-shell.tsx`
  - action flottante Ajouter un contact / Add a contact centralisée.
- `app/collaborators/contacts/new/page.tsx`
  - page d’ajout de contact localisée.
- `components/collaborators/contact-discovery-workspace.tsx`
  - recherche, invitations, erreurs, empty states et ARIA centralisés.
- `components/collaborators/collaboration-meeting-message-content.tsx`
  - réunion planifiée, join, suivi, compte-rendu et erreurs centralisés.
- `components/collaborators/group-presence-journal-dialog.tsx`
  - filtres, métriques, statuts et messages localisés.
- `lib/collaboration-experience-i18n.ts`
  - dictionnaire parallèle supprimé au profit de `lib/i18n.ts`.
- `components/collaborators/collaborators-conversation-workspace.tsx`
  - contrat principal `collaborationExperienceT(...)` conservé mais désormais alimenté par le moteur canonique ;
  - certains dialogues legacy internes restent volontairement suivis par #273 et ne sont pas déclarés terminés dans #272.

### Calendrier — périmètre 1A

- `components/calendar/unified-work-calendar-panel.tsx`
  - titres, filtres, sources, recherche, empty state et action source centralisés ;
  - dates et recherche basées sur `userLocale(...)`.

Les surfaces `internal-calendar-workspace-v2`, `dtsc-work-schedule-panel`, `calendar-advanced-tools-panel` et wrappers associés sont explicitement reportées à #273.

## QA

`scripts/qa-shared-work-i18n-convergence.mjs` vérifie notamment :

- parité stricte et valeurs non vides des dictionnaires FR/EN ;
- enregistrement dans `lib/i18n.ts` ;
- absence de ternaires/locales codées en dur sur les fichiers déclarés convergés ;
- utilisation des helpers i18n/date/enum canoniques ;
- conservation des valeurs persistées de mode de travail ;
- délégation de `collaborationExperienceT(...)` vers le moteur canonique.

La QA est intégrée à `scripts/run-regression-qa-ci.mjs`.

Les QA historiques `qa-standard-work-coordination-checks.mjs`, `qa-assistant-ux-checks.mjs` et l’audit `audit-iteration-07-i18n-contract.mjs` ont été rendus translation-aware : ils vérifient les clés/dictionnaires canoniques plutôt que d’exiger des phrases françaises dans le JSX. Le reliquat de dialogues Collaborateurs de #273 reste signalé explicitement comme dette ouverte, pas comme surface terminée.

## Frontières de sécurité

Aucun endpoint, schéma Prisma, membership, `organizationId`, RBAC, entitlement, règle d’appel, règle de groupe, mention, accusé de lecture, conflit calendrier ou workflow de validation de prestation n’est modifié.

## Preuves automatiques

La preuve finale doit être prise sur le SHA exact de #271. Les runs intermédiaires qui ont échoué ont servi à identifier des QA historiques incompatibles avec la convergence ; aucun hardcoding n’a été réintroduit pour les satisfaire.

Au moment de cette mise à jour :

- Quality Gates #3773 est lancée sur `0ce0db460f708638aef4d1615ea354c480a81941` ;
- Delivery governance y est déjà passée ;
- les résultats Migration/Quality doivent être consignés dans la PR une fois terminés.

## E2E propriétaire requis pour #272

- Commentaires Activités : FR → EN → FR, création/réponse/modification/suppression autorisée ;
- Activités DTSC : filtres, Kanban, statuts et actions en FR/EN ;
- Prestations : semaine courante + historique + formulaire, sans changement des données persistées ;
- Mes Collaborateurs : Ajouter un contact, recherche, invitation, acceptation/refus ;
- Réunion dans une conversation : état planifié, rejoindre, suivi, compte-rendu ;
- Journal des connexions : filtres et statuts ;
- Agenda unifié : recherche, filtres sources, date/heure et deep link source ;
- mobile et desktop ;
- absence de mélange FR/EN sur les surfaces #272 ;
- aucune régression permissions/tenant.

## Rollback

Revert applicatif de la PR #271. Aucune migration ni restauration de données n’est nécessaire.
