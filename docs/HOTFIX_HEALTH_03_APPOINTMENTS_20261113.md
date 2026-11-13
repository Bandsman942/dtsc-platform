# HEALTH-03 / #1148 — Rendez-vous : protection anti-chevauchement (tranche 1)
Date 2026-11-13 · Branche `fix/1148-health-appointment-guard` · **non fusionnée**.

## Source de vérité et comportement
La table dédiée `HealthAppointment` reste canonique. L'assistance à la réservation est sérialisée pour un `organizationId` et un `professionalId` via `pg_advisory_xact_lock`, sous transaction Prisma `Serializable`. Les intervalles [début, fin) permettent deux rendez-vous adjacents; seules les réservations SCHEDULED, CONFIRMED, WAITING, IN_PROGRESS bloquent. Une durée non fournie correspond à 30 minutes; les fiches historiques sans `endAt` utilisent leur durée connue ou 30 minutes.

La garde s'applique lors de la création et de la modification, y compris aux changements de médecin ou de durée. Les opérations sans médecin affecté restent possible sous la responsabilité de l'établissement; elles ne réservent aucun créneau professionnel. Les collisions renvoient `APPOINTMENT_TIME_CONFLICT` HTTP 409 et un message humain.

## QA / E2E requis
- [ ] Même professionnel, créneau se chevauchant : 409, rien créé.
- [ ] Créneaux adjacents et professionnels distincts : autorisés.
- [ ] Même professionnel dans deux organisations : aucune collision.
- [ ] Mise à jour du même rendez-vous : autorisée, les collisions avec d'autres sont bloquées.
- [ ] Deux utilisateurs soumettent simultanément un créneau : un seul rendez-vous validé.
- [ ] Durées 5 à 1440 minutes, heure limite et fuseau organisateur.
- [ ] Confirmation, annulation, absence, réaffectation et conversion clinique sans duplication.
- [ ] Disponibilités récurrentes, exceptions et congés : **non couverts par cette tranche**, voir issue #1148.
- [ ] Régressions Patient/Lab/Consultation/RH/Calendrier, mobile/FR/EN, CI et E2E propriétaire.

**Autres critères de #1148 non terminés** : MPI patient et fusion contrôlée, dossiers longitudinaux, consultations/prescriptions structurées, disponibilité/salles; ils restent ouverts pour les prochaines tranches. Aucun E2E propriétaire déclaré.
