# Hotfix Comptabilité ERP — Issue #486

## Objectif

Ce hotfix corrige la hiérarchie et la profondeur fonctionnelle de `FINANCE_ACCOUNTING` sans modifier les invariants comptables existants.

La **Mise en service comptable** n'est plus affichée avant le module. Elle devient le premier sous-bloc du workspace Comptabilité et utilise les mêmes primitives d'interface que les autres sections.

## Contrat UX

- `Mise en service comptable` est le premier onglet et le point d'entrée par défaut.
- Le rail d'onglets utilise `ProfessionalTabs`, donc l'onglet actif est fortement différencié et recentré automatiquement avec `scrollIntoView(... inline: "center")`.
- Les deeplinks `?tab=...` sélectionnent la sous-section correspondante.
- Les formulaires longs utilisent des dialogues hauts/fullscreen-capables et suivent `docs/ENTERPRISE_FORM_UX_CONTRACT.md`.
- Les erreurs et confirmations de configuration apparaissent au premier plan via `ForegroundToast` et restent formulées en langage client.
- Les tableaux comptables conservent leur largeur métier et utilisent un scroll horizontal local sur petits écrans, sans provoquer un overflow horizontal global de la page.
- Les détails Plans, Comptes, Exercices, Périodes, Journaux et Règles s'ouvrent dans une vue dédiée avec retour explicite vers la liste.

## Mise en service comptable

Le panneau réutilise la readiness canonique. Chaque diagnostic récupéré du serveur conserve son sens métier :

- lorsqu'un `actionHref` canonique existe, la ligne est cliquable ;
- les paramètres financiers ouvrent `FINANCE_OVERVIEW?configure=finance` ;
- aucune action visible n'est un placeholder ;
- lorsqu'aucun raccourci direct n'existe, le message indique qu'un rôle autorisé ou l'administrateur de l'entreprise doit intervenir.

## Vue d'ensemble financière

La vue d'ensemble repose sur les données comptables réelles et accepte quatre fenêtres :

- 30 derniers jours ;
- 90 derniers jours ;
- 12 derniers mois ;
- tout l'historique.

Elle expose :

- écritures comptabilisées ;
- écritures en attente de validation ;
- anomalies de comptabilisation ;
- périodes ouvertes ;
- cycle des écritures ;
- activité par journal ;
- interprétations orientées action.

Les montants par journal restent groupés par `functionalCurrencyCode`. Aucun montant de devises différentes n'est additionné dans une même valeur.

## Plans comptables et comptes

Le détail d'un plan charge le plan du tenant, ses groupes et l'ensemble de ses comptes non archivés. Les comptes sont présentés avec leur nature, leur signification et leur logique d'utilisation.

Le détail d'un compte précise notamment :

- nature et sous-type ;
- parent ;
- devise ;
- autorisation de saisie directe ;
- compte de contrôle ;
- compte système ;
- signification client de la nature comptable.

## Exercices, périodes et journaux

Ces trois notions sont volontairement différenciées dans l'interface :

- **Exercice** : fenêtre annuelle de reporting ;
- **Période** : fenêtre de saisie/clôture contenue dans l'exercice ;
- **Journal** : origine opérationnelle des écritures.

Chaque ligne dispose d'un menu contextuel `...` avec des actions réelles. Les routes serveur protègent l'historique :

- un exercice déjà ouvert/clôturé n'est pas redatable directement ;
- une période contenant des écritures, clôtures ou soldes d'ouverture n'est pas supprimable ou redatable directement ;
- un journal contenant des écritures n'est pas supprimable et doit être désactivé ;
- les conflits de révision demandent une actualisation avant nouvelle tentative.

## Écritures, Grand livre et Balance générale

Ces vues utilisent des tableaux comptables compacts.

### Écritures

Date, numéro, journal, période, référence, description, débit, crédit, statut.

### Grand livre

Date, compte, journal, période, référence, description, débit, crédit.

### Balance générale

Compte, nature, débit, crédit, solde, statut.

## Règles de comptabilisation

Chaque règle est ouvrable en détail et explique le flux :

`origine métier → usage métier → compte comptable`

Le texte client précise qu'une règle indique au moteur comptable quel compte employer lorsque l'événement métier correspondant est comptabilisé.

## Sécurité et invariants

Le hotfix ne change pas le schéma Prisma et n'ajoute aucune migration.

Les invariants existants restent obligatoires :

- isolation stricte par `organizationId` ;
- autorisation serveur via `authorizeFinanceRequest` ;
- partie double ;
- `POSTED` immuable ;
- périodes fermées/verrouillées protégées ;
- `Decimal` pour les montants ;
- contrôles de révision sur les mutations sensibles ;
- readiness canonique uniquement ;
- aucun bypass tenant par rôle global.

## QA

Le contrat statique `scripts/qa-hotfix-486-accounting-ux.mjs` est importé par `scripts/qa-accounting-acceptance-contract.mjs` afin d'être exécuté dans l'acceptance Comptabilité.

L'E2E `tests/e2e/accounting-onboarding.spec.mjs` a été adapté au nouveau parcours : création de plan en dialogue plein écran, confirmations via toast et mise en service comme premier onglet du module.

`OWNER_E2E` reste requis avant merge, conformément à `docs/CONTRIBUTING.md`.

## Rollback

Le rollback consiste à revert la PR liée à #486. Aucune donnée comptable existante ni migration n'a besoin d'être annulée.
