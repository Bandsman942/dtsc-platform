# Guide utilisateur — Tarifs & forfaits Gaming / Gaming pricing & packages

## Français

### Avant de créer un tarif

1. Créez ou vérifiez le **service** dans le module Catalogue. L’offre doit être un `SERVICE` actif.
2. Vérifiez que la devise voulue est active dans le référentiel des devises de l’entreprise.
3. Vérifiez les postes Gaming et, si nécessaire, leur famille de console et capacité joueurs.

### Créer une règle

Ouvrez **Tarifs & forfaits Gaming** puis **Nouvelle règle**.

Renseignez : code, service catalogue, mode, montant, devise et priorité. Les critères complémentaires sont optionnels : poste, famille de console, joueurs min/max, jours, plage horaire, validité et libellé.

Pour `FIXED_DURATION` et `PACKAGE`, la durée en minutes est obligatoire. Pour `PER_MINUTE` et `PER_HOUR`, l’incrément permet de contrôler l’arrondi facturable.

Une règle `DRAFT` n’est pas utilisée pour calculer les sessions. Une règle `ACTIVE` peut être sélectionnée par le moteur serveur. Une règle `INACTIVE` est conservée mais ignorée par les nouveaux calculs.

### Comprendre la priorité

Le serveur ne choisit jamais un tarif selon l’ordre visuel du navigateur. Il filtre d’abord les règles compatibles puis les départage de façon stable : priorité croissante, spécificité décroissante, puis code/id.

Exemple : deux règles actives compatibles avec priorité 100 seront départagées par la plus spécifique (poste précis avant règle globale, puis famille/joueurs/durée/créneau, etc.).

### Simuler avant de démarrer

Utilisez **Simuler un tarif**. Choisissez service, poste, durée et joueurs. Le résultat indique la règle retenue et le montant estimé. Cette action ne crée aucune session, facture, vente ou transaction financière.

La date/heure de simulation est facultative. Si elle n’est pas renseignée, le serveur utilise l’instant courant. Elle est utile pour tester à l’avance une plage horaire ou un jour particulier.

### Démarrer une session tarifée

Dans **Sessions de jeu**, choisissez un poste, un service catalogue, une durée et le nombre de joueurs. **Calculer le tarif** permet de visualiser le montant avant le démarrage.

Au démarrage, le serveur recalcule le tarif dans la même transaction que la session. Le résultat est stocké en snapshot. Le montant aperçu dans le navigateur n’est donc jamais l’autorité métier.

### Démarrer une session depuis une réservation

Dans **Réservations Gaming**, enregistrez d’abord l’arrivée du joueur. Sur une réservation `CHECKED_IN`, choisissez **Démarrer la session**.

Le dialogue demande alors le service actif du Catalogue à utiliser. Cliquez **Calculer le tarif** : la simulation reprend automatiquement le poste, la durée réservée et le nombre de joueurs de la réservation. Le démarrage reste bloqué tant qu’aucun aperçu valide n’a été obtenu.

Lors de la conversion, le serveur recalcule le tarif dans la même transaction que la création de la session et le passage de la réservation à `CONVERTED`. La session conserve `bookingId`, le service, la règle tarifaire, le snapshot, la devise et le montant estimé. Aucun paiement n’est créé à cette étape.

### Modifier un tarif pendant une session

Vous pouvez modifier ou désactiver la règle pour les futures sessions selon vos permissions. La session déjà démarrée conserve son snapshot d’origine. À sa fin, le montant final est calculé depuis ce snapshot et son temps facturable, pas depuis la règle actuelle.

### Dérogation

Une dérogation n’est disponible qu’aux utilisateurs ayant le droit de gestion Pricing. Le montant et le motif sont obligatoires ensemble. Le serveur conserve le montant, le motif et l’acteur dans le snapshot et dans l’audit.

### Ce que #643 ne fait pas

Un montant Gaming n’est pas encore un paiement. Facturation, encaissement, caisse, banque, Mobile Money, reçu et clôture seront pris en charge par le lot #644 via les modules Finance communs.

---

## English

### Before creating a price

1. Create or verify the **service** in Catalog. The offer must be an active `SERVICE`.
2. Make sure the intended currency is active in the organization currency registry.
3. Verify Gaming stations and, when relevant, their console family and player capacity.

### Create a rule

Open **Gaming pricing & packages** and choose **New rule**.

Enter code, catalog service, mode, amount, currency, and priority. Optional targeting includes station, console family, min/max players, weekdays, time window, validity dates, and an internal label.

`FIXED_DURATION` and `PACKAGE` require a duration in minutes. `PER_MINUTE` and `PER_HOUR` can use a billing increment to control server rounding.

A `DRAFT` rule is never used for new session calculations. An `ACTIVE` rule is eligible. An `INACTIVE` rule remains historical but is ignored for new calculations.

### Understand priority

The server never chooses a price based on browser display order. It filters compatible rules and resolves them deterministically: ascending priority, descending specificity, then code/id.

### Simulate before starting

Use **Simulate price**. Select service, station, duration, and player count. The result shows the selected rule and quoted amount. Simulation creates no session, sale, invoice, payment, or treasury movement.

Simulation date/time is optional. If omitted, the server uses the current instant. Set it only when testing a future weekday or pricing time window.

### Start a priced session

In **Gaming sessions**, select a station, catalog service, duration, and player count. **Calculate price** previews the quote.

At start, the server recalculates pricing in the same transaction as the session and stores an immutable snapshot. The browser preview is never the business authority.

### Start a session from a booking

In **Gaming bookings**, check the player in first. On a `CHECKED_IN` booking, choose **Start session**.

The dialog asks for the active shared Catalog service. Choose **Calculate price**: the simulation automatically uses the booking station, reserved duration, and player count. Start remains disabled until a valid preview has been produced.

On conversion, the server recalculates pricing in the same transaction that creates the session and moves the booking to `CONVERTED`. The session keeps `bookingId`, service, pricing rule, snapshot, currency, and quoted amount. No payment is created at this stage.

### Change pricing during a session

Pricing can be changed or disabled for future sessions according to permissions. A session already started keeps its original snapshot. On end, the final amount is calculated from that snapshot and billable time, never from the current rule.

### Override

Overrides are limited to users with Gaming Pricing manage permission. Override amount and reason must be supplied together. Amount, reason, and actor are persisted in the snapshot and audit trail.

### What #643 does not do

A Gaming amount is not a payment yet. Invoicing, checkout, cash/bank/Mobile Money, receipts, and daily close belong to #644 and must use shared Finance modules.
