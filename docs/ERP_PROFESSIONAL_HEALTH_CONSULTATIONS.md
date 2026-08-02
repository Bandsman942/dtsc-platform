# Module professionnel Health — Consultations

**Code canonique :** `CONSULTATIONS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le module organise la consultation clinique en sections : patient et rendez-vous, motif, antécédents utiles, allergies, constantes vitales, examen, hypothèses, diagnostics, actes, prescriptions, examens demandés, conduite à tenir, suivi et documents.

## Cycle de vie

Les consultations peuvent être préparées, ouvertes, complétées, mises en attente d’examens, clôturées et rouvertes uniquement par une action autorisée. Une consultation clôturée n’est jamais modifiée silencieusement ; la raison et l’acteur d’une correction sont conservés.

## Expérience

Le workspace dédié propose recherche, filtres par patient, praticien, date et statut, détail professionnel, calcul de l’IMC lorsque les mesures sont disponibles, actions contextuelles et formulaire responsive.

## Confidentialité

Les informations cliniques sont masquées ou refusées selon les permissions. Finance ne peut pas accéder au diagnostic, aux notes cliniques ou aux prescriptions détaillées. Toute référence patient, rendez-vous ou praticien est revalidée dans l’entreprise active.

## Intégrations

Une consultation peut alimenter le dossier médical, le laboratoire, la prescription, la pharmacie interne, la facturation et les documents via des relations structurelles, sans dupliquer la source financière commune.

## Validation

QA automatisée : modèles dédiés, constantes, transitions, clôture, permissions, audit et responsive.
E2E propriétaire : scénario `I06-H-002` et confidentialité `I06-H-005`.
