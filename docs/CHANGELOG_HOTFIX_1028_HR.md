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
