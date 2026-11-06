# Journal — Hotfix RH #1028

Date de préparation : 5 novembre 2026 (avant validation E2E).

- Dossier employé en sections colorées et dépliables, détails serveur, lien aux activités RH/temps/paie/projets/actifs selon droits.
- Édition optimiste des champs professionnels et archivage/restauration non destructifs sous permission RH `manage`.
- Confidentialité renforcée : salaire et notes RH masqués pour une lecture simple ; historique des révisions réservé aux gestionnaires RH.
- Contrats : snapshot immuable en transaction lors de chaque révision d'un contrat en attente, sans altérer les versions déjà approuvées ; migration additive.
- Organisation : départements dépliables et ouverture du dossier collaborateur.
- FR/EN, couleurs accessibles, responsive et contrôle QA #1028 intégré à la régression.

**Non livré dans #1028 :** bulletins PDF personnels, pointage autonome, rapports de travail et certification de maturité commerciale (#1029).

**État :** CI, revue et E2E propriétaire requis avant fusion ; aucune publication anticipée.


## Tranche 2 — archivage et restauration des contrats (PR #1032 fusionnée, E2E propriétaire BON, Production READY)
- Gestion RH : archive logique des contrats non actifs, motif obligatoire, restauration contrôlée, refus d'archivage des contrats actifs.
- Circuit d'approbation : demandes en attente rendues obsolètes après archivage ; restauration de brouillon sans réactivation automatique.
- UI FR/EN : onglet Contrats courants / Archives, badges et confirmation ; erreurs métier contextualisées.
- Sécurité : droit `HUMAN_RESOURCES:manage`, filtre tenant, révisions optimistes, logs sans montant ; historiques conservés.
- QA : `qa:hotfix-1028-archive` intégrée à `qa:regression` ; E2E propriétaire #1032 BON ; 13 contrôles réussis, 2 contrôles navigateur non déclenchés. Vercel production `main@9e6273983b1c879bac81879293ff1cd7677e4fb1` READY.
- Guide : `docs/HOTFIX_1028_RH_CONTRACT_ARCHIVE_PHASE2.md`.


## Tranche 3 — gestion canonique Organisation (issue #1034, préparation)
- Onglet RH Organisation : édition des départements/postes par réemploi des panneaux d’administration existants ; détail et accès à la fiche salarié conservés.
- La gestion des référentiels exige explicitement `ADMIN_DASHBOARD:manage`, distinct de `HUMAN_RESOURCES:manage` ; lecteurs RH sans accès CRUD.
- Actualisation sans rechargement global du workspace RH après modification de poste ; données chargées uniquement dans l’onglet autorisé.
- QA `qa:hotfix-1034`, documentation `docs/HOTFIX_1034_RH_ORGANISATION_CANONIQUE.md`. **Non déployé : CI/E2E propriétaire requis.**
