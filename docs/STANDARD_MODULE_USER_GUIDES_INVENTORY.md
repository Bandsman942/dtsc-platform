# Inventaire des guides utilisateurs des modules standards

## Règle générale

Le registre canonique porte `userGuidePath` pour chaque module. Un module ne peut pas être promu vers `PROFESSIONAL_READY` ou `COMMERCIAL_READY` si son guide ne décrit pas exactement les fonctionnalités réellement déployées.

Un guide utilisateur :

- ne remplace pas les contrôles d’accès ;
- n’expose aucun secret ni détail technique sensible ;
- décrit les limites et fonctionnalités conditionnelles ;
- est actualisé dans le même travail que le code ;
- est affiché dans l’application lorsqu’un point d’entrée contextuel existe.

## Guides Collaboration — Itération 03

- `docs/user-guides/COLLABORATORS.md`
- `docs/user-guides/DIRECT_CONVERSATIONS.md`
- `docs/user-guides/GROUP_CONVERSATIONS.md`
- `docs/user-guides/CALLS.md`
- `docs/user-guides/ANNOUNCEMENTS.md`
- `docs/user-guides/COMMENTS_AND_REACTIONS.md`
- `docs/user-guides/COLLABORATION_MODERATION.md`

## Guides Travail et coordination — Itération 04

- `docs/user-guides/CALENDAR.md`
- `docs/user-guides/DTSC_ACTIVITIES.md`
- `docs/user-guides/ENTERPRISE_ACTIVITIES.md`
- `docs/user-guides/TASKS_OPERATIONS.md`
- `docs/user-guides/INTERNAL_REQUESTS.md`
- `docs/user-guides/VALIDATIONS.md`
- `docs/user-guides/MEETINGS.md`
- `docs/user-guides/WORKFLOWS.md`
- `docs/user-guides/DOCUMENTS.md`

## Guide ajouté après les tests E2E du propriétaire

- `docs/user-guides/ADMIN_RBAC_INDIVIDUAL_PERMISSIONS.md`

## Guides contextuels affichés dans l’application

Les définitions structurées vivent dans :

```text
lib/user-guides/iteration04-guides.ts
```

Le composant commun d’affichage est :

```text
components/user-guides/contextual-user-guide.tsx
```

Les points d’entrée intégrés sont :

- Calendrier interne ;
- Activités DTSC ;
- Activités entreprise ;
- Tâches et opérations ;
- Demandes internes ;
- Validations ;
- Réunions ;
- Workflows ;
- Documents ;
- Administration → Accès RBAC.

Le guide intégré est recherchable, mobile-first et affiche :

- le public concerné ;
- la date d’actualisation ;
- les capacités ;
- les étapes ;
- les avertissements ;
- les fonctionnalités conditionnelles.

## Fonctions documentées dans la remédiation E2E

Les guides couvrent désormais explicitement :

- filtres de disponibilités par période, date et département ;
- calendrier personnel et calendrier d’équipe ;
- invitations avec acceptation ou refus ;
- responsabilité immuable du créateur ;
- conflits des participants ;
- vues Kanban ;
- transitions réservées au responsable ou au destinataire ;
- checklists et progression calculée ;
- commentaires CRUD et mentions professionnelles ;
- historique détaillé des prestations ;
- permission individuelle pour les semaines passées ;
- ressources réservables ;
- suggestions de créneaux ;
- synchronisation externe conditionnelle ;
- indexation documentaire conditionnelle ;
- comparaison visuelle conditionnelle ;
- SLA avancés.

## Validation

Les audits vérifient la présence des fichiers, les codes structurés, les points d’entrée dans l’application et les termes opposables.

Les guides ne constituent pas une preuve E2E. Leur exactitude finale doit être confirmée après le nouveau déploiement Production et les scénarios manuels du propriétaire.
## Guides IA et maturité — Itération 05

Les définitions structurées FR/EN vivent dans `lib/user-guides/iteration05-guides.ts` et utilisent le composant natif `ContextualUserGuide`. Codes : `GLOBAL_CHATBOT`, `ENTERPRISE_AI_ASSISTANT`, `AI_CONVERSATIONS`, `AI_FILES_AND_SOURCES`, `AI_TOOLS_AND_CONFIRMATIONS`, `AI_PRIVACY_AND_SECURITY`, `AI_LIMITS_AND_USAGE`, `COMMERCIAL_MATURITY_KANBAN`. Les points d’entrée sont intégrés au Chatbot, à l’Assistant entreprise et à Administration DTSC → Maturité commerciale.
