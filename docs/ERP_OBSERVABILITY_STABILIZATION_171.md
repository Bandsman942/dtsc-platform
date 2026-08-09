# ERP Stabilisation 4/6 — Observabilité des KPIs et projections

Issue : #171
Parent : #167

## Contrat de lecture

Une indisponibilité API n'est jamais une valeur métier. Les agrégats de la Vue d'ensemble Finance distinguent désormais :

- `success` : donnée chargée avec valeur non nulle ;
- `empty` : lecture réussie mais aucune donnée métier ;
- `error` : lecture indisponible, affichée comme « Indisponible / Unavailable ».

Un bloc secondaire en erreur place le dashboard en état dégradé sans supprimer les autres indicateurs valides. Le frontend ne remplace plus un HTTP 403/500/timeout par `0`.

## Projections inter-modules

`/erp-projections` dispose d'une erreur de chargement visible au lieu d'un état vide silencieux. La réponse client est minimisée : source/cible, statut, tentatives, liens autorisés et message client-safe. Le `lastErrorMessage` brut persistant n'est pas renvoyé au navigateur.

Une projection `FAILED` ou `DEAD` peut être relancée par un utilisateur disposant de `FINANCE_OVERVIEW/manage`. `DEAD` signifie que les tentatives automatiques sont épuisées : sa reprise est donc une relance manuelle contrôlée, pas un retry automatique. Le retry existant reste protégé par same-origin, rate limit, audit et isolation `organizationId`.

## Sécurité

Aucun payload d'événement, métadonnée confidentielle Health/Pharmacy, stack trace, message Prisma brut ou secret provider n'est exposé par le contrat client de santé des projections.

## Données / migrations

Aucune migration Prisma. Aucun objet financier, lien inter-module ou historique n'est réécrit.

## Gate CI

`scripts/qa-erp-stabilization-observability.mjs` interdit le retour des faux zéros et du `lastErrorMessage` brut dans les surfaces concernées. Il est chaîné à la QA Accounting existante.
