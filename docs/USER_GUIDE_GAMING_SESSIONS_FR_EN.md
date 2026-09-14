# Guide utilisateur — Sessions de jeu / Gaming Sessions

## Français

### Objectif

Le module **Sessions de jeu** permet de démarrer et suivre l’occupation réelle des postes Gaming Lounge. Le temps métier est calculé par le serveur : le chronomètre visible à l’écran est uniquement une projection d’affichage.

### Démarrer une session

1. Ouvrez **Sessions de jeu**.
2. Sélectionnez **Démarrer une session**.
3. Choisissez un poste disponible.
4. Saisissez la durée initiale en minutes.
5. Activez **Facturer le temps de pause** uniquement si cette règle doit s’appliquer à cette session.
6. Validez.

Le serveur fixe l’heure de début et la fin prévue. Si deux utilisateurs tentent de démarrer simultanément une session sur le même poste, une seule demande peut réussir.

### Mettre en pause et reprendre

- **Mettre en pause** arrête la progression du temps facturable lorsque la règle de la session exclut les pauses.
- **Reprendre** cumule la durée de pause côté serveur et ajuste la fin prévue si nécessaire.
- Fermer le navigateur ou changer d’appareil ne change pas la durée enregistrée.

### Prolonger

Ouvrez une session active ou en pause, choisissez **Prolonger**, puis indiquez le nombre de minutes supplémentaires. La nouvelle fin prévue est calculée côté serveur.

### Transférer vers un autre poste

1. Ouvrez la session.
2. Choisissez **Transférer**.
3. Sélectionnez un autre poste disponible.
4. Validez.

Le transfert conserve la même session et son historique. L’ancien poste redevient disponible et le nouveau passe en occupation. Un poste déjà occupé, en maintenance, avec incident majeur ou hors service est refusé.

### Terminer

Choisissez **Terminer**. Le serveur fixe `endedAt`, le temps total de pause et le temps facturable. Une session terminée ne peut plus être modifiée par les actions #641.

### États

- **En cours** : session active.
- **En pause** : session temporairement suspendue.
- **Terminée** : temps figé, en attente des futurs traitements d’encaissement.
- **À encaisser / Payée / Annulée** : états prévus pour les lots suivants ou les intégrations financières.

### Comprendre le chronomètre

Le module reçoit une heure serveur et les durées persistées. Entre deux synchronisations, l’interface anime les secondes localement pour le confort visuel, puis se resynchronise automatiquement. Cette animation locale ne peut ni créer une durée métier ni modifier une session.

### Messages fréquents

- **Poste déjà occupé** : actualisez et choisissez un autre poste.
- **Incident majeur** : résolvez l’incident dans **Actifs & maintenance**.
- **Maintenance en cours** : terminez ou annulez la maintenance avant une nouvelle session.
- **Conflit de révision** : un autre utilisateur a modifié la session ; actualisez avant de recommencer.
- **Session déjà terminée** : les transitions de temps sont verrouillées.

### Parc supérieur à cinq postes

Le module n’est pas limité aux cinq PlayStations initiales. Les postes disponibles sont chargés par pages et une sixième console ou les suivantes suivent exactement le même parcours.

---

## English

### Purpose

**Gaming sessions** starts and tracks real Gaming Lounge station occupancy. Business time is calculated by the server; the visible timer is only a display projection.

### Start a session

1. Open **Gaming sessions**.
2. Select **Start session**.
3. Choose an available station.
4. Enter the initial duration in minutes.
5. Enable **Bill paused time** only when that rule must apply to this session.
6. Confirm.

The server sets the start and expected end timestamps. If two users try to start a session on the same station at the same time, only one request can succeed.

### Pause and resume

- **Pause** stops billable-time progression when the session snapshot excludes paused time.
- **Resume** accumulates paused duration on the server and adjusts the expected end when required.
- Closing the browser or switching devices does not change persisted duration.

### Extend

Open an active or paused session, select **Extend**, then enter the additional minutes. The new expected end is calculated by the server.

### Transfer to another station

1. Open the session.
2. Select **Transfer**.
3. Choose another available station.
4. Confirm.

The same session and history are preserved. The previous station is released and the target becomes occupied. Busy, maintenance, major-incident or out-of-service stations are rejected.

### End

Select **End**. The server freezes the end timestamp, total paused time and billable time. An ended session can no longer be changed by #641 timing actions.

### States

- **Active**: currently running.
- **Paused**: temporarily suspended.
- **Ended**: timing frozen, ready for later checkout flows.
- **To checkout / Paid / Cancelled**: states reserved for later lots or finance integration.

### Understanding the timer

The module receives server time and persisted timing data. Between synchronizations, the interface animates seconds locally for display convenience and periodically resynchronizes. This local animation can never create business time or mutate a session.

### Common messages

- **Station already occupied**: refresh and select another station.
- **Major incident**: resolve it in **Assets & maintenance**.
- **Maintenance in progress**: complete or cancel it before starting another session.
- **Revision conflict**: another user changed the session; refresh first.
- **Session already ended**: timing transitions are locked.

### More than five stations

The module is not limited to the initial five PlayStations. Available stations are paginated and a sixth console or any later station follows exactly the same workflow.
