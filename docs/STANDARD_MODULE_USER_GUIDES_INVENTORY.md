# Inventaire des guides utilisateurs des modules standards

## État initial

Le registre canonique porte `userGuidePath` pour chaque module. À l’issue de l’itération 1, la majorité des modules standards ne possède pas encore de guide exact versionné. Cet état est volontairement visible dans l’audit et n’est pas transformé artificiellement en réussite.

## Priorités des itérations suivantes

1. Compte, authentification, profil, paramètres et abonnement.
2. Notifications, annonces, support, calendrier et collaboration.
3. Activités entreprise, tâches, demandes, validations, réunions et workflows.
4. Documents, rapports et assistant IA entreprise.
5. Administration entreprise et audit.
6. Activités et fonctions internes DTSC.
7. Console DTSC.
8. Site public, contenus, ressources et formulaires publics.

## Règle de promotion

Un module ne peut pas être promu vers `PROFESSIONAL_READY` ou `COMMERCIAL_READY` dans une itération future si son guide ne décrit pas exactement les fonctionnalités réellement déployées. L’audit accepte l’absence comme écart initial, mais refuse un chemin déclaré vers un fichier inexistant.

## Guides ajoutés — Itération 03

- `docs/user-guides/COLLABORATORS.md`
- `docs/user-guides/DIRECT_CONVERSATIONS.md`
- `docs/user-guides/GROUP_CONVERSATIONS.md`
- `docs/user-guides/CALLS.md`
- `docs/user-guides/ANNOUNCEMENTS.md`
- `docs/user-guides/COMMENTS_AND_REACTIONS.md`
- `docs/user-guides/COLLABORATION_MODERATION.md`

Ils sont exposés dans `/help/standard` et depuis les modules Collaboration et Annonces.

## Guides ajoutés — Itération 04

- `docs/user-guides/CALENDAR.md`
- `docs/user-guides/DTSC_ACTIVITIES.md`
- `docs/user-guides/ENTERPRISE_ACTIVITIES.md`
- `docs/user-guides/TASKS_OPERATIONS.md`
- `docs/user-guides/INTERNAL_REQUESTS.md`
- `docs/user-guides/VALIDATIONS.md`
- `docs/user-guides/MEETINGS.md`
- `docs/user-guides/WORKFLOWS.md`
- `docs/user-guides/DOCUMENTS.md`

Chaque guide documente les sources canoniques, les actions réellement exposées, les permissions, les liens profonds et les limites connues. L'audit `qa:standard-work-coordination-guides` vérifie leur présence et le maintien explicite d'une section **Limites**.

Les guides ne constituent pas une preuve E2E. Leur exactitude finale doit être confirmée après le déploiement Production et les scénarios manuels du propriétaire.
