# Modules sectoriels entreprise DTSC Platform

## Objectif

DTSC Platform utilise une architecture SaaS hybride: le tenant interne DTSC reste séparé des entreprises clientes, et chaque entreprise cliente travaille dans un contexte `ORGANIZATION` isolé par `organizationId`.

La couche sectorielle ajoute des modèles prêts à appliquer pour générer les modules, postes, départements, blocs d'activités et workflows adaptés au secteur choisi par l'entreprise.

## Références métier

Les modèles sont structurés pour rester compatibles avec des cadres reconnus sans copier un référentiel externe:

- classification économique inspirée de l'UN ISIC Rev.4;
- santé et santé digitale alignées avec les besoins HHFA;
- éducation structurée autour d'une logique ISCED;
- assurance orientée gouvernance, conformité et audit type IAIS;
- reporting et budgets compatibles avec une lecture IFRS for SMEs / IAS 1;
- projets et workflows alignés avec ISO 21502;
- supply chain, stocks et traçabilité compatibles GS1;
- construction et documentation projet inspirées ISO 19650;
- ONG et projets cadrés par suivi-évaluation / Logframe;
- hôtellerie, restauration et événementiel orientés opérations terrain.

## Tables principales

- `BusinessSector`: secteurs normalisés disponibles dans la combobox de création d'entreprise.
- `SectorTemplate`: version active d'un modèle sectoriel.
- `SectorTemplateModule`: modules proposés par secteur.
- `SectorTemplatePosition`: postes proposés par secteur.
- `SectorTemplateDepartment`: départements recommandés.
- `SectorTemplateActivityBlock`: actions collaboratives exposées dans `Activités [Entreprise]`.
- `SectorTemplateWorkflow`: workflows standards associés au secteur.
- `EnterpriseModule`: modules réellement activés pour une organisation.
- `EnterpriseAdminSection`: sections administratives propres à l'organisation.
- `EnterprisePosition`: postes réellement disponibles dans l'organisation.
- `EnterpriseDepartment`: départements réellement disponibles.
- `EnterpriseActivityBlock`: blocs réellement visibles dans `Activités [Entreprise]`.
- `EnterpriseWorkflow`: workflows réellement activés.
- `EnterpriseActivityRequest`: demandes, rapports ou signalements soumis par les membres de l'entreprise.
- `EnterpriseSectorRecord`: enregistrements métier sectoriels génériques isolés par `organizationId`, `sectorCode`, `moduleCode` et `recordType`.

## Secteurs préchargés

Les secteurs suivants sont seedés de manière idempotente:

- `HEALTH_CARE`
- `PHARMACY`
- `INSURANCE`
- `EDUCATION`
- `COMMERCE_RETAIL`
- `PROFESSIONAL_SERVICES`
- `NGO_ASBL`
- `TRANSPORT_LOGISTICS`
- `CONSTRUCTION_REAL_ESTATE`
- `TECH_DIGITAL`
- `MANUFACTURING`
- `AGRI_FOOD`
- `HOSPITALITY_EVENTS`
- `FINANCE_MICROFINANCE`
- `PUBLIC_ADMIN`
- `OTHER`

Chaque secteur reçoit le socle commun DTSC: tableau de bord entreprise, collaborateurs, départements, permissions, tâches, réunions, demandes internes, rapports, documents, finances, achats, workflows, audit, paramètres et assistant IA entreprise.

## Application d'un modèle

Depuis le bloc DTSC `Administration > Entreprises clientes`, le champ `Secteur d'activité` est une combobox alimentée par `BusinessSector`.

Après sélection, l'interface affiche un aperçu:

- modules proposés;
- postes clés;
- départements recommandés;
- blocs d'activités;
- workflows.

L'action `Appliquer le modèle sectoriel` appelle `applySectorTemplateToOrganization()`. Cette fonction:

1. vérifie le secteur actif;
2. sélectionne la dernière version active du template;
3. crée ou met à jour les départements entreprise;
4. crée ou met à jour les modules entreprise;
5. crée les sections administratives correspondantes;
6. crée ou met à jour les postes;
7. crée ou met à jour les blocs d'activités;
8. crée ou met à jour les workflows;
9. journalise l'action dans `AuditLog`.

Le mode `merge` conserve les personnalisations existantes. Le mode `replace_sector` désactive les anciens éléments sectoriels non socle avant d'appliquer le nouveau modèle.

## Administration [Entreprise]

Le module `/enterprise-admin` est visible uniquement en contexte `ORGANIZATION` pour un membre actif ayant un rôle organisationnel:

- `OWNER`;
- `ADMIN_ENTREPRISE` / `ADMIN_ENTERPRISE`;
- `MANAGER`.

Ce module permet de consulter et gérer les modules, sections, postes, départements, blocs d'activités et workflows de l'organisation active. Il ne donne pas accès à l'administration globale DTSC.

### Itération `HEALTH_CARE`

La première itération sectorielle approfondie concerne `HEALTH_CARE`. Quand une entreprise active possède `sectorCode = HEALTH_CARE`, `Administration [Entreprise]` affiche un bloc `Santé - sous-modules métier`.

Sous-modules disponibles:

- `PATIENTS`: profils administratifs patients, référents, contacts et prise en charge.
- `APPOINTMENTS`: rendez-vous et suivis internes.
- `QUALITY_INCIDENTS`: incidents qualité, confidentialité, sécurité et amélioration continue.

Chaque sous-module expose:

- une liste paginée et recherchable;
- un formulaire complet en dialogue haut/mobile-first;
- une fiche de détail;
- des statuts et priorités;
- un menu `...` pour consulter, modifier ou archiver;
- une écriture réelle dans `EnterpriseSectorRecord`;
- un audit `ENTERPRISE_HEALTHCARE_RECORD_CREATED`, `ENTERPRISE_HEALTHCARE_RECORD_UPDATED` ou `ENTERPRISE_HEALTHCARE_RECORD_ARCHIVED`.

Routes associées:

- `GET /api/enterprise/[organizationId]/healthcare`: liste les enregistrements santé filtrés par organisation.
- `POST /api/enterprise/[organizationId]/healthcare`: crée un enregistrement santé.
- `PATCH /api/enterprise/[organizationId]/healthcare/[recordId]`: modifie un enregistrement santé.
- `DELETE /api/enterprise/[organizationId]/healthcare/[recordId]`: archive logiquement un enregistrement santé.

Les routes exigent un membership actif, une organisation cliente active, `sectorCode = HEALTH_CARE`, un module santé activé et une permission organisationnelle compatible. Le rôle global DTSC ne donne aucun accès automatique aux données santé d'une entreprise cliente.

## Activités [Entreprise]

Le module `/enterprise-activities` est visible pour les membres actifs de l'organisation.

Chaque bloc d'activité crée un vrai `EnterpriseActivityRequest` lié à:

- `organizationId`;
- `blockCode`;
- auteur;
- statut;
- priorité;
- module cible éventuel.

Les admins entreprise et managers voient les demandes de l'organisation. Les membres voient leurs propres demandes ou celles qui leur sont assignées.

## Sécurité multi-tenant

Les fonctions centrales sont:

- `canAccessEnterpriseModule(userId, organizationId, moduleCode, action)`;
- `canAccessEnterpriseActivity(userId, organizationId, blockCode, action)`;
- `canManageEnterpriseAdministration(userId, organizationId)`;
- `requireEnterpriseMembership(session, organizationId)`.

Elles vérifient au minimum:

- session utilisateur;
- membership actif;
- organisation active;
- rôle organisationnel;
- module ou bloc activé;
- plan d'abonnement si le module l'exige.

Un rôle global DTSC ne donne aucun droit automatique sur ces modules.

## Ajouter un nouveau secteur

1. Ajouter le secteur dans le seed SQL de migration ou dans une migration dédiée.
2. Ajouter au moins un template actif.
3. Ajouter modules, postes, départements, blocs d'activités et workflows.
4. Documenter le secteur dans ce fichier.
5. Tester la prévisualisation et l'application du modèle.

## Ajouter un nouveau module sectoriel

1. Ajouter le module dans `SectorTemplateModule`.
2. Ajouter une section `EnterpriseAdminSection` via l'application du template.
3. Ajouter les permissions attendues dans les postes concernés.
4. Ajouter un bloc d'activité si les collaborateurs doivent soumettre des informations vers ce module.
5. Ajouter les routes métier avant d'afficher des actions avancées dans l'UI.
