# Hotfix #566 — Administration entreprise → contrats RH

## Statut

Hotfix P1. Baseline : `main@b2e9fee9f817d9f5a67be90f2615cbfb15aaf637`.

## Problème observé

Dans une entreprise cliente, le bloc **Administration entreprise → Collaborateurs** contient les personnes invitées et les membres actifs. Après acceptation d’une invitation, le membre devient `OrganizationMember.status = ACTIVE`.

Le formulaire de contrat RH utilisait pourtant uniquement `EnterpriseEmployee`. Une personne pouvait donc :

1. avoir accepté l’invitation ;
2. apparaître comme collaborateur actif de l’entreprise ;
3. être autorisée à utiliser DTSC Platform ;
4. rester invisible dans la combobox du contrat faute de `EnterpriseEmployee` déjà créé.

Le message de remédiation vers « Employés et collaborateurs » était en outre incorrect pour le parcours d’une entreprise cliente : la source d’identité organisationnelle visible par l’administrateur est **Administration entreprise → Collaborateurs**.

## Frontière métier corrigée

```text
Invitation entreprise
        ↓ acceptation
OrganizationMember ACTIVE
        ↓
accès / rôle / poste officiel dans Administration entreprise
        ≠
relation d'emploi RH créée automatiquement

Création explicite d'un contrat
        ↓
réutiliser EnterpriseEmployee lié s'il existe
        OU
initialiser EnterpriseEmployee dans la transaction du contrat
        ↓
EnterpriseEmploymentContract PENDING_APPROVAL
        ↓ validation indépendante
contrat actif / données contractuelles autoritatives
```

L’acceptation d’une invitation n’est donc jamais interprétée comme une embauche. L’acte RH explicite est la soumission du contrat.

## Initialisation du dossier RH

Pour un `OrganizationMember` actif sans dossier RH :

- le service revalide `organizationId`, `status = ACTIVE` et `removedAt = null` ;
- il réutilise le poste officiel du membre s’il correspond encore à un `EnterprisePosition` actif du tenant ;
- il dérive le département du poste canonique ;
- il ne devine aucun site ;
- il initialise `EnterpriseEmployee.hireDate` avec **la date de début du contrat**, et non la date d’acceptation de l’invitation ;
- il conserve le nom/email du compte comme source d’identité affichée ;
- l’unicité Prisma `(organizationId, organizationMemberId)` empêche les doublons ;
- si un dossier existe déjà, il est réutilisé ;
- si l’opération de contrat échoue, la transaction entière est annulée.

## Identité structurée

`User` expose un nom d’affichage unique, tandis que `EnterpriseEmployee` conserve historiquement `firstName` et `lastName` obligatoires. Pour l’initialisation automatique, le service :

- conserve `User.name` comme `displayName` canonique de départ ;
- place le premier segment dans `firstName` ;
- place les segments restants dans `lastName` ;
- ne tente pas de déduire ou d’inventer une identité civile absente.

Ces champs RH restent modifiables par les parcours RH prévus ; le membership utilisateur n’est pas dupliqué comme une nouvelle identité d’authentification.

## UX

La combobox **Collaborateur** du nouveau contrat agrège désormais :

- les collaborateurs déjà liés à un dossier RH actif ;
- les membres actifs d’Administration entreprise encore sans dossier RH.

Un membre sans dossier RH est marqué comme provenant d’**Administration entreprise**. Sa sélection préremplit le poste/département lorsque le poste officiel est reconnu. Le site reste vide en l’absence de référence canonique.

Si aucun collaborateur actif n’existe, le message indique :

> Administration entreprise → Collaborateurs

et demande d’attendre que l’invitation soit acceptée avant de créer le contrat.

Le formulaire ne mentionne plus « Employés et collaborateurs » comme prérequis de navigation pour une entreprise cliente.

## Validation indépendante

Ce hotfix ne modifie pas la règle de séparation des rôles :

- le créateur d’un contrat ne peut pas approuver son propre contrat ;
- l’approbateur doit être un membre actif disposant de la capacité `approve` sur `HUMAN_RESOURCES` ;
- aucune auto-validation de secours n’est ajoutée.

## Temps et paie

Le membership seul ne donne pas naissance à des objets Temps ou Paie.

- Planning, présence, congés et timesheets continuent de référencer `EnterpriseEmployee`.
- La paie continue d’exiger un dossier RH et un contrat actif selon ses invariants.
- Une personne devient donc disponible pour ces domaines seulement après l’initialisation RH explicite liée au contrat, jamais à la seule acceptation de l’invitation.

## Sécurité / multi-tenant

- membre revalidé dans le même `organizationId` ;
- membres `INVITED`, `REMOVED` ou `SUSPENDED` exclus ;
- poste/département/site revalidés dans le tenant ;
- approbateur revalidé indépendamment ;
- l’UI n’est jamais une frontière d’autorisation ;
- aucune mutation n’est ajoutée à la route d’acceptation d’invitation.

## Base de données

Aucune migration. Le modèle existant fournit déjà :

- `EnterpriseEmployee.organizationMemberId` ;
- `@@unique([organizationId, organizationMemberId])` ;
- `EnterpriseEmployee.hireDate` ;
- les références de poste/département nécessaires.

## QA anti-régression

`qa-enterprise-hr-payroll-checks.mjs` protège désormais notamment :

- la création de contrat avec exactement une identité `employeeId` ou `organizationMemberId` ;
- l’upsert idempotent du dossier RH ;
- `hireDate = contract.startDate` ;
- la lecture des membres actifs du tenant ;
- la présence des collaborateurs Administration entreprise dans la combobox ;
- l’absence du texte « Employés et collaborateurs » dans ce formulaire ;
- l’absence totale de création/upsert `EnterpriseEmployee` dans la route d’acceptation d’invitation.

## Livraison

- Issue : #566
- Branche : `fix/566-enterprise-admin-hr-contract-link`
- Aucun Preview Vercel.
- Production uniquement depuis `main` après CI verte et `OWNER_E2E #566`.
