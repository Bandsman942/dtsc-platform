# Exploitation et diagnostics Workflows — WF-04 (#817)

## Périmètre et sources de vérité

Les exécutions, les validations et les tentatives idempotentes restent les seules sources métier (`EnterpriseWorkflowRun`, `EnterpriseWorkflowStepRun`, `EnterpriseWorkflowActionAttempt`, `EnterpriseApproval`). Les statuts de l'outbox `EnterpriseDomainEvent` représentent les événements techniques, non des comptabilisations ni une deuxième source tarifaire.

Deux périmètres **ne doivent jamais être confondus** :

1. L'API client `GET /api/enterprise/{organizationId}/workflow-runs` vérifie le membership, l'entitlement et la visibilité de chaque objet/acteur. Ses indicateurs par statut sont des comptes exacts sur le prédicat courant. Ses nouveaux indicateurs de latence sont **échantillonnés et explicitement étiquetés** (30 jours, au plus 500 runs, date d'échantillonnage). Les P50/P95/P99 sont en millisecondes, calculées seulement sur les runs terminés ayant deux horodatages valides. Valeur `null` = donnée absente, **jamais zéro fictif**. L'âge d'attente utilise la dernière mise à jour de WAITING_APPROVAL/WAITING_TIME/BLOCKED comme approximation explicite, pas le temps réel passé dans chaque étape.
2. `getWorkflowQueueSnapshot()` mesure l'**outbox interne partagée**, et n'est pas une métrique par entreprise. L'endpoint travailleur protégé par secret contient `ready`, `processing` (lease valide), `staleProcessing` (lease expirée), `dead`, `oldestReadyAgeMs`, `sampledAt`, `available`. Les résultats ne doivent pas être envoyés directement à un utilisateur client. Les  valeurs indisponibles restent null.

## Procédure de triage d'un workflow bloqué

1. Vérifier le tenant actif et le droit `enterprise.workflows.view_runs`, le module ERP source, le lien vers le run exact, le statut, l'étape courante, le code d'erreur et l'heure de dernière modification. Ne jamais envoyer le payload métier sensible dans un ticket.
2. Si `WAITING_APPROVAL`, vérifier la décision canonique et l'approbateur désigné. Aucun propriétaire ne peut remplacer l'approbateur par lui-même.
3. Si `WAITING_TIME`, vérifier l'heure d'échéance persistée et son fuseau, puis la fréquence du worker. Ne pas réveiller la tâche en changeant arbitrairement un horodatage.
4. Si `BLOCKED`, vérifier d'abord permission révoquée, module désactivé, conflit de révision, étape non supportée ou décision métier. Un blocage de sécurité ou de métier permanent ne doit jamais devenir un retry automatique.
5. Si `FAILED`, un utilisateur `canRetry` peut relancer **l'étape courante** via l'API sécurisée, avec motif et clé d'idempotence conservée ; ne jamais repartir de START.
6. Pour un outbox event `PROCESSING` abandonné, comparer `lockedAt` avec la durée de lease courante (90 secondes selon `WORKFLOW_LIMITS`). Le worker possède sa logique de récupération ; ne jamais rejouer directement un événement potentiellement déjà appliqué.
7. Pour un outbox event `DEAD`, escalader avec l'identifiant d'événement **dans un journal protégé**, la catégorie et le nombre de tentatives. Toute intervention manuelle doit vérifier effets existants, idempotence, droits et schéma ; aucune suppression d'historique.
8. Documenter statut initial/final, SHA Production et décisions E2E ; retrouver le run et son journal sans divulguer secrets, données cliniques, bancaires ou données d'une autre entreprise.

## Surveillance et précision des chiffres

- Les métriques de latence dérivent seulement des horodatages existants : aucun coût financier/IA n'est inventé.
- Les agrégats utilisateurs sont bornés aux mêmes droits que la liste des runs, même avec un filtre de statut ou d'entité.
- `capped=true` indique que les statistiques sont basées sur un sous-ensemble (500 lignes), **pas** une mesure exhaustive du tenant.
- Un échec DB indique `available=false` pour les compteurs internes ; ne pas présenter une indisponibilité comme une file vide.
- Le monitoring de conformité Billing/IA et les limites plan restent à construire dans #822, sans double compteurs.

## QA, conformité et rollback

- Les suites PostgreSQL existantes `qa-workflow-813-postgres` et `qa-workflow-814-postgres` continuent à tourner dans Quality et Migration. Ne jamais réduire leur portée pour rendre cette PR verte.
- `pnpm qa:workflow-observability` vérifie les percentiles, les valeurs nulles, les bornes, le prédicat de visibilité et l'âge des leases ; la régression canonique doit l'exécuter.
- En cas d'incident du monitoring, revert du service d'échantillonnage et des champs additionnels ; le runtime métier, les validations et les événements conservent leurs sources canoniques. Aucune migration nécessaire.
- **OWNER_E2E #817** à réaliser avant la fusion : runs réussi, en attente, bloqué et échoué, retry, annulation, crise de lease expiré, métriques filtrées par acteur/tenant et absence de fuite.

## Dépendance

WF-04 dépend de WF-03 (#816). Tant que #816 n'est pas fusionné, cette PR doit rester **DRAFT** et toute intégration finale de l'UI de monitoring doit être réconciliée avec le dernier `main` incluant #816.
