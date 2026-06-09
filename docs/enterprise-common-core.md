# Socle commun ERP des entreprises clientes

## Objectif

Le socle commun fournit les référentiels et parcours utilisables par toutes les entreprises clientes, indépendamment de leur secteur. Les modules sectoriels Santé, Pharmacie et futurs secteurs se branchent sur ces données sans les dupliquer.

## Navigation

La navigation latérale d'une entreprise expose uniquement les modules `isCore` actifs et inclus dans l'abonnement. Les modules sectoriels restent regroupés dans `Administration [entreprise]`, dans leur espace métier dédié. Le panneau générique `Modules entreprise` suit la même règle afin d'éviter les cartes répétées.

## Sources de vérité actuelles

- collaborateurs et invitations: `OrganizationMember` et `User`;
- départements: `EnterpriseDepartment`;
- postes et permissions par défaut: `EnterprisePosition.permissionsJson`;
- workflows: `EnterpriseWorkflow`;
- demandes, tâches et actions partagées: `EnterpriseActivityRequest`;
- réunions et événements: `InternalCalendarEvent`;
- données sectorielles: `EnterpriseSectorRecord` et tables métier dédiées;
- historique: `AuditLog` avec `metadata.organizationId`.

Toutes les lectures sont filtrées par `organizationId`. Les relations sélectionnées dans les routes mutantes doivent appartenir à la même organisation.

## Pages des modules communs

Les pages `/enterprise-modules/[moduleCode]` sont réservées aux modules du socle commun. Elles affichent désormais les données réelles disponibles pour l'entreprise: collaborateurs, départements, postes, workflows, demandes, calendrier, audits et données liées au module. Les actions disponibles renvoient vers `Administration [entreprise]` ou `Activités [entreprise]`, où les mutations sont validées, limitées par rôle et auditées.

Un état vide indique explicitement qu'aucune donnée n'est encore enregistrée et propose les parcours de création existants. Aucun chiffre fictif n'est affiché.

## Relations et flux

Les demandes et actions collaboratives utilisent `EnterpriseActivityRequest` avec un créateur, un destinataire actif, un bloc d'activité et un module cible. Les workflows peuvent être partagés à des collaborateurs et déclenchent des notifications. Les départements et postes servent de référentiels aux modules sectoriels.

Flux commun actuellement pris en charge:

1. un collaborateur soumet une demande depuis `Activités [entreprise]`;
2. la route vérifie session, membership, module actif, permission et destinataire de la même organisation;
3. la demande persistée est visible par son créateur, son destinataire et les gestionnaires autorisés;
4. les responsables reçoivent une notification;
5. la création est inscrite dans `AuditLog`.

## Sécurité

- session et contexte organisation obligatoires;
- membership actif et module autorisé;
- entitlements du plan appliqués;
- origine identique, validation Zod et rate limit sur les mutations;
- filtrage systématique par `organizationId`;
- actions sensibles journalisées;
- modules sectoriels non accessibles via les pages génériques du socle commun.

## Évolutions prévues

Les tables dédiées aux tâches multi-relations, opérations, demandes d'achat, budgets, documents et commentaires communs doivent être ajoutées par migrations non destructives au fur et à mesure des itérations. Elles doivent réutiliser les référentiels ci-dessus et conserver `organizationId`, auteur, dates, statut et audit.
