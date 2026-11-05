# Hotfix RH #1034 — Organisation canonique dans les ERP communs

Préparé le 5 novembre 2026. **État : PR de tranche 3 en préparation ; CI et OWNER_E2E requis avant fusion.** Issue parent #1028. Le code de cette tranche n'est pas encore en Production.

## Usage métier
Dans **Ressources humaines → Contrats & organisation → Organisation** :
1. Les départements colorés se déplient et affichent les employés actifs. Chaque employé ouvre sa fiche RH avec le contrôle d'accès habituel.
2. La lecture RH reste disponible selon les droits RH existants ; elle ne suffit jamais à modifier la structure de l'entreprise.
3. Un utilisateur disposant **aussi** de `ADMIN_DASHBOARD:manage` accède à une section « Départements et postes officiels ».
4. Depuis cette section, il ouvre/crée/modifie/désactive les départements via le panneau d'Administration entreprise, avec responsable actif, département parent, libellés FR/EN, description et ordre.
5. Il configure les postes via le panneau canonique : création, lecture, édition, niveau hiérarchique, rattachement et désactivation logique **sans modifier les permissions existantes**. Les capacités et droits restent gérés exclusivement dans Administration entreprise. La section RH rafraîchit ses données sans recharger toute la page. Le même panneau conserve son comportement existant dans Administration entreprise.
6. Les départements/postes désactivés et leurs rattachements ne sont pas supprimés physiquement. Les capacités d'un poste ne sont jamais accordées par simple lecture RH.

## Source de vérité et API
- **Aucune table, API mutante ou rôle parallèle** : `EnterpriseDepartment` / `EnterprisePosition` restent canoniques.
- Lecture du contrôle CRUD : `GET /api/enterprise/:organizationId/hr-payroll-lookups?module=HUMAN_RESOURCES` retourne `canManageOrganization`, évalué côté serveur par `ADMIN_DASHBOARD:manage` séparément de `HUMAN_RESOURCES`.
- Données administratives uniquement après permission positive : `GET /api/enterprise/:organizationId/administration` (session, membre actif, permission d'administration).
- Départements : `POST /administration/departments`, `PATCH|DELETE /administration/departments/:id` (soft deactivation `isActive=false`). Les cycles et références hors organisation sont contrôlés par les routes existantes.
- Postes : `POST /administration/positions-guided` avec `preservePermissions=true` depuis la RH. Une édition conserve alors strictement `permissionsJson`; une création commence avec zéro permission. L'Administration entreprise conserve l'édition normale des capacités (flag absent/false) avec traduction serveur.
- Les routes précédentes portent toutes le préfixe `/api/enterprise/:organizationId`.
- Les réponses RH sont `private, no-store`. Aucune information salariale supplémentaire ni autorisation implicite ne résulte du panneau Organisation.

## Contrôles et limites
- Écriture/désactivation des référentiels réservée à l'administrateur de l'entreprise. Un RH gestionnaire sans droit d'administration conserve une lecture seule ; l'API refuse les accès non autorisés même si un bouton est forcé.
- Depuis l'onglet RH, les droits d'un poste ne peuvent pas être modifiés : mode métadonnées uniquement. Vérifier en E2E que les permissions avant et après édition sont identiques ; utiliser Administration entreprise pour les modifications de droits sensibles.
- Une désactivation de département conserve ses positions, collaborateurs, contrats et l'historique ; elle ne désactive pas implicitement les comptes membres.
- Les annuaires d'employés restent limités par les permissions RH déjà appliquées à `hr-payroll-lookups` ; le droit de lecture personnelle n'ouvre pas l'annuaire global.
- Les grandes données de l'Administration entreprise ne sont demandées qu'à l'ouverture de l'onglet Organisation par un administrateur autorisé.

## QA et déploiement
- `pnpm qa:hotfix-1034` incluse à `qa:regression`, plus `pnpm qa:enterprise-hr-payroll`, `pnpm qa:erp-i18n`, type-check, lint, build, QA responsive.
- **E2E propriétaire #PR** : utilisateur RH simple (lecture sans CRUD), admin (création/édition/désactivation/restauration de département et de poste), visite d'une fiche employé, droits avant/après modification d'un poste, tentative autre tenant, FR/EN, mobile 320–1024, sombre et clavier.
- Aucun changement Prisma, migration, variable d'environnement ou secret.
- Branche → CI/revue → OWNER_E2E BON → merge main → Vercel Production uniquement, Preview désactivées.
- Rollback : revert applicatif de la PR ; les référentiels préexistants ne sont pas effacés.
