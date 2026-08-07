# DTSC — Contrat de commercialisabilité de l’onboarding sectoriel

## Objet

Tout template sectoriel DTSC peut exister techniquement sans être commercialisable. La commercialisation exige un contrat QA explicite, versionné et exécuté dans la CI/CD.

Le manifeste canonique est `lib/enterprise/sector-onboarding-readiness.json`. Le contrôle exécutable est `scripts/qa-sector-onboarding-commercial-readiness.mjs`.

## États

- `NOT_DECLARED` : le template actif est contrôlé structurellement mais DTSC ne revendique pas sa commercialisation.
- `RELEASE_CANDIDATE` : le secteur est prioritaire et sa CI bloque si un critère obligatoire d’onboarding ou d’exploitation n’est plus satisfait.
- `COMMERCIAL_READY` : état activé uniquement après validation produit explicite et parcours d’acceptation réel.

## Contrat générique obligatoire

Lorsqu’un secteur est déclaré `RELEASE_CANDIDATE` ou `COMMERCIAL_READY`, la CI vérifie au minimum :

1. secteur et template actifs ;
2. modules du template présents dans le registre canonique ;
3. niveaux d’abonnement valides et modules opérationnels cohérents avec le plan minimal annoncé ;
4. départements et postes du template présents ;
5. permissions non vides pour les postes clés ;
6. provisioning runtime relié au chemin canonique d’application du template lorsqu’un profil métier est requis ;
7. guides utilisateur correspondant aux capacités vendues ;
8. mutations sensibles protégées par session, organisation, membership, module, entitlement, permissions, same-origin, Zod, rate limit, transaction et audit ;
9. idempotence ou contrainte d’unicité pour empêcher une double opération ;
10. expérience responsive conforme au contrat UI DTSC ;
11. parcours d’acceptation commercial démontrable de l’onboarding à la première opération métier.

Un template actif non déclaré continue d’être observé par la QA, mais ses écarts ne peuvent pas faire croire qu’il est commercialisable. Lorsqu’un secteur devient une priorité produit, son entrée doit être ajoutée au manifeste avec `enforce: true`.

## Gate Shop 1.0

`COMMERCE_RETAIL` version 2 est désormais sous gate strict `COMMERCIAL_READY` après validation métier explicite du parcours E2E propriétaire.

En plus du contrat générique, la CI exige :

- POS multi-articles avec panier ;
- prix/remises/taxes protégés côté serveur et dérogation réservée aux responsables avec motif ;
- séparation entre wallets Mobile Money et opérateurs réseau Télécom ;
- référence opérateur obligatoire et protégée contre les doublons ;
- normalisation du numéro et écran de confirmation avant Mobile Money/Télécom ;
- caisse active et floats résolus automatiquement depuis la configuration ;
- état de la session de caisse visible ;
- catalogue de permissions Retail dans l’administration et permissions fournisseurs/achats pour le responsable achats ;
- agrégats natifs strictement séparés par devise ;
- gouvernance Finance des taux de change avec historique, date d’effet, source et résolution directe/inverse ;
- consolidation Shop réalisée opération par opération au taux historique ;
- refus d’un total consolidé partiel lorsqu’un taux obligatoire manque ;
- checklist persistante de mise en service du Shop ;
- document d’onboarding canonique et onboarding intégré au guide utilisateur de l’application.

## Règle CI/CD

Le gate est exécuté :

- dans le Quality Gate applicatif sur la base de test migrée ;
- dans le job de migrations sur une base créée depuis zéro.

Il est interdit de retirer, ignorer ou rendre non bloquant le gate d’un secteur déclaré `enforce: true` pour faire passer une release.

## Acceptation propriétaire et validation navigateur

Le statut `COMMERCIAL_READY` reflète une validation produit explicite du parcours métier. Il ne doit pas être confondu avec le job automatisé `authenticated-browser-acceptance`, qui reste déclenché manuellement par `workflow_dispatch` dans la CI actuelle.

La CI prouve les contrats automatisables ; l’acceptation propriétaire confirme le fonctionnement réel du parcours Shop en conditions d’utilisation.
