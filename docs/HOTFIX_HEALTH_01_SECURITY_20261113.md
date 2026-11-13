# HEALTH-01 / Issue #1146 — Sécurité clinique et intégrité (hotfix)
Date : 2026-11-13 · Candidat : v1.17.2 · **NON FUSIONNÉ — aucun déploiement Production**.

## Risques et corrections embarquées
1. Les consultations ne sont plus créées, modifiées, clôturées ou rouvertes par le seul rôle administratif. L'utilisateur doit avoir une affectation clinique Santé active (DOCTOR, SPECIALIST_DOCTOR, MEDICAL_DIRECTOR) et l'autorisation `health.consultations.view_sensitive`. Les administrateurs sans habilitation restent hors de ce droit.
2. La lecture des données médicales sensibles du patient repose sur des autorisations cliniques explicites. Les modifications administratives rejettent les valeurs médicales non autorisées et ne peuvent écraser des notes sensibles.
3. Laboratoire : `HealthLabRequestItem` reçoit ses résultats **par identifiant d'examen**. Une demande multi-examens exige un résultat indépendant par ligne, refuse les IDs en double/hors demande, interdit la validation d'éléments manquants et conserve les résultats lors d'une correction motivée. Écriture avec contrôle d'état et transaction `Serializable`. Le formulaire affiche un bloc par examen.
4. Registres Santé : les nouvelles projections historiques portent un numéro neutre, sans nom patient, motif ni résumé clinique. Les anciennes projections sont maintenant expurgées à la lecture via l'API générique et le loader Admin pour les onze modules dédiés. Les copies stockées en base et autres lecteurs directs nécessitent toujours un backfill sûr et une revue d'accès.
5. Tableau de bord : nouveaux KPI `GET .../healthcare/dashboard`, agrégations Prisma sur les tables Santé canoniques, date d'entreprise résolue dans son timezone. Le panneau ne montre aucun chiffre extrapolé depuis une sélection partielle de 300 objets historiques.
6. QA contractuelle `pnpm qa:health-01`, régression et documentation ajoutées.

## Restes bloquants pour clôturer #1146
- [ ] Anonymiser les anciennes projections `EnterpriseSectorRecord` avec script dry-run, sauvegarde, audit des consommateurs et opération réversible.
- [ ] Revoir toutes les surfaces de lecture indirecte, y compris activités, exports, logs, outils IA et notifications.
- [ ] Élargir la matrice de permissions explicites aux autres modules cliniques et à la relation de soin (pas de gestionnaire implicite).
- [ ] Tester les transactions réelles Prisma/Postgres et les accès multi-acteurs, y compris la concurrence et la révocation.
- [ ] Harmoniser les statuts financiers/concurrence dans HEALTH-05.
- [ ] Documenter et valider l'acceptance E2E propriétaire.

## Recette E2E attendue (base isolée, données fictives)
- HEALTH-P0-01 Directeur admin sans affectation médicale : impossible créer/éditer consultation (403) et accès données sensibles masqué.
- HEALTH-P0-02 Médecin avec affectation active et droit explicite : peut créer/éditer et clôturer selon droits.
- HEALTH-P0-03 Médecin suspendu ou sans autorisation : refus immédiat après révocation.
- HEALTH-P0-04 Réceptionniste : peut créer et modifier identité/contact sans écraser allergies, traitements ni notes médicales.
- HEALTH-P0-05 Laborantin : prélèvement puis analyse 3 examens distincts, 3 résultats et unités distinctes, aucune propagation.
- HEALTH-P0-06 Résultat manquant, ID étranger, ID dupliqué, mauvaise organisation : rejet sans aucune mutation.
- HEALTH-P0-07 Validation sans tous les résultats ou concurrence de transitions : rejet sans état incohérent.
- HEALTH-P0-08 Correction motivée après validation : résultats antérieurs conservés jusqu'à remplacement contrôlé; historique présent.
- HEALTH-P0-09 Plus de 300 patients, 500 rendez-vous, 600 examens : compteurs totaux exacts sur le modèle canonique.
- HEALTH-P0-10 Fuseau et bornes jour/mois (incluant DST) conformes à l'entreprise.
- HEALTH-P0-11 Tenant voisin, utilisateur sans ADMIN_DASHBOARD.manage : aucun KPI (403/404).
- HEALTH-P0-12 Aucune donnée médicale dans le JSON KPI, miroir neuf, journaux et notifications; historique existant explicitement audité.
- HEALTH-P0-13 Navigation et lisibilité mobile, FR/EN, accessibilité clavier.
- HEALTH-P0-14 `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:health-01`, `pnpm qa:regression`, `pnpm build`, E2E réel et feu vert propriétaire.

La QA statique ne remplace pas les tests de bout en bout ni la certification patient/labo. Toute fonction inachevée reste ouverte dans l'issue.
