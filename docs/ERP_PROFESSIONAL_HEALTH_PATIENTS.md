# Module professionnel Health — Patients

**Code canonique :** `PATIENTS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le module gère le référentiel patient isolé par établissement : identité, numéro patient, coordonnées, adresse, contact d’urgence, assurance, alertes, allergies, informations administratives et médicales autorisées, documents et historique.

Un patient peut être créé manuellement sans compte DTSC. La liaison à un compte global est facultative, exige un consentement explicite et ne donne aucun accès clinique automatique.

## Expérience

Le workspace dédié propose recherche, filtres, pagination, création, modification, archivage contrôlé, détail, actions vers Rendez-vous, Consultations, Dossier médical et Documents. Les formulaires restent responsives et les informations sensibles sont masquées sans permission.

## Sécurité

Toutes les routes vérifient membership, secteur Health, module actif, entitlement, permission et `organizationId`. Les références inter-tenant sont refusées. Les modifications sensibles et changements de statut sont audités.

Aucune fusion automatique n’est réalisée sur la base du nom, téléphone, adresse, date de naissance ou similarité.

## Intégrations

La fiche patient peut être reliée aux rendez-vous, consultations, laboratoire, factures communes, prises en charge, paiements et documents, sans copier les données cliniques dans Finance.

## Validation

QA automatisée : modèles dédiés, routes privées, validation Zod, audit, responsive et absence de CRUD générique.
E2E propriétaire : scénario `I06-H-001` et confidentialité `I06-H-005`.
