# DTSC HEALTH CARE — Matrice d'intégration des six hotfixes
Version candidate : 1.17.3 · Date : 13/11/2026 · **Non fusionnée, non déployée**

## Périmètre implémenté
- #1146 HEALTH-01 : autorisations cliniques distinctes, résultats laboratoire individuels, masquage des projections et KPI canoniques.
- #1147 HEALTH-02 : navigation compacte Design 2.0 des onze modules, recherche, workspace plein écran FR/EN.
- #1148 HEALTH-03 : rendez-vous anti-chevauchement, verrou professionnel et organisation, messages 409.
- #1149 HEALTH-04 : stock pharmacie sérialisé par produit, contrôle des types d'échantillons.
- #1150 HEALTH-05 : paiements médicaux Decimal, lock facture, anti-doublons de référence.
- #1151 HEALTH-06 : protection des récits qualité, stockage documentaire privé, numérotation atomique des versions, KPI Qualité complets.

## Gates E2E bloquants
- [ ] Git diff --check, gouvernance, génération Prisma et migrations sur PostgreSQL isolé.
- [ ] Type-check, lint, `pnpm qa:health-preflight`, QA régression, build.
- [ ] Concurrence réelle sous PostgreSQL : créneaux RDV, mouvements de stock, paiements, versions documentaires et résultats multi-examens.
- [ ] Parcours de bout en bout fictif : patient → RDV → consultation → examen → labo → ordonnance → pharmacie → facture → assurance → paiement → trésorerie → comptabilité.
- [ ] Vérifier aucune opération en double, ni fuite de données cliniques.
- [ ] 11 modules × rôles × mobile 320/360/375/390/414/768/1024 × FR/EN × clair/sombre.
- [ ] Isolation tenant et révocation en cours de session.
- [ ] Validation explicite « E2E final BON » du propriétaire seulement lorsque toutes les fonctions demandées sont réalisées.

## Reste à développer — Issues toujours ouvertes
- MPI patient, fusion vérifiée, dossier longitudinal et ordonnances structurées; calendrier plannings/salles/congés.
- Design 2.0 de tous les registres avec filtres et pagination serveur, exports premium, notifications.
- LIS complet échantillons multiples, rapports signés, codes LOINC.
- Source unique d'inventaire ERP, lots/mouvements/valorisation, stocks multi-entrepôts, COGS idempotent.
- Convergence Finance Santé → facture/caisse/trésorerie/comptabilité canoniques, HIRMS et tiers payeurs multiples.
- Archivage, consentement et antivirus, CAPA avancé, FHIR/DICOM, capacités hospitalières futures.

## Politique de livraison
Cette PR est un candidat d'**intégration Draft**. Ne pas fusionner ni déployer tant que tous les critères ouverts ne sont pas satisfaits et que le propriétaire n'a pas donné son E2E final BON. Les hotfixes par tranche restent tracés séparément.

## Preuve intermédiaire non-E2E
Le 13/11/2026, les assertions contractuelles HEALTH-01 à HEALTH-06 ont été inspectées par lecture des fichiers de cette branche. Le véritable service `actionHealthLabRequest`, exécuté avec une transaction Prisma simulée, a validé six scénarios : résultats indépendants par examen, validation, correction préservant l'historique, rejet d'examens manquants, isolation entre organisations et rollback sur état périmé. Cela **ne certifie pas** la migration PostgreSQL, la CI globale, le navigateur ni l'E2E client.
