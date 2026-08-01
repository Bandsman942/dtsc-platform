# Rapport d’exécution — Professionnalisation ERP, itération 02/06

## Références

- SHA de départ : `dad60bfab4f09f6750e85996b23f43b221d92d30`
- Branche : `feat/erp-professionalization-iteration-02-crm-master-data`
- Pull Request : `#39`
- État du rapport : à finaliser après CI, merge et recette Production.

## Préconditions vérifiées

L’itération 1 est fusionnée dans `main`. Le registre de maturité commerciale, les contrats UX ERP, le dictionnaire métier, les primitives responsive et le modèle de liaison d’identité consentie sont présents. Les garde-fous historiques et ceux de l’itération 1 passent dans la régression locale sans dépendances.

## Dettes de l’itération 1 reprises

- intégration du choix de liaison dans Tiers, CRM, Fournisseurs et RH ;
- sélection professionnelle d’une fiche lors d’une approbation ;
- scénarios navigateur authentifiés ;
- e-mails Zoho et liens profonds ;
- expiration périodique ;
- résolveur central des avantages ;
- dictionnaire Finance ;
- retrait du workspace générique pour les cinq modules ;
- packaging, onboarding, aide et découvrabilité.

## Architecture livrée

Les relations DTSC restent distinctes des fiches métier. Les invitations sont privées, les demandes utilisateur ne révèlent aucun annuaire global et seules les relations `ACTIVE`, consenties et approuvées peuvent produire des capacités. Le résolveur croise relation, abonnement, modules actifs et appartenance à l’organisation.

## Modules professionnalisés

### Tiers, prospects et clients

Workspace dédié, personne/organisation, rôles multiples, coordonnées, adresses, détail 360°, détection prudente des doublons, édition contrôlée, invitation facultative et état de relation DTSC.

### Catalogue

Workspace dédié produits/services, catégories, unités, tarification datée, fiscalité, détail, édition, archivage logique et historique tarifaire.

### Sites, entrepôts et emplacements

Workspace dédié, hiérarchie entreprise → site → entrepôt → emplacement, sélecteurs tenant-safe, édition et rendu mobile imbriqué.

### CRM et pipeline

Vues liste et pipeline, leads, opportunités, responsable, prochaine action, transitions serveur, conversion explicite et idempotente, notifications profondes.

### Contrats

Création et édition professionnelle, détail, cycle de validation et transitions serveur, alertes et liens profonds.

## Intégrations transversales

Fournisseurs personnes, représentants, employés et collaborateurs supportent la liaison facultative sans synchronisation silencieuse de données sensibles. Le module RH reste hors promotion commerciale complète dans cette itération.

## Maturité

Les cinq modules ciblés sont positionnés `PROFESSIONAL_READY`. Ils ne seront promus `COMMERCIAL_READY` qu’après recette navigateur authentifiée et preuves de smoke tests Production.

## Migration

Migration additive : prix catalogue historisés, capacités d’emplacement, prochaines actions CRM, relation lead–tiers et références d’identité fournisseurs. Aucun lien actif n’est créé par backfill.

## Validation déjà effectuée

- analyse syntaxique TypeScript/TSX ;
- vérification syntaxique des scénarios Playwright ;
- `git diff --check` ;
- régression Node complète, incluant les nouveaux QA ;
- installation CI avec `pnpm install --no-frozen-lockfile` ;
- génération Prisma CI ;
- déploiement de toutes les migrations sur une base PostgreSQL vide ;
- audits ERP et vérification de parité Finance sur la base neuve ;
- `pnpm type-check` vert dans la CI ;
- `pnpm qa:regression` vert dans la CI ;
- suppression des derniers éléments de code inutilisés signalés par ESLint.

## Validation restante avant clôture

- nouvelle exécution verte de `pnpm lint` après correction ;
- `pnpm build` ;
- scénarios Playwright authentifiés si secrets disponibles ;
- revue PR, merge, déploiement Production unique et smoke tests documentés.
