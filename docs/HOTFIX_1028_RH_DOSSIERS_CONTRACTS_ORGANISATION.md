# Hotfix #1028 — Dossier RH, organisation et historique contractuel

État : **tranche 1 (#1030) et tranche 2 (#1032) livrées ; tranche 3 (#1034) en préparation avec CI et E2E requis**. Ce document décrit le programme issu de #1028. La paie personnelle, le pointage et les rapports du salarié relèvent de l'issue dépendante #1029 et ne sont pas déclarés livrés ici.

## Parcours métier

- **Employés et collaborateurs** : registre paginé et consultable, fiche plein écran en rubriques repliables (identité, affectation, contrats, rémunération selon droits, activités transversales et traçabilité).
- Le dossier affiche toutes les valeurs effectivement enregistrées par le formulaire de création : identité, contacts, rattachement, responsable, site, date d'embauche, type d'emploi et rémunération autorisée. Les référentiels sont présentés sous leurs libellés FR/EN.
- **CRUD** : la création existante est conservée ; l'édition se fait par `PATCH` avec révision optimiste ; la suppression est un **archivage métier** réversible, avec restauration. Une relation de compte DTSC reste distincte et consentie ; l'édition RH ne change pas cette liaison.
- L'archivage est refusé lorsqu'un contrat actif/en approbation, une validation de feuille de temps ou des collaborateurs actifs dépendants existent. L'historique contractuel et de paie est conservé.
- **Organisation** : regroupement interactif par département, accès direct à la fiche concernée et réutilisation des postes, sites et relations hiérarchiques canoniques. Pas de second référentiel.
- **Contrats** : modifications préapprobation avec `revision` et capture immuable avant écrasement. Les contrats activés restent non éditables ; toute évolution des conditions actives suit une nouvelle version `versionNumber` avec `supersedesContractId` et approbation indépendante.

## API et autorisations

| Route | Méthode | Autorisation | Effet |
| --- | --- | --- | --- |
| `/api/enterprise/:organizationId/employees` | GET | RH `read` | Liste paginée ; salaires/notes privées masqués sans `manage` ; `archived=true` réservé à `manage` |
| `/api/enterprise/:organizationId/employees` | POST | RH `write` | Création canonique existante |
| `/api/enterprise/:organizationId/employees/:employeeId` | GET | RH `read` | Détail et liens limités aux modules autorisés ; salaires privés conditionnés à `manage` |
| même route | PATCH | RH `manage` | Édition complète des champs professionnels, `revision` obligatoire |
| même route | DELETE | RH `manage` | Archivage logique, `revision` obligatoire |
| `/api/enterprise/:organizationId/employees/:employeeId/restore` | POST | RH `manage` | Restauration logique et traçabilité |
| `/api/enterprise/:organizationId/employment-contracts/:contractId/revisions` | GET | RH `manage` | Historique immuable paginé, détails contractuels sensibles |

Les mutations exigent session, organisation active, membre actif, module et entitlement appropriés, permission serveur, même origine, validation Zod, limitation de débit, transaction et audit. Toutes les références employé/poste/département/responsable/site sont revérifiées dans la même organisation. Les montants ne figurent pas dans les événements d'audit. Le créateur ne s'accorde pas lui-même une approbation contractuelle.

La fiche exploite les compteurs et liens exacts vers les contrats, feuilles de temps, congés, paie approuvée (gestionnaires autorisés seulement), projets et actifs ; chaque accès transversal fait l'objet d'une vérification indépendante du module concerné. Les listes d'activité sont bornées à cinq éléments récents par rubrique.

## Données et migration

Ajout : `EnterpriseEmploymentContractRevision` avec `organizationId`, `contractId`, `revisionNumber`, `snapshotJson`, auteur, date. Contrainte unique par contrat/révision et clé étrangère composite tenant-scoped. Migration `20261105201000_hr_contract_revision_history` **additive**. Les contrats antérieurs non révisés ne reçoivent aucune version fictive.

**Rollback :** revenir au code de la PR sans supprimer la table de snapshots ni modifier les migrations déjà appliquées. Les dossiers archivés restent récupérables. Les historiques antérieurs ne sont jamais effacés.

## Vérification et preuves attendues

- Validation Prisma depuis base vide, `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, QA RH/ERP/i18n/responsive, `pnpm qa:regression`, `pnpm build`.
- E2E propriétaire : création → fiche complète FR/EN → édition → conflit `409` → archivage bloqué/autorisé → restauration.
- Refus d'accès en changeant `organizationId` ou `employeeId`, salaires masqués pour lecteur non gestionnaire, liens transversaux absents quand un module est interdit.
- Contrat en attente → modification → ouverture de l'ancienne révision ; nouvelle version d'un contrat actif, approbation par une autre personne, conservation du contrat antérieur.
- Écrans 320, 360, 375, 390, 414, 768, 1024 px, thème clair/sombre, clavier, fermeture et retour.
- Pas de merge sans CI verte, revue, conversations résolues et **OWNER_E2E BON**. Déploiement Vercel automatique depuis `main` uniquement ; aucun Preview de branche.

La maturité commerciale RH/Paie/Temps ne peut pas être promue automatiquement par cette PR. Les parcours #1029, l'entitlement et leur E2E restent à prouver module par module.


## Complément tranche 2 (archive des contrats)
Le parcours de versionnement de la tranche 1 est complété par l'archivage métier/restauration des contrats non actifs : validation indépendante pending annulée, revision optimiste, données historiques et bulletins conservés. Voir `docs/HOTFIX_1028_RH_CONTRACT_ARCHIVE_PHASE2.md`. L'issue reste ouverte pour le CRUD direct des référentiels Organisation et la certification des liens transversaux.


## Complément tranche 3 (structure Organisation)
La gestion des départements et postes officiels dans l’onglet RH réutilise les **panneaux et mutations canoniques** de l’Administration entreprise. L’édition de la structure et des capacités est réservée à `ADMIN_DASHBOARD:manage`, indépendamment des seuls droits RH. La lecture des membres RH sans autorisation administrative demeure limitée ; la présentation FR/EN colorée et les liens vers la fiche collaborateur restent accessibles selon permissions. Voir `docs/HOTFIX_1034_RH_ORGANISATION_CANONIQUE.md` et l’issue #1034. Aucune nouvelle migration.
