# Modèle de la vue générale SaaS

Chaque KPI contient une source, une définition, une unité, une période et une date de fraîcheur. Les sources sont les tables canoniques `User`, `Organization`, abonnements, paiements, tickets, usage IA, `ApiLog`, `WebhookEvent`, incidents, maturité et `SiteVisit`.

Les périodes supportées sont 1, 7, 30, 90 et 365 jours, ainsi qu’une date précise. Les drill-downs ouvrent une section filtrée. La file d’actions ne duplique pas les objets sources : elle pointe vers paiements échoués, tickets urgents, webhooks en erreur, incidents et maturités bloquées.

Aucun pays, appareil ou conversion n’est affiché sans donnée collectée et définition explicite.
