# Hotfix #859 — Édition des workflows et validation ERP

**Statut : PR #860, en attente de certification.** Priorité P1 avant #857. Source canonique des droits : module-access + services Budget/Expense ; aucun bypass par l'éditeur.

## Diagnostic
Les templates Budget et Expense utilisent initialement DEPARTMENT_MANAGER. Il recherche le responsibleUserId du département de l'objet, puis un membership actif dans le tenant, ce qui ne couvre pas tous les approbateurs Finance autorisés. Les modifications de nœuds existants passaient par JSON et les erreurs de sauvegarde Zod pouvaient être anglaises. La liste manuelle de dépenses appliquait les filtres de visibilité sans expliquer pourquoi elle était vide.

## Correctifs
- Brouillon : valider avant PATCH et vérifier séparément au serveur ; retourner des codes stables et chemins de champ plutôt qu'un message Zod interne. Les versions PUBLISHED restent immuables et les conflits d'édition bloquent la sauvegarde.
- Nouveau GET /workflows/[id]/assignees : exige workflow edit + accès à la source dans le tenant actif. Énumère seulement les membres actifs disposant de permission ERP approve, leurs rôles effectifs et postes et les départements ayant un responsable éligible. Aucun candidat ne constitue une permission.
- Éditeur : formulaires de choix du mode/rôle/poste/membre/département pour étapes existantes ASSIGN et CREATE_APPROVAL, avec JSON avancé facultatif.
- Exécution : SPECIFIC_ROLE peut référencer un rôle organisationnel, un poste ou un rôle d'entreprise actif. L'exécution revérifie ERP approve, module/tenant et séparation des tâches, sans privilège implicite. Le service canonique bloque toute divergence avec une approbation ERP déjà en attente.
- Lancement manuel : source EnterpriseExpense est créée dans ERP > Budgets et dépenses > Nouvelle dépense. État vide distingue absence de données visibles et manque de documents globaux sans révéler les dépenses de tiers ; lien module renvoyé par API.

## Recette manuelle
Créer un budget/dépense DRAFT et renseigner un département. Sur le template, choisir un autre validateur habilité ou un rôle qui a ERP approve, sauvegarder le brouillon et publier après revue. Soumettre depuis Finance avec un validateur désigné ; vérifier la reprise idempotente sans deuxième demande. Un demandeur ne valide jamais sa propre action. Vérifier options vides FR/EN sous membership restreint, deux tenants et 320-414 px.

## Hors périmètre
Aucune migration, aucune relaxation des contraintes READY/CLAIMED inertes du ledger, aucune activation du scheduler ou nouveau worker. Parent #852 et QA #857 restent séparés.

## Rollback
Revert du PR #860 via PR de gouvernance ; pas de restauration DB ni backfill.

## Reuse of canonical already-pending approvals
On ERP SUBMIT, a Budget/Expense may already have an authoritative PENDING EnterpriseApproval. When a default template DEPARTMENT_MANAGER has no valid department or an unauthorized manager, the step can reuse *only* the existing, designated ERP approver after a fresh module approve check and no-self check. An explicitly selected department, member or role never silently falls back to someone else. If an eligible rule resolves to a different member, the run returns a conflict rather than creating a second approval.

Manual source lists include only budget DRAFT/PREPARING/CORRECTION_REQUESTED/PENDING_APPROVAL and expense DRAFT/PENDING_APPROVAL, always scoped to ownership and tenant. Existing completed/cancelled records are not proposed for a new approval.
