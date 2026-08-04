# Itération 04 — Remédiation après tests E2E du propriétaire

## Référence

- branche : `fix/iteration-04-owner-e2e-remediation` ;
- base vérifiée : `main@2806388bbb4b39aa0ba7fa74021855b7a2a0a9dc` ;
- maturité maximale automatique : `PROFESSIONAL_READY` ;
- promotion `COMMERCIAL_READY` interdite avant le nouveau cycle E2E du propriétaire.

## Périmètre fonctionnel

### Calendrier

- filtres de disponibilités par jour, semaine, mois, année et date précise ;
- filtres par département et statut ;
- vues liste, par collaborateur et par statut ;
- calendrier personnel et calendrier équipe autorisé ;
- créateur responsable immuable ;
- participants invités avec acceptation ou refus ;
- conflits du responsable et des participants ;
- notifications et liens profonds ;
- CRUD réservé au créateur responsable ;
- dates de création et de modification ;
- checklist et progression calculée ;
- suggestions locales de créneaux ;
- ressources et réservations sans chevauchement ;
- synchronisation externe fermée par défaut.

### Activités DTSC et entreprise

- vue Kanban transverse ;
- détail cliquable ;
- transitions réservées au destinataire, assigné ou responsable ;
- historique des transitions ;
- checklists et progression calculée ;
- commentaires CRUD ;
- mentions professionnelles cliquables ;
- pièces jointes et aperçu d’image via `next/image` ;
- historique détaillé des prestations ;
- soumission d’une semaine passée sous permission individuelle.

### RBAC individuel

- catalogue fermé ;
- ALLOW et DENY ;
- motif obligatoire ;
- expiration facultative ;
- révocation ;
- audit ;
- accès ciblé à une section Administration ;
- permissions métier spéciales.

### Documents et SLA

- états d’indexation par version ;
- comparaison de deux versions ;
- appels fournisseur exclusivement serveur avec URL signée courte ;
- état `NOT_CONFIGURED` lorsque les variables manquent ;
- politiques SLA ;
- instances SLA ;
- avertissement et dépassement ;
- aucune modification automatique du statut métier.

## Schéma additif

La migration `20260804090000_iteration04_owner_e2e_remediation` ajoute uniquement de nouvelles tables et de nouveaux index. Aucune migration historique n’est modifiée.

Les nouveaux modèles sont :

- `DtscIndividualPermissionGrant` ;
- `OperationalChecklistItem` ;
- `OperationalStatusTransition` ;
- `CalendarResource` ;
- `CalendarResourceReservation` ;
- `CalendarExternalSyncState` ;
- `CalendarSlotSuggestion` ;
- `EnterpriseDocumentIndexState` ;
- `EnterpriseDocumentVersionComparison` ;
- `OperationalSlaPolicy` ;
- `OperationalSlaInstance`.

## Configuration conditionnelle

Les variables suivantes ne doivent contenir que des valeurs serveur :

```text
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
MICROSOFT_CALENDAR_CLIENT_ID
MICROSOFT_CALENDAR_CLIENT_SECRET
MICROSOFT_CALENDAR_TENANT_ID
DOCUMENT_INDEX_PROVIDER
DOCUMENT_INDEX_ENDPOINT
DOCUMENT_INDEX_API_KEY
DOCUMENT_VISUAL_DIFF_PROVIDER
DOCUMENT_VISUAL_DIFF_ENDPOINT
DOCUMENT_VISUAL_DIFF_API_KEY
```

Sans configuration complète :

- la fonctionnalité reste indisponible ;
- un message métier est retourné ;
- un état `NOT_CONFIGURED` peut être persisté ;
- aucune clé n’est exposée ;
- aucune exception non contrôlée n’atteint l’interface.

## Guides

Tous les guides concernés ont été actualisés et une version structurée est affichée dans l’application.

Le composant commun est `components/user-guides/contextual-user-guide.tsx`.

## QA

Le script `scripts/qa-standard-work-coordination-checks.mjs all` vérifie les nouveaux contrats en plus des contrôles de l’itération 04.

Les contrôles CI obligatoires restent :

- migration depuis une base PostgreSQL vide ;
- `prisma generate` ;
- type-check ;
- lint ;
- QA ciblée ;
- `qa:regression` ;
- build Next.js.

## E2E

Le plan complet est dans `docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_04.md`.

**Tests E2E manuels préparés — validation du propriétaire en attente**
