# Hotfix #667 — Canonical ERP Foundations

## Objectif

Ce hotfix généralise le contrat d’erreur professionnel au-delà de Finance et supprime les réponses API ERP génériques qui empêchaient l’interface de présenter la vraie cause métier d’un échec.

Il est empilé sur le hotfix #666 afin de réutiliser les primitives Data Safety avant fusion de #666.

## Contrat client canonique

`components/enterprise/professional/professional-erp-ui.tsx` expose désormais :

- `ProfessionalApiError` avec `code`, `clientMessage`, `details` et `status` ;
- `professionalRequest()` pour les lectures et mutations JSON ;
- `professionalMutation()` comme façade compatible qui ne réduit plus une réponse structurée à un simple `Error`.

Les collections professionnelles utilisent le même transport. Les panneaux Finance historiques qui possédaient leur propre `requestJson()` délèguent au client commun.

## Validation API

`enterpriseValidationErrorResponse()` fournit un contrat Zod commun :

- code d’erreur stable par route/action ;
- message utilisateur sûr ;
- `details.fieldErrors[]` avec uniquement le chemin du champ et le type de validation ;
- aucune valeur saisie n’est renvoyée dans les détails.

Les routes ERP qui retournaient littéralement `Invalid payload` ont été migrées vers des codes stables, y compris Core commun, Projets, Actifs, Contrats, Achats, Fournisseurs, Catalogue, Sites/Entrepôts, Documents, Finance, Retail, Pharmacie, Santé, convergence sectorielle et IA Entreprise.

## Erreurs inconnues

Les nouvelles conversions n’exposent pas `error.message` brut. Le flux d’achat passe par `normalizeEnterpriseCoreV2Error()` et l’IA Entreprise journalise un code/nom d’erreur, pas le message brut du fournisseur.

## Compatibilité

- aucune migration Prisma ;
- aucun changement d’entitlement ou de permission ;
- les codes HTTP existants restent cohérents avec les erreurs de validation (400), conflits (409) et erreurs serveur (500) ;
- les formulaires restent montés en cas d’échec et peuvent continuer à afficher le message sûr déjà fourni par le backend.

## Rollback

Revert applicatif de la PR. Aucune donnée ni migration n’est à inverser.

## Validation

CI attendue :

- `pnpm qa:hotfix-667`
- `pnpm qa:regression`
- `pnpm type-check`
- `pnpm lint`
- `pnpm build`

OWNER_E2E : `docs/OWNER_E2E_667_CANONICAL_ERP_FOUNDATIONS.md`.
