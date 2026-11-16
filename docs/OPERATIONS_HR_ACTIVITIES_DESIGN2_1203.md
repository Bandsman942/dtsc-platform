# Design DTSC 2.0 transversal — Issue #1203

Date : 16 novembre 2026. **Candidat, aucun E2E propriétaire déclaré.** Merge uniquement après Quality Gates vertes et E2E final explicite.

## Périmètre
- Opérations : `TASKS_OPERATIONS`, `INTERNAL_REQUESTS`, `VALIDATIONS`, `MEETINGS`, `WORKFLOWS`.
- Ressources humaines : `HUMAN_RESOURCES` (collaborateurs, contrats, organigramme), `TIME_ATTENDANCE` (horaires, présences, congés, timesheets et self-service), `PAYROLL_OPERATIONS` (périodes, runs, approbation, documents privés).
- Activités entreprise : actions, demandes et workflows ; parcours sectoriels spécialisés Health/Pharmacy inchangés.

## Architecture conservée
- Source canonique des tâches/requêtes/validations/réunions/workflows/contrats/temps/paie ; aucune deuxième base métier, aucun dual-write.
- Reprise de `ErpDesign2Metric`, `ErpDesign2RegisterSection`, `ErpDesign2RegisterTools` et `FinanceExportControls` issus de « Devis, commandes et livraisons ».
- Densité `compact`, accents KPI, rail statut accessible, calendrier civil jour exact/intervalle, registres et filtres server-first avant pagination. Exports CSV/XLSX/PDF limités à 1 000 objets autorisés et filtrés, sans copies d'écritures comptables ou opérations implicites.
- Filtres dates sur échéance (tâches), création (demandes), demande de décision (validations), début réunion, début d'exécution workflow, début contrat, date de présence, début de congé ou période, date création run paie.
- `/api/enterprise/[organizationId]/activity-requests` : GET paginé tenant-scoped, membership/entitlement, visibilité identique au chargeur historique, projection canonique d'état workflow. L'ancien chargement des 80 demandes récentes reste pour l'aperçu transversal, pas pour le registre paginé.

## Confidentialité et gouvernance
- Aucun export des rémunérations individuelles, clauses contractuelles sensibles, bulletins, notes de présence, motifs de congés, pièces médicales et identifiants techniques RH. Métadonnées métier seulement, après autorisation de lecture de l'API propriétaire.
- Validation indépendante, conflits de révision, cycle de demande, paie et décaissement contrôlés par les services existants. Planification ≠ présence ≠ temps approuvé ; paie approuvée ≠ paiement effectué.
- Les commandes et factures, stock, trésorerie et comptabilité ne sont pas modifiés. Pas de migration ni de variable d'environnement nouvelle.

## QA et livraison
- Contrat : `pnpm qa:operations-hr-activities-design2-1203`; type-check, lint, qa:regression, build, tests historiques coordination et RH.
- Recette manuelle : `docs/OWNER_E2E_1203_OPERATIONS_HR_ACTIVITIES_DESIGN2.md`.
- Dette de vérification : les métriques de synthèse de certains écrans historiques restent des métriques propres à leur domaine, parfois de la page en cours. Elles ne doivent jamais être présentées comme statistiques globales certifiées sans agrégation source dédiée.
- Rollback : revert de la PR uniquement ; pas de migration ni de données rétroactives. Production uniquement depuis `main`, après E2E final BON.
