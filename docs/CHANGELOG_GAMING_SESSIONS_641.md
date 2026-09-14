# Changelog — Gaming Sessions #641

## Ajout

- Activation `BETA` de `GAMING_SESSIONS` avec route dédiée `/enterprise-modules/GAMING_SESSIONS`.
- Permissions `enterprise.gaming.sessions.read/create/update/manage`.
- Démarrage, pause, reprise, prolongation, transfert et fin de session.
- Autorité temporelle serveur avec `startedAt`, `expectedEndAt`, `pausedAt`, `endedAt`, `pausedSeconds` et `billableSeconds`.
- Snapshot `timingPolicyJson` pour figer notamment la règle de facturation des pauses.
- Journal `EnterpriseGamingSessionTransition` avec clé d’idempotence unique par organisation.
- Transactions `Serializable`, contrôle de révision et index PostgreSQL contre la double occupation d’un poste.
- Projection de l’occupation vers `GAMING_STATIONS` : poste `IN_USE` pendant une session live, libération à la fin ou au transfert.
- Garde DB et contrôle API empêchant de remettre disponible/bloquer un poste pendant une session live.
- Validation same-tenant des clients CRM, services du catalogue, postes et actifs associés.
- Workspace FR/EN responsive avec KPI, recherche, filtres, pagination, historique de transitions et projection visuelle du temps serveur.
- Resynchronisation bornée toutes les 30 secondes ; aucun chrono client n’est une source de vérité métier.
- QA #641 branchée à `qa:regression`.

## Invariants

- Aucune limite de cinq postes n’est introduite.
- Aucune caisse, facture, tarification ou source client/catalogue parallèle n’est créée.
- Une session terminale n’est pas réécrite par le moteur #641.
- Un retry avec la même clé d’idempotence ne duplique pas une session ni une transition.
- Deux sessions `ACTIVE/PAUSED` ne peuvent pas occuper simultanément le même poste.

## Rollback

Repasser `GAMING_SESSIONS` en fail-closed et bloquer les nouveaux démarrages. Conserver l’historique des sessions et transitions. Ne supprimer aucune migration ni donnée historique.
