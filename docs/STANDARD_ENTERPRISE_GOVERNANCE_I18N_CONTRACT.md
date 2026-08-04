# Contrat i18n — Gouvernance, budgets et rapports

## Moteur canonique

Toutes les interfaces utilisent `lib/i18n.ts` et les dictionnaires existants `locales/fr.json` et `locales/en.json`. Aucun moteur parallèle n’est créé.

## Namespaces

- `budgets.*` : scénarios, versions, réalisé, engagé, disponible, prévision, écarts et alertes ;
- `reports.*` : catalogue, sources, fraîcheur, filtres, vues, favoris et exports ;
- `metrics.*` : définition, formule, unité, arrondi et lien source ;
- `enterpriseAdmin.*` : collaborateurs, départements, rôles, permissions, modules, abonnement, paramètres, sécurité et audit ;
- `userGuides.enterpriseGovernance.*` : guides natifs ;
- `admin.commercialMaturity.*` : Kanban et validation propriétaire.

## Formatage

Dates, heures, périodes, devises, nombres, pourcentages, quantités, unités et pluriels doivent passer par `Intl` ou les primitives existantes. La priorité de locale pour un export est : locale explicitement demandée, locale utilisateur, locale officielle de l’organisation, français par défaut.

## APIs et reason codes

Les APIs retournent des reason codes stables indépendants de la langue : `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_CONTEXT`, `BUDGET_FROZEN`, `VERSION_MISMATCH`, `LAST_ADMIN_PROTECTED`, `ROLE_SYSTEM_PROTECTED`, `PLAN_REQUIRED`, `LIMIT_REACHED`, `RATE_LIMITED`, etc. Le client traduit les messages. Les APIs ne doivent pas retourner une enum brute comme libellé utilisateur.

## Exports

Les exports conservent la locale utilisée, la devise, la période, les filtres, les unités, la source et la date de génération. Les mêmes formules sont utilisées dans l’écran et dans l’export.

## Guides

Les guides de l’itération 6 sont fournis par `lib/user-guides/iteration06-guides.ts` et affichés par le composant natif `ContextualUserGuide`. Ils existent en français et en anglais et suivent le comportement mobile existant.

## QA

L’audit i18n détecte les namespaces absents, guides non traduits, statuts bruts, exports non localisés et reason codes remplacés par des textes instables.
