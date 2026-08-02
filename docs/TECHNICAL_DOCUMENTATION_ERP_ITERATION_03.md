# Documentation technique — Professionnalisation ERP — Itération 03

## Référence

- Repository : `Bandsman942/dtsc-platform`
- Branche : `feat/erp-professionalization-iteration-03-operations-hr-projects`
- SHA de départ : `b4760929aa4ff5531f6bb819481c190ef7804171`
- Pull Request : `#41`
- Date d’évaluation : 2 août 2026

Ce document complète `docs/TECHNICAL_DOCUMENTATION.md` sans remplacer son historique général.

## Architecture des expériences ERP

Les neuf modules canoniques de l’itération 3 sont résolus par le registre courant puis routés vers des workspaces dédiés dans :

```text
app/enterprise-modules/[moduleCode]/page.tsx
```

Workspaces dédiés :

- `EnterpriseSalesOperationsWorkspace`
- `EnterpriseProcurementOperationsWorkspace`
- `EnterpriseInventoryOperationsWorkspace`
- `EnterpriseHumanResourcesWorkspace`
- `EnterpriseTimeAttendanceWorkspace`
- `EnterprisePayrollOperationsWorkspace`
- `EnterpriseProjectsDeliverablesWorkspace`
- `EnterpriseAssetsMaintenanceWorkspace`

Le workspace générique reste disponible uniquement pour les modules non encore professionnalisés. Il n’est plus l’expérience principale de ces neuf domaines.

## Navigation globale des relations

La navigation canonique du module global est définie dans :

```text
lib/navigation/company-relationships.ts
```

Elle fournit :

- code et route uniques ;
- libellés français et anglais ;
- libellé mobile court ;
- icône et ordre ;
- statuts comptabilisés dans le badge.

Le compteur est calculé dans `AppShell` directement pour l’utilisateur connecté. Il ne dépend pas de l’organisation active. Les rails desktop et mobile consomment la même configuration. La deuxième ligne mobile ramène l’élément actif dans la zone visible.

## Workspace Relations avec les entreprises

Le workspace global est organisé en quatre vues :

```text
À traiter
Relations actives
Mes demandes
Historique
```

La nouvelle route d’annulation utilisateur est :

```text
POST /api/account/identity-links/cancel
```

Contrôles : same-origin, session, rate limit, Zod, statut autorisé, origine `USER`, révision optimiste, transaction, événement d’historique, ApiLog et AuditLog.

## API de sélecteurs opérationnels

Route :

```text
GET /api/enterprise/:organizationId/operational-lookups?module=<code>
```

Cette route résout les références professionnelles requises par les formulaires :

- membres actifs ;
- collaborateurs actifs ;
- départements ;
- tiers ;
- sites, entrepôts et emplacements ;
- articles suivis ;
- projets ;
- périodes de paie ;
- catégories d’actifs ;
- fournisseurs ;
- contrats actifs.

La route vérifie l’accès au module et filtre toutes les données par `organizationId`. Les identifiants restent internes aux valeurs des combobox ; ils ne sont jamais demandés à l’utilisateur.

## Ventes

Le workspace consomme les APIs canoniques de devis et commandes. Les calculs définitifs restent côté serveur. La livraison utilise le service de fulfillment existant avec reliquat et clé idempotente.

Frontière :

```text
commande ≠ facture ≠ créance ≠ paiement
```

## Achats

Le nouveau workspace compose les workspaces fournisseurs et achats existants. Aucun modèle concurrent n’est ajouté. La réception continue d’utiliser le moteur stock commun.

Frontière :

```text
commande fournisseur
↔ réception
↔ facture fournisseur future
```

## Stock

Le workspace expose :

- stock par article et emplacement ;
- transferts ;
- inventaires ;
- ajustements contrôlés.

Les services existants conservent les transactions, la protection contre le stock négatif, les validations et l’idempotence.

## Ressources humaines

Le workspace RH réutilise l’identité relationnelle existante et ajoute une expérience dédiée pour les contrats et l’organigramme mobile. La fiche collaborateur reste créable sans compte DTSC.

Les données de rémunération, documents RH et bulletins ne sont pas synchronisés vers l’identité globale.

## Temps et congés

Les congés et feuilles de temps consomment leurs modèles dédiés. Les concepts restent séparés :

```text
disponibilité
≠ absence
≠ présence
≠ temps déclaré
≠ temps approuvé
≠ paie
```

## Paie

L’assistant consomme les périodes, contrats actifs, temps approuvé et variables. Le choix de l’approbateur utilise une liste métier ; aucun UUID n’est saisi. L’approbation génère les bulletins privés via le service existant.

Frontière :

```text
paie calculée ≠ paiement financier
```

La contrainte d’unicité fonctionnelle ignore les paies annulées afin d’autoriser une recréation contrôlée pour la même période.

## Projets et livrables

Routes de détail ajoutées :

```text
GET  /api/enterprise/:organizationId/projects/:projectId/overview
POST /api/enterprise/:organizationId/projects/:projectId/members
```

Le détail regroupe équipe, jalons, risques, incidents et livrables. Le retrait d’un membre est logique. Les transitions de livrables utilisent le service existant et la révision optimiste.

L’accès externe n’est pas déduit automatiquement d’une relation : il exige un partage explicite et une permission objet.

## Actifs

Route de détail ajoutée :

```text
GET /api/enterprise/:organizationId/assets/:assetId/overview
```

Le workspace utilise les APIs existantes d’affectation, retour, maintenance et incident. Les historiques ne sont pas supprimés.

Frontière :

```text
actif opérationnel ≠ immobilisation comptable
```

## Maturité commerciale

Le complément exécutable est :

```text
lib/enterprise/module-commercial-readiness-iteration-03.json
```

Il est fusionné par `module-commercial-readiness.ts`. Les neuf modules sont `PROFESSIONAL_READY` avec `commercializable: false`.

Critères encore ouverts :

- validation E2E authentifiée du propriétaire ;
- packaging commercial final ;
- validations spécifiques sur matériel ou partage externe lorsque pertinentes.

## QA

Quality Gate transversal :

```text
scripts/qa-erp-professional-iteration-03-checks.mjs
```

Les alias de domaine sont intégrés à `package.json` et le contrôle global est exécuté dans `pnpm qa:regression`.

Le plan manuel est :

```text
docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_03.md
```

Statut : **Tests E2E manuels préparés — validation du propriétaire en attente**.

## Migrations

Aucune nouvelle migration Prisma n’a été nécessaire pour les workspaces de cette itération : les modèles et contraintes opérationnels existaient déjà. Aucune migration historique n’a été modifiée.

La validation GitHub Actions sur une base PostgreSQL vide a déjà confirmé :

- génération Prisma ;
- déploiement de toutes les migrations historiques ;
- audits de fresh install ;
- parité financière.

La validation finale des Quality Gates, du build et de la base existante doit être rapportée depuis le SHA final de la PR.

## Rollback

Le rollback applicatif peut :

- masquer une route ou une action ;
- revenir à une consultation protégée ;
- bloquer temporairement de nouvelles écritures ;
- conserver toutes les données et historiques.

Le rollback ne doit jamais supprimer :

- relation ou consentement historique ;
- livraison ou réception ;
- mouvement de stock ;
- paie ou bulletin ;
- temps approuvé ;
- membre ou livrable validé ;
- affectation, retour, maintenance ou incident.

## Production

Le déploiement suit exclusivement :

```text
branche feature
→ Pull Request
→ GitHub Quality Gates
→ fusion dans main
→ pipeline Production existant
```

Aucune commande Vercel manuelle n’est autorisée depuis la branche.
