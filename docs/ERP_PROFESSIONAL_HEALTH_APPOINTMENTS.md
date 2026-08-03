# Module professionnel Health — Rendez-vous

**Code canonique :** `APPOINTMENTS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le module planifie et suit les rendez-vous par patient, praticien, service, site, date, heure, durée, canal, priorité et motif administratif.

## Vues et cycle

Le workspace dédié fournit recherche, filtres, liste et vue planning. Les statuts contrôlés couvrent planification, confirmation, arrivée, attente, consultation, réalisation, report, annulation et absence selon les transitions autorisées.

La conversion en consultation est idempotente : un rendez-vous ne crée pas plusieurs consultations.

## Sécurité et confidentialité

Le motif affiché dans les notifications reste administratif et générique. Les routes revalident le patient, le professionnel et le site dans le même `organizationId`. Les changements de statut et actions sont historisés.

## Mobile

La planification, l’arrivée et les actions rapides restent utilisables sur 320–412 px. Les formulaires longs s’ouvrent dans un espace scrollable adapté au clavier mobile.

## Intégrations

Le rendez-vous appartient à un patient, peut être assigné à un membre autorisé, converti en consultation et ouvert par lien profond précis.

## Validation

QA automatisée : modèles dédiés, transitions, conversion unique, permissions, audit et responsive.
E2E propriétaire : scénario `I06-H-002` et transversal `I06-X-001`.
