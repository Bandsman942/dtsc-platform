# Acceptation commerciale — ERP, itération 02/06

Date d’acceptation : 1 août 2026  
Validateur produit : Product owner DTSC  
Version Production initialement testée : `f0fde79a2ca92fb445230f23db54e29a184ac008`

## Décision

Le product owner atteste avoir exécuté personnellement la recette navigateur authentifiée et les smoke tests Production définis dans `docs/ERP_ITERATION_02_PRODUCTION_SMOKE_TEST.md`.

Les cinq modules suivants sont acceptés pour commercialisation :

- `CRM_CUSTOMERS` — Tiers & clients ;
- `CATALOG` — Catalogue produits & services ;
- `SITES_WAREHOUSES` — Sites & entrepôts ;
- `CRM_PIPELINE` — CRM & pipeline ;
- `CONTRACTS` — Contrats.

Les parcours de création, consultation, modification, transitions métier, permissions, isolation par entreprise, responsive mobile, consentement, révocation, notifications et liens profonds ont été déclarés concluants.

## Améliorations intégrées à la PR de promotion

La décision de promotion inclut la fermeture de trois écarts ergonomiques constatés pendant la recette :

1. le sélecteur de contrepartie d’un contrat agrège désormais les tiers, clients, partenaires, employés, collaborateurs et fournisseurs déjà enregistrés ; une fiche métier canonique est créée ou réutilisée transactionnellement lorsque la source n’est pas encore un tiers ;
2. les invitations à relier un compte DTSC produisent une notification globale au compte utilisateur, visible avant toute adhésion à l’entreprise cible et depuis le contexte DTSC interne ;
3. `Identités & consentements` est exposé dans la navigation ERP des administrateurs d’entreprise, et `Maturité ERP` dans les sous-modules de l’Administration DTSC.

## Conditions de maintien

Le statut `COMMERCIAL_READY` reste conditionné au maintien des contrôles CI, des permissions serveur, de l’isolation tenant, des migrations additives, de la documentation et des preuves QA. Toute régression majeure doit entraîner un déclassement immédiat du module concerné.

Les scénarios Playwright restent disponibles en déclenchement manuel. La présente acceptation repose sur la recette Production manuelle attestée par le product owner, conformément à la décision prise pour cette itération.
