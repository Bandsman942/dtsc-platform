# Changelog — Gaming Bookings #642

## Résumé

Le lot #642 ajoute `GAMING_BOOKINGS` en BETA pour gérer les réservations de postes du Gaming Lounge sans créer de nouvelles sources de vérité parallèles.

## Fonctionnalités livrées

- réservation d’un poste sur un créneau borné à 24 h ;
- client CRM facultatif ou joueur occasionnel sans fiche client artificielle ;
- site affiché depuis l’`EnterpriseAsset` du poste ;
- statuts `DRAFT`, `CONFIRMED`, `CHECKED_IN`, `NO_SHOW`, `CANCELLED`, `CONVERTED` ;
- modification avec révision optimiste ;
- garde transactionnelle et DB contre les chevauchements `CONFIRMED/CHECKED_IN` ;
- journal `EnterpriseGamingBookingTransition` avec idempotence persistée ;
- conversion atomique d’une réservation check-in en une seule `EnterpriseGamingSession` ;
- vues Liste et Calendrier/agenda ;
- recherche paginée de clients depuis `CRM_CUSTOMERS` ;
- APIs sécurisées avec same-origin, Zod, rate limit, AuditLog et ApiLog ;
- messages métier FR/EN ;
- QA ciblée #642 raccordée à `qa:regression`.

## Invariants

- aucun `GamingCustomer`, `GamingSite`, `GamingPayment` ou calendrier métier parallèle ;
- aucun plafond de cinq postes ;
- un conflit de réservation est décidé côté serveur/DB, jamais par React ;
- une réservation ne peut produire qu’une session via l’unicité `(organizationId, bookingId)` ;
- la conversion ne crée ni prix, ni facture, ni paiement : ces responsabilités restent #643/#644.

## Données et migrations

Migrations additives :

- `20260914210000_gaming_bookings_engine` ;
- `20260914210500_gaming_booking_conflict_guard`.

Aucune migration historique n’est modifiée et aucun `DROP` n’est introduit.

## Rollback

Désactiver `GAMING_BOOKINGS` et ses routes/workspace tout en conservant les réservations, transitions et sessions déjà créées. Les migrations restent en place pour préserver l’historique.
