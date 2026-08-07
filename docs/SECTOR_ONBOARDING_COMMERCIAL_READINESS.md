# DTSC — Contrat de commercialisabilité de l’onboarding sectoriel

## Objet

Tout template sectoriel DTSC peut exister techniquement sans être commercialisable. La commercialisation exige désormais un contrat QA explicite, versionné et exécuté dans la CI/CD.

Le manifeste canonique est `lib/enterprise/sector-onboarding-readiness.json`. Le contrôle exécutable est `scripts/qa-sector-onboarding-commercial-readiness.mjs`.

## États

- `NOT_DECLARED` : le template actif est contrôlé structurellement mais DTSC ne revendique pas sa commercialisation.
- `RELEASE_CANDIDATE` : le secteur est prioritaire et sa CI bloque si un critère obligatoire d’onboarding ou d’exploitation n’est plus satisfait.
- `COMMERCIAL_READY` : état réservé à une validation produit explicite. Un script ne peut pas l’activer automatiquement.

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

`COMMERCE_RETAIL` version 2 est actuellement le seul secteur sous gate strict `RELEASE_CANDIDATE`.

En plus du contrat générique, la CI exige :

- POS multi-articles avec panier ;
- prix/remises/taxes protégés côté serveur et dérogation réservée aux responsables avec motif ;
- séparation entre wallets Mobile Money et opérateurs réseau Télécom ;
- référence opérateur obligatoire et protégée contre les doublons ;
- normalisation du numéro et écran de confirmation avant Mobile Money/Télécom ;
- caisse active et floats résolus automatiquement depuis la configuration ;
- état de la session de caisse visible ;
- catalogue de permissions Retail dans l’administration et permissions fournisseurs/achats pour le responsable achats ;
- rapports strictement séparés par devise ;
- checklist persistante de mise en service du Shop.

## Règle CI/CD

Le gate est exécuté :

- dans le Quality Gate applicatif sur la base de test migrée ;
- dans le job de migrations sur une base créée depuis zéro.

Il est interdit de retirer, ignorer ou rendre non bloquant le gate d’un secteur déclaré `enforce: true` pour faire passer une release.

## Limite de l’automatisation

La QA prouve la présence des contrats techniques et métier automatisables. Elle ne remplace pas l’acceptation propriétaire réelle sur un tenant : onboarding, première vente, opération Mobile Money, recharge Télécom, clôture indépendante et viewport mobile doivent être exécutés avant la déclaration manuelle `COMMERCIAL_READY`.
