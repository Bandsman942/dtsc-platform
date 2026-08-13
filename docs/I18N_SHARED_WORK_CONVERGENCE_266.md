# i18n 1/4 — convergence travail partagé (#266)

## Objectif

Réduire la dette i18n historique des surfaces Collaboration, Activités et Calendrier en réutilisant le moteur canonique DTSC, sans modifier les règles métier, les permissions, le multi-tenant, les appels, les accusés de lecture, les conflits calendrier ou la persistance.

## État vérifié

- **#272 — i18n 1A** : terminé via PR #271, OWNER_E2E confirmé et Production READY sur `main@98eedfb4712924e7410f9164cd4ff298532e5036`.
- **#273 — i18n 1B** : ouvert ; l’audit réel confirme qu’il doit rester découpé en sous-lots vérifiables avant clôture de #266.
- **#275 — i18n 1B-a** : planning personnel/équipe, exécuté dans la PR draft #274.

#266 reste ouverte jusqu’à la fin de #273 et de son OWNER_E2E FR↔EN mobile + desktop.

## Contrat de traduction

`lib/i18n.ts` reste l’unique moteur de sélection de locale et de fallback. Le lot 1A utilise les dictionnaires canoniques `shared-work`, `collaboration-experience` et `activities`. Le sous-lot #275 ajoute `calendar-schedule` pour le planning Calendrier.

Aucun composant migré ne doit recréer un dictionnaire local parallèle. Les données métier saisies par l’utilisateur ne sont jamais traduites automatiquement.

## Lot #272 livré

### Activités DTSC

- commentaires Activités centralisés et dates locale-aware ;
- Dashboard Activités localisé : métriques, filtres, Kanban, statuts/priorités et actions ;
- Prestations hebdomadaires + historique localisés, avec valeurs persistées `locationMode` strictement préservées.

### Collaboration

- ajout/recherche/invitations de contacts ;
- cartes réunion, rejoindre, suivi et compte-rendu ;
- journal de présence ;
- adaptateur `collaborationExperienceT(...)` raccordé au moteur canonique.

### Calendrier 1A

- agenda de travail unifié : titres, filtres, sources, recherche, empty states et dates locale-aware.

## #273 — découpage d’exécution

L’audit du 13 août 2026 confirme que la convergence profonde restante est encore trop large pour une seule PR vérifiable. #273 reste le parent et est exécutée par sous-lots fermés.

### #275 — i18n 1B-a : planning personnel/équipe

Périmètre :

- `components/calendar/dtsc-work-schedule-panel.tsx` ;
- modularisation technique sous `components/calendar/dtsc-work-schedule/*` ;
- dictionnaires `locales/calendar-schedule.fr.json` / `.en.json` ;
- jours de semaine selon la locale active ;
- projection locale-aware des types d’exception et modes de travail ;
- formulaires de disponibilité, exception et absence ;
- vue équipe en lecture seule.

Contrat opposable :

- les valeurs persistées restent exactement `Non défini`, `Site DTSC`, `Télétravail`, `Hybride`, `Externe`, `Mission` ;
- les codes `ABSENCE`, `ADMINISTRATIVE_ABSENCE`, `OTHER_ABSENCE`, `LEAVE`, `SICKNESS`, `MISSION`, `TRAINING`, `REMOTE_WORK`, `EXTRA_AVAILABILITY`, `UNAVAILABLE`, `OTHER` restent inchangés ;
- les endpoints `/api/calendar/availabilities` et `/api/calendar/exceptions` restent les autorités existantes ;
- aucune migration Prisma ou de données ;
- aucun changement RBAC, tenant ou ownership.

### Reliquat #273 après #275

Restent explicitement à converger avant clôture de #273 :

- `components/calendar/internal-calendar-workspace-v2.tsx` ;
- `components/calendar/calendar-advanced-tools-panel.tsx` ;
- `components/calendar/calendar-advanced-tools-section.tsx` et threading locale/timezone associé ;
- dialogues legacy restant dans `components/collaborators/collaborators-conversation-workspace.tsx` ;
- QA historiques encore couplées à des copies françaises sur ces surfaces.

Ces surfaces ne doivent pas être déclarées terminées par la fusion de #275.

## QA

`scripts/qa-shared-work-i18n-convergence.mjs` protège le lot #272.

`scripts/qa-calendar-work-schedule-i18n-275.mjs` protège le sous-lot #275 et vérifie notamment :

- parité stricte des dictionnaires `calendar-schedule` FR/EN ;
- enregistrement dans `lib/i18n.ts` ;
- disparition du dictionnaire FR/EN local historique du panneau ;
- utilisation de la locale active pour les jours ;
- conservation des valeurs persistées et codes d’exception ;
- conservation des endpoints du planning.

Les deux QA sont intégrées à `scripts/run-regression-qa-ci.mjs`.

## Frontières de sécurité

Aucun endpoint, schéma Prisma, membership, `organizationId`, RBAC, entitlement, ownership de réunion, règle de groupe, conflit calendrier ou persistance métier ne doit être modifié par cette vague i18n.

## E2E propriétaire

#275 exige FR → EN → FR sur planning personnel, disponibilités, exceptions/absences, formulaires et vue équipe, en mobile + desktop, ainsi qu’un smoke permissions/tenant.

#273 exigera ensuite une validation propre de ses sous-lots Calendrier interne / outils avancés / dialogues Collaborateurs avant clôture de #266.

## Rollback

Chaque sous-lot est réversible par revert applicatif. Aucune restauration de données ni migration n’est attendue pour la convergence i18n.
