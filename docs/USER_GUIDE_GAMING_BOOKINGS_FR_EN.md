# Guide utilisateur — Réservations Gaming / Gaming Bookings

## Français

### À quoi sert le module ?

**Réservations Gaming** permet de réserver un poste de jeu sur un créneau, d’enregistrer l’arrivée du joueur et de démarrer ensuite la session correspondante.

Le module réutilise les données déjà présentes dans DTSC Platform :

- les postes viennent de **Postes de jeu** et des actifs de l’entreprise ;
- un client identifié vient du **CRM** ;
- le site vient automatiquement de l’actif lié au poste ;
- la session démarrée apparaît dans **Sessions de jeu**.

Aucune fiche client, caisse ou donnée de site parallèle n’est créée.

### Créer une réservation

1. Ouvrez **Réservations Gaming**.
2. Cliquez sur **Nouvelle réservation**.
3. Choisissez le poste de jeu.
4. Indiquez le début et la fin du créneau. Le créneau doit être positif et ne peut pas dépasser 24 heures.
5. Indiquez le nombre de joueurs. Il ne peut pas dépasser la capacité du poste.
6. Si le joueur est déjà client, recherchez-le dans le CRM et sélectionnez-le.
7. Si le joueur est occasionnel, laissez le client vide : aucune fiche CRM artificielle ne sera créée.
8. Ajoutez éventuellement une note.
9. Enregistrez comme **Brouillon** ou **Confirmer maintenant**.

Une réservation confirmée bloque son créneau pour ce poste. Si une autre réservation confirmée ou déjà enregistrée à l’arrivée chevauche le même créneau, le serveur refuse l’opération et explique le conflit.

### Vues Liste et Calendrier

La vue **Liste** facilite la recherche et la gestion opérationnelle. La vue **Calendrier** affiche un agenda groupé par jour à partir des résultats paginés.

Le calendrier n’est pas la source de vérité des conflits : la validation finale est toujours effectuée par le serveur et la base de données.

### Modifier une réservation

Une réservation `Brouillon` ou `Confirmée` peut être modifiée. Le poste, le client, le créneau, le nombre de joueurs et les notes peuvent être corrigés selon les permissions de l’utilisateur.

Si la réservation est confirmée, le nouveau créneau est revalidé contre les autres réservations. Si un autre utilisateur a déjà modifié la réservation, actualisez l’écran avant de recommencer.

### Enregistrer l’arrivée et démarrer la session

Pour une réservation confirmée :

1. ouvrez son détail ;
2. choisissez **Enregistrer l’arrivée** ;
3. lorsque le joueur doit commencer, choisissez **Démarrer la session**.

La conversion crée une seule session liée à la réservation. Le serveur vérifie le poste, l’actif, les incidents majeurs, la maintenance et l’absence de session déjà en cours. Le poste passe ensuite à l’état occupé selon le moteur Sessions.

Le créneau réservé fournit la durée initiale de la session. Aucun montant, paiement ou facture n’est créé à cette étape.

### Absence et annulation

- **Marquer absent** conserve l’historique et libère le créneau pour de nouvelles réservations.
- **Annuler la réservation** conserve également l’historique et ne supprime aucune donnée.

Une réservation convertie, annulée ou marquée absente n’est plus réécrite par #642.

### Joueur occasionnel et client CRM

Le client CRM est facultatif. Laissez le champ vide pour un **joueur occasionnel**. Si vous choisissez un client, DTSC Platform vérifie qu’il appartient bien à la même entreprise, qu’il est actif et qu’il possède un rôle client actif.

### Site du poste

Le site affiché n’est pas saisi dans la réservation. Il provient de l’actif rattaché au poste de jeu. Pour corriger le site, modifiez l’actif dans le domaine prévu à cet effet plutôt que la réservation.

### Conflits et erreurs utiles

Le module peut notamment refuser une opération lorsque :

- le poste est déjà réservé sur le créneau ;
- le nombre de joueurs dépasse sa capacité ;
- le créneau est invalide ou supérieur à 24 heures ;
- le client sélectionné n’est plus actif ;
- le poste est occupé, en maintenance ou affecté par un incident majeur au moment de la conversion ;
- la réservation a été modifiée par un autre utilisateur.

Corrigez la cause indiquée, puis recommencez sans avoir à recréer la réservation.

---

## English

### What is this module for?

**Gaming Bookings** lets you reserve a gaming station for a time slot, check the player in, and then start the corresponding gaming session.

The module reuses existing DTSC Platform data:

- stations come from **Gaming Stations** and company assets;
- an identified customer comes from **CRM**;
- the site is automatically derived from the station asset;
- the started session appears in **Gaming Sessions**.

No parallel customer, cash, or site record is created.

### Create a booking

1. Open **Gaming Bookings**.
2. Select **New booking**.
3. Choose the gaming station.
4. Enter the start and end time. The slot must be positive and cannot exceed 24 hours.
5. Enter the player count. It cannot exceed station capacity.
6. If the player is already a customer, search CRM and select the customer.
7. For a walk-in player, leave the customer empty. No artificial CRM record is created.
8. Add an optional note.
9. Save as **Draft** or **Confirm now**.

A confirmed booking blocks its station time slot. If another confirmed or checked-in booking overlaps that slot, the server rejects the operation and explains the conflict.

### List and Calendar views

**List** is optimized for search and daily operations. **Calendar** is a day-grouped agenda based on the paginated results.

The calendar is not the conflict authority. Final conflict validation always happens on the server and in the database.

### Edit a booking

A `Draft` or `Confirmed` booking can be edited. Depending on permissions, you can change the station, customer, time slot, player count, and notes.

For confirmed bookings, the new time slot is checked again against other bookings. If another user changed the booking first, refresh before retrying.

### Check in and start the session

For a confirmed booking:

1. open its details;
2. choose **Check in**;
3. when play should begin, choose **Start session**.

Conversion creates exactly one session linked to the booking. The server verifies the station and asset, major incidents, maintenance, and the absence of another live session. The station then becomes occupied through the Sessions engine.

The booked slot provides the initial session duration. No amount, payment, or invoice is created at this stage.

### No-show and cancellation

- **Mark no-show** preserves history and frees the slot for new bookings.
- **Cancel booking** also preserves history and deletes nothing.

A converted, cancelled, or no-show booking is not rewritten by #642.

### Walk-in player and CRM customer

The CRM customer is optional. Leave it empty for a **walk-in player**. When a customer is selected, DTSC Platform verifies that the record belongs to the same organization, is active, and has an active customer role.

### Station site

The displayed site is not entered on the booking. It comes from the asset linked to the gaming station. Correct the asset if the site needs to change.

### Conflicts and useful errors

The module can reject an operation when, for example:

- the station is already booked for the slot;
- player count exceeds station capacity;
- the slot is invalid or longer than 24 hours;
- the selected customer is no longer active;
- the station is occupied, under maintenance, or has a major incident when conversion is attempted;
- another user already changed the booking.

Correct the stated cause and retry without recreating the booking.
