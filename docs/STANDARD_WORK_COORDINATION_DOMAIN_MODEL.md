# Modèle canonique de coordination du travail

## Objet

Ce document définit les responsabilités des objets transverses de planification et d'exécution. Il ne remplace pas les modèles ERP, Health, Pharmacy, COO ou Collaboration déjà canoniques.

## Autorités métier

| Besoin | Autorité canonique | Projection ou lien transverse |
|---|---|---|
| Événement créé directement dans le calendrier | `InternalCalendarEvent` | affichage Calendrier |
| Tâche entreprise | `EnterpriseTask` | échéance dans le Calendrier |
| Sous-tâche | `EnterpriseTask.parentTaskId` | relation parent/enfant |
| Checklist | `EnterpriseTaskChecklistItem` | progression calculée |
| Dépendance | `EnterpriseTaskDependency` | blocage de séquence |
| Blocage | `EnterpriseTaskBlocker` | état et historique de résolution |
| Demande interne | `EnterpriseRequest` | échéance, validation, notification |
| Activité entreprise | `EnterpriseActivityRequest` | lien vers demande canonique lorsqu'elle est soumise par le parcours entreprise |
| Validation | `EnterpriseApproval` | version soumise et décision immuable |
| Version soumise | `EnterpriseApprovalSubmissionVersion` | snapshot de l'objet source |
| Décision | `EnterpriseApprovalDecision` | preuve idempotente liée à une version |
| Réunion | `EnterpriseMeeting` | événement calendrier |
| Ordre du jour | `EnterpriseMeetingAgendaItem` | éléments ordonnés persistés |
| Compte rendu | `EnterpriseMeetingMinutesVersion` | versions brouillon/publiées |
| Action de suivi | `EnterpriseMeetingAction` | lien vers une vraie `EnterpriseTask` |
| Modèle de workflow | moteur `EnterpriseWorkflow*` existant | aucune seconde définition |
| Instance de workflow | `EnterpriseWorkflowRun` | échéance/reprise dans le Calendrier |
| Document | `EnterpriseDocument` et ses versions canoniques | liens multiples via `EnterpriseDocumentLink` |
| Commentaire | primitive de commentaires opérationnels/collaboratifs existante | aucun second moteur |
| Rappel | `EnterpriseWorkReminder` | notification canonique dédupliquée |

## Relations explicites

- Une tâche issue d'un objet métier conserve `sourceModule`, `sourceEntityType` et `sourceEntityId`.
- Une activité entreprise soumise peut créer une `EnterpriseRequest` liée ; les deux objets ne sont pas confondus.
- Une validation référence obligatoirement son type et son identifiant cible.
- Une version de soumission référence une validation ; une décision référence la validation et la version.
- Une action de réunion référence la réunion et la tâche créée ou liée.
- Un document est lié aux objets par `EnterpriseDocumentLink`; le fichier n'est pas dupliqué.
- Une projection calendrier conserve le couple canonique `sourceType/sourceId` et un lien profond contrôlé.

## Familles de statuts

Les modules conservent leurs enums et règles propres. Les familles transverses servent uniquement à la lecture commune :

- préparation : `DRAFT`, `PLANNED`, `TODO` ;
- exécution : `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RUNNING` ;
- attente : `SUBMITTED`, `PENDING`, `PENDING_APPROVAL`, `WAITING` ;
- exception : `BLOCKED`, `CORRECTION_REQUESTED`, `RETRY_SCHEDULED`, `SUSPENDED` ;
- décision : `APPROVED`, `REJECTED` ;
- fin : `DONE`, `COMPLETED`, `RESOLVED`, `CLOSED`, `CANCELLED`, `ARCHIVED`.

Aucun mapping transverse ne peut autoriser une transition interdite par le service métier source.

## Invariants

1. Toute donnée est tenant-scoped.
2. Aucun lien n'est déduit par ressemblance de titre, de nom, d'e-mail ou de date.
3. Les projections sont reconstruisibles.
4. Les mutations restent dans le service canonique.
5. Les versions et décisions historiques ne sont pas écrasées.
6. Les accès sont revérifiés au clic sur un lien profond.
