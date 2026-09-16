# Issue #646 — Gaming Lounge 8/8 : onboarding et commercial readiness

## Portée

Ce lot ferme le programme #638 sans créer un neuvième domaine Gaming. Il transforme les briques #639–#645 en sous-secteur provisionnable, guidé et vérifiable de bout en bout.

## Classification et modules

- secteur : `HOSPITALITY_EVENTS` ;
- sous-secteur : `GAMING_LOUNGE` ;
- classification cible : `ACTIVE` ;
- modules Gaming réellement implémentés : `GAMING_DASHBOARD`, `GAMING_STATIONS`, `GAMING_SESSIONS`, `GAMING_BOOKINGS`, `GAMING_PRICING_PACKAGES`, `GAMING_CHECKOUT`, `GAMING_DAILY_CLOSE`, `GAMING_TOURNAMENTS`, `GAMING_REPORTS` ;
- plan minimum des modules Gaming : `BUSINESS` ;
- activation et navigation restent soumises à l’abonnement, au module, au sous-secteur et aux permissions.

La promotion `ACTIVE` signifie que le runtime existe. `COMMERCIAL_READY` reste un statut commercial gouverné par les preuves : la cible est enregistrée dans le contrat de readiness, mais la revendication finale n’est autorisée qu’après CI sur le head exact et `OWNER_E2E` explicite.

## Provisioning canonique

`syncGamingOnboardingProvisioning` est appelé dans le flux canonique d’application de template sectoriel. Une organisation `HOSPITALITY_EVENTS -> GAMING_LOUNGE` reçoit les modules Gaming réels, une configuration Gaming, les postes recommandés et les blocs d’activité utiles. Aucun client, actif, catalogue, compte, paiement ou stock Gaming parallèle n’est créé.

Postes recommandés :

- `GAMING_MANAGER` — Gérant / Administrateur Gaming ;
- `GAMING_OPERATOR_CASHIER` — Caissier / Opérateur Gaming ;
- `GAMING_TECHNICIAN` — Technicien Gaming ;
- `GAMING_FINANCE_ACCOUNTANT` — Finance / Comptable Gaming.

Blocs `Activités [Entreprise]` :

- `GAMING_REPORT_BREAKDOWN` -> `ASSETS_MAINTENANCE` ;
- `GAMING_REQUEST_MAINTENANCE` -> `ASSETS_MAINTENANCE` ;
- `GAMING_CASH_VARIANCE` -> `GAMING_DAILY_CLOSE` ;
- `GAMING_PRICING_EXCEPTION` -> `GAMING_PRICING_PACKAGES` ;
- `GAMING_SERVICE_REPORT` -> `GAMING_REPORTS`.

Ces blocs sont des raccourcis vers les autorités existantes. Ils n’ajoutent aucun modèle parallèle.

## Création par l’Administration DTSC

Le choix `HOSPITALITY_EVENTS -> GAMING_LOUNGE` force désormais l’application du template canonique lors de la création de l’entreprise. La preview Administration DTSC expose trois couches :

1. `ERP_COMMON` ;
2. `HOSPITALITY_EVENTS` ;
3. `GAMING_LOUNGE`.

La preview est construite à partir des registres et du template. Elle ne reçoit pas `organizationId` et ne lit donc pas les données métier privées d’un tenant.

## Onboarding client en huit étapes

La carte **Mise en service Gaming Lounge** est intégrée dans `GAMING_DASHBOARD` et réservée aux administrateurs autorisés du tenant. Elle recalcule la readiness à partir des données canoniques :

1. `IDENTITY_SITE` — identité et site actif ;
2. `STATIONS_ASSETS` — baseline de lancement de cinq profils station reliés à de vrais `EnterpriseAsset` ;
3. `TEAM_PERMISSIONS` — membre actif + quatre postes Gaming recommandés ;
4. `CATALOG_SERVICES` — service actif dans le Catalogue commun ;
5. `PRICING` — règle tarifaire Gaming active ;
6. `FINANCE_PAYMENTS` — readiness Finance commune + compte financier actif ;
7. `OPERATIONS` — réservations, sessions et checkout activés ;
8. `CLOSE_REPORTING_AI` — clôture, dashboard, rapports et tournois activés, avec DTSC AI déjà permission-scoped.

La baseline cinq postes ne constitue pas un plafond : la contrainte d’extensibilité de #640 reste opposable.

La seule préférence persistée par l’assistant est le site opérationnel choisi et son état de progression dans `EnterpriseGamingConfiguration.settingsJson`. Les mutations sont protégées par révision optimiste et transaction `Serializable`.

## Sécurité

L’API onboarding exige :

- session authentifiée ;
- contexte organisation ;
- accès `GAMING_DASHBOARD` en `manage` ;
- rôle administrateur entreprise ;
- sous-secteur Gaming sélectionné ;
- same-origin sur mutation ;
- schéma Zod ;
- rate limit ;
- AuditLog + ApiLog ;
- révision optimiste.

Un rôle global DTSC ne confère jamais automatiquement les données privées de l’entreprise cliente.

## DTSC AI

Le lot #646 ne transforme pas l’IA Gaming en outil mutant. `ERP_GAMING_PERFORMANCE_READ` reste read-only et respecte le module access resolver. Les détails Finance et Actifs sont uniquement inclus quand l’utilisateur possède les droits correspondants. Les devises restent séparées et la politique `FACTUAL_OBSERVATIONS_ONLY_NO_CAUSAL_INFERENCE` demeure obligatoire.

## Guides

- `docs/user-guides/GAMING_LOUNGE_FR.md`
- `docs/user-guides/GAMING_LOUNGE_EN.md`

Ils couvrent onboarding, opérations, sécurité, maintenance canonique, multi-devise, AI et dépannage.

## QA et acceptance

La QA statique `scripts/qa-646-gaming-commercial-readiness.mjs` est intégrée à `qa:regression`. Le workflow `.github/workflows/gaming-646-commercial-readiness.yml` doit prouver sur le head final :

- Prisma generate ;
- migrations sur base fraîche ;
- QA #646 ;
- régression globale ;
- type-check ;
- build Production ;
- onboarding navigateur à 320/360/375/390/414 px et desktop ;
- régression browser #645 ;
- régression DTSC AI Tool Gateway #645.

Ces preuves automatisées sont `CI_PROVEN` et ne remplacent pas `OWNER_E2E`.

## Règle de commercialisation

Le parcours `OWNER_E2E` final attendu est :

`création DTSC -> invitation -> onboarding -> 5 postes -> réservation -> session -> paiement -> clôture -> panne/maintenance -> rapport/IA`.

La PR reste Draft, aucun Preview Vercel n’est créé et aucune promotion en Production n’est autorisée avant la confirmation explicite du propriétaire sur le head final.

## Rollback

En cas de rollback, repasser la classification/modules Gaming en fail-closed et retirer l’assistant de readiness/provisioning #646. Ne supprimer aucune donnée Gaming historique ni aucun objet Finance/CRM/Catalogue/Actifs déjà créé. Les transactions financières confirmées restent immuables et auditables.
