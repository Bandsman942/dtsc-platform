# DTSC — Contrat de commercialisabilité de l’onboarding sectoriel

## Objet

Tout template sectoriel ou sous-secteur métier DTSC peut exister techniquement sans être commercialisable. La commercialisation exige un contrat QA explicite, versionné et exécuté dans la CI/CD.

Le manifeste canonique est `lib/enterprise/sector-onboarding-readiness.json`. Le contrôle exécutable est `scripts/qa-sector-onboarding-commercial-readiness.mjs`.

## États

- `NOT_DECLARED` : le template actif est contrôlé structurellement mais DTSC ne revendique pas sa commercialisation.
- `RELEASE_CANDIDATE` : le secteur ou sous-secteur est prioritaire et sa CI bloque si un critère obligatoire d’onboarding ou d’exploitation n’est plus satisfait.
- `COMMERCIAL_READY` : état activé uniquement après validation produit explicite et parcours d’acceptation réel.

## Portée des profils

Le manifeste distingue désormais deux portées qui ne doivent jamais être confondues :

- `SECTOR_TEMPLATE` : le profil commercial décrit directement un `SectorTemplate` persistant. Les modules, départements et postes obligatoires sont donc vérifiés contre les lignes du template sectoriel actif correspondant.
- `BUSINESS_SUBTYPE` : le profil commercial décrit une spécialisation d’un secteur, par exemple `MANUFACTURING -> TAILORING_APPAREL` ou `HOSPITALITY_EVENTS -> GAMING_LOUNGE`. Ses modules et postes spécialisés sont provisionnés au runtime après sélection persistée du sous-secteur ; ils ne doivent pas être copiés dans le template parent ni devenir disponibles pour toutes les entreprises du secteur.

Un profil `BUSINESS_SUBTYPE` déclaré `enforce: true` doit fournir explicitement `businessSubtypeCode`, `runtimeProvisioningFile`, `runtimeProvisioningMarker` et `dedicatedQaFile`. Le gate transverse vérifie que le secteur parent possède un template actif, que le sous-secteur est `ACTIVE` dans le registre canonique, que les modules requis existent, que les modules opérationnels sont `ACTIVE`, compatibles avec le secteur/sous-secteur et cohérents avec le plan annoncé, que le provisioning est réellement branché au chemin d’application du template, que les guides existent et que la QA dédiée est exécutée par la régression globale.

Cette séparation est une règle d’isolation produit : promouvoir `GAMING_LOUNGE` ne doit jamais transformer le template générique `HOSPITALITY_EVENTS` en template Gaming pour l’hôtellerie, la restauration ou l’événementiel.

## Contrat générique obligatoire

Lorsqu’un secteur ou un sous-secteur est déclaré `RELEASE_CANDIDATE` ou `COMMERCIAL_READY`, la CI vérifie au minimum :

1. secteur parent et template actif ;
2. modules vendus présents dans le registre canonique ;
3. niveaux d’abonnement valides et modules opérationnels cohérents avec le plan minimal annoncé ;
4. départements et postes requis selon la portée du profil ;
5. permissions non vides pour les postes clés des templates sectoriels et contrat RBAC dédié pour les sous-secteurs provisionnés au runtime ;
6. provisioning runtime relié au chemin canonique d’application du template lorsqu’un profil métier est requis ;
7. guides utilisateur correspondant aux capacités vendues ;
8. mutations sensibles protégées par session, organisation, membership, module, entitlement, permissions, same-origin, Zod, rate limit, transaction et audit ;
9. idempotence ou contrainte d’unicité pour empêcher une double opération ;
10. expérience responsive conforme au contrat UI DTSC ;
11. parcours d’acceptation commercial démontrable de l’onboarding à la première opération métier.

Un template actif non déclaré continue d’être observé par la QA, mais ses écarts ne peuvent pas faire croire qu’il est commercialisable. Lorsqu’un secteur ou sous-secteur devient une priorité produit, son entrée doit être ajoutée au manifeste avec `enforce: true` et la portée correcte.

## Gate Shop 1.0

`COMMERCE_RETAIL` version 2 est sous gate strict `COMMERCIAL_READY` après validation métier explicite du parcours E2E propriétaire. Ce profil est de portée `SECTOR_TEMPLATE`.

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

## Gates de sous-secteur

`TAILORING_APPAREL` et `GAMING_LOUNGE` utilisent la portée `BUSINESS_SUBTYPE`. Leur gate transverse n’exige donc pas que leurs modules spécialisés soient présents dans le `SectorTemplate` parent. Il exige à la place leur classification active, leurs définitions canoniques, leur provisioning conditionné au sous-secteur persisté, leurs guides et leur QA dédiée. Les détails métier restent contrôlés respectivement par les suites Couture et Gaming exécutées dans `qa:regression` et leurs workflows d’acceptation dédiés.

## Règle CI/CD

Le gate est exécuté :

- dans le Quality Gate applicatif sur la base de test migrée ;
- dans le job de migrations sur une base créée depuis zéro.

Il est interdit de retirer, ignorer ou rendre non bloquant le gate d’un profil déclaré `enforce: true` pour faire passer une release. Une spécialisation ne peut pas contourner ce principe en se déclarant comme template sectoriel parent.

## Acceptation propriétaire et validation navigateur

Le statut `COMMERCIAL_READY` reflète une validation produit explicite du parcours métier. Il ne doit pas être confondu avec un job automatisé de navigateur.

La CI prouve les contrats automatisables ; l’acceptation propriétaire confirme le fonctionnement réel du parcours commercial sur le head exact validé. Pour Gaming Lounge #646, la promotion commerciale finale reste conditionnée à la CI du head exact et à `OWNER_E2E` explicite du parcours création DTSC → invitation → onboarding → cinq postes → réservation → session → paiement → clôture → panne/maintenance → rapport/IA.
