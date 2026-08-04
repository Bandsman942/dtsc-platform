# Matrice des permissions — coordination du travail

## Principes

Toute mutation vérifie la session, le contexte actif, le membership, l'accès au module, la relation avec l'objet, son état et sa révision. Les capacités renvoyées au frontend améliorent l'UX mais ne remplacent jamais ces contrôles.

| Domaine | Lecture minimale | Création | Modification / action | Gestion étendue |
|---|---|---|---|---|
| Calendrier | participant, propriétaire ou visibilité de contexte | membre autorisé par l'entitlement | propriétaire ou gestionnaire du planning | gestionnaire autorisé, avec droit séparé de dérogation aux conflits |
| Tâche | créateur, assigné ou gestionnaire | membre non invité autorisé | créateur, assigné ou gestionnaire selon l'action | rôle entreprise de gestion |
| Checklist / dépendance / blocage | visibilité de la tâche | acteur pouvant muter la tâche | même règle que la tâche ; membre responsable vérifié | gestionnaire |
| Demande | demandeur, assigné ou gestionnaire | membre autorisé | demandeur pour correction/réponse ; assigné/gestionnaire pour traitement | gestionnaire |
| Validation | demandeur, validateur ou gestionnaire | service métier source | validateur désigné pour décision ; demandeur pour resoumission ; gestionnaire pour délégation autorisée | gestionnaire, sans contourner les interdictions métier d'auto-approbation |
| Réunion | organisateur, participant ou gestionnaire | membre autorisé | organisateur/gestionnaire ; participants pour réponses prises en charge | gestionnaire |
| Ordre du jour / compte rendu | visibilité de la réunion | organisateur/gestionnaire | auteur ou gestionnaire selon l'état | gestionnaire |
| Action de réunion | visibilité de la réunion | organisateur/gestionnaire | tâche créée selon les droits du module Tâches | gestionnaire |
| Workflow | acteur, initiateur ou gestionnaire selon le modèle | capacité `start` | acteur résolu pour l'étape courante | gestionnaire de workflow |
| Document | accès explicite, propriétaire, créateur, département ou gestionnaire | capacité Documents | propriétaire/créateur/gestionnaire selon action | gestionnaire Documents |
| Filtre enregistré | propriétaire du filtre | membre autorisé | propriétaire uniquement | aucun élargissement de visibilité |
| Rappel | destinataire ou service système autorisé | service métier | service métier ou destinataire selon le type | opérateur système autorisé |

## Capacités API attendues

### Tâches

`canView`, `canCreate`, `canUpdate`, `canAssign`, `canComment`, `canUpload`, `canSubmit`, `canComplete`, `canArchive`, `canRestore`, `canDelete`.

### Demandes

`canCreate`, `canSubmit`, `canAssign`, `canTriage`, `canRespond`, `canRequestInformation`, `canResolve`, `canClose`, `canReopen`, `canReject`, `canCancel`.

### Validations

`canView`, `canComment`, `canApprove`, `canReject`, `canRequestCorrection`, `canDelegate`, `canRetry`.

### Réunions

`canCreate`, `canInvite`, `canUpdate`, `canCancel`, `canJoinCall`, `canPublishMinutes`, `canCreateFollowUpActions`.

### Workflows

`canCreateTemplate`, `canPublishVersion`, `canStart`, `canAct`, `canSuspend`, `canResume`, `canCancel`, `canRetry`, `canArchive`.

### Documents

`canView`, `canDownload`, `canUpload`, `canCreateVersion`, `canEditMetadata`, `canLink`, `canUnlink`, `canComment`, `canArchive`, `canRestore`, `canDelete`.

Les APIs existantes peuvent retourner un sous-ensemble lorsque certaines capacités ne sont pas encore exposées. L'absence d'une capacité vaut refus, pas autorisation implicite.

## Règles sensibles

- Un identifiant d'organisation fourni par le client n'est jamais suffisant : le membership est résolu côté serveur.
- Un assigné, participant ou validateur doit être membre actif de la même organisation.
- Une référence source est validée par type, identifiant et organisation.
- Une décision déjà finalisée ou une révision obsolète retourne un conflit.
- Un lien profond ou une URL signée ne transporte aucune permission permanente.
