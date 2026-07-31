# Changelog — Consolidation ERP, itération 1/5

## Base

- SHA de départ : `e9d5b6e6bf8e742ae1c17b8cd085fc637579bbce`
- Branche : `feat/erp-consolidation-iteration-01-module-foundation`
- Schéma Prisma : inchangé
- Migrations historiques : inchangées
- Suppression de données : aucune

## Livré dans la branche

### Registre et accès

- registre canonique versionné des modules ;
- statuts ACTIVE, BETA, PLANNED, HIDDEN et compatibilité future DEPRECATED/RETIRED ;
- domaines ERP, groupes de navigation, routes, workspaces, permissions, entitlements, secteurs et dépendances ;
- aliases Pharmacy déterministes ;
- résolveur serveur unique pour navigation et route générique ;
- refus explicite des modules inconnus, non implémentés et incompatibles.

### Navigation et routage

- suppression du filtre de navigation limité à `isCore` ;
- groupes Core et sectoriels produits depuis le registre ;
- hub responsive `/enterprise-modules` ;
- navigation mobile limitée à une entrée ERP principale ;
- ouverture directe des modules Health et Pharmacy par URL stable ;
- allow-list statique des workspaces ;
- redirections des anciens modules administratifs vers des sections précises.

### Administration

- centre d’administration unique ;
- sections Vue d’ensemble, Collaborateurs, Postes, Départements, Rôles & permissions, Modules, Abonnement & limites, Paramètres, Audit et Templates sectoriels ;
- KPI réels issus des sources Core ;
- incohérences de configuration visibles pour les responsables autorisés ;
- modules planifiés et incompatibles exclus des cartes actives.

### Templates

- wrapper de validation par registre ;
- désactivation non destructive des modules inconnus, planifiés, masqués, administratifs, incompatibles ou aliases dupliqués ;
- désactivation des blocs d’activité ciblant un module non ouvrable ;
- aucune réécriture des migrations historiques.

### QA et audit

- `audit:enterprise-modules` ;
- `qa:enterprise-module-registry` ;
- intégration de la QA du registre dans `qa:regression` ;
- contrôles des aliases, routes, workspaces, dépendances, icônes, administration, secteurs, imports dynamiques et isolation `organizationId`.

## Éléments explicitement différés

- chaînes métier nouvelles de l’itération 2 ;
- grand livre, comptabilité et trésorerie de l’itération 3 ;
- convergence financière et métier Health/Pharmacy de l’itération 4 ;
- migration/suppression des modèles legacy de l’itération 5.

## Rollback

Le rollback consiste à revenir aux fichiers de navigation, route et accès antérieurs. Toutes les données et migrations restent compatibles, car cette itération ne supprime ni ne renomme destructivement aucune source persistée.

## Validation finale

Cette section doit être complétée uniquement après les faits :

- QA locale/CI : à renseigner après exécution ;
- PR : à renseigner après création ;
- SHA de merge : à renseigner après merge ;
- SHA Vercel Production : à renseigner après déploiement ;
- smoke tests : à renseigner après exécution avec comptes autorisés.
