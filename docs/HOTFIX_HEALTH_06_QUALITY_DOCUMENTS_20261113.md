# HEALTH-06 / Issue #1151 — Documents, incidents qualité et pilotage (tranche 1)
Date : 13 novembre 2026 · NON FUSIONNÉ / aucun déploiement Production.

## Protection des incidents qualité
- Une vue non clinique reçoit des informations opérationnelles (statut, priorité, échéance, responsable) sans description clinique, titres identifiants, notes, témoins, événements confidentiels ni preuves sensibles; la personne directement impliquée et le rôle clinique habilité peuvent accéder au récit suivant la règle d'accès existante.
- La règle est partagée par la liste et le détail des incidents.
- Le tableau de bord Qualité calcule ses KPI sur toute la base pertinente, et plus sur les 500 incidents d'une liste préchargée. Les agrégations sont isolées par organisation et visibilité, et calculent les mois dans le fuseau de l'entreprise.
- Le JSON de liste signale `pageInfo.hasMore` si la limite visuelle de 500 lignes masque d'autres incidents; cela ne constitue pas encore une pagination serveur complète.

## Protection documentaire
- Une consultation sans droit de téléchargement ne reçoit pas les clés physiques de stockage des documents ou versions.
- Les journaux d'accès restent réservés aux rôles autorisés, ainsi que le téléphone et la date de naissance des patients et les références cliniques sensibles.
- Les noms des incidents liés aux documents sont masqués pour un lecteur non clinique.

## Critères encore ouverts (#1151)
- [ ] Pagination/search/export serveur et UX Design 2.0 sur Qualité/Documents.
- [ ] Consentements, politiques de rétention et accès exceptionnels audités, signatures et circuits documentaires.
- [ ] Scan MIME et antivirus réellement opérationnel, gestion des téléchargements signés et versions concurrentes.
- [ ] Workflow CAPA avancé, escalades, causes racines, tableaux d'audit.
- [ ] Connecteurs FHIR/HL7, LIS, DICOM/PACS, dictionnaires LOINC/ICD-11 sous contrats/licences.
- [ ] Modules futurs admissions/lits/séjours/urgences, études de conformité selon juridictions.
- [ ] Recette réelle E2E multi-tenant, multi-rôles, mobile FR/EN et charge.

`pnpm qa:health-06`, Prisma generate, type-check, lint, QA régression, build et E2E réel du propriétaire sont requis. Aucun succès E2E n'est revendiqué.
