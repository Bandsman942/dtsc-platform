# Hotfix #877 — Relation Workflows / Demandes internes / Activités entreprise

## État canonique confirmé
- `EnterpriseActivityRequest` = contexte et formulaire collaborateur, jamais autorité du traitement.
- `EnterpriseRequest` = demande opérationnelle, transitions, affectation, département, priorités, historique et validation.
- `EnterpriseOperationalEvent(ENTERPRISE_REQUEST_SUBMITTED)` est créé dans la transaction commune ; trigger PostgreSQL existant envoie l'événement durable à `EnterpriseDomainEvent` de manière idempotente.
- `EnterpriseWorkflowRun` existe uniquement après consommation autorisée de l'événement par un workflow ACTIVE et PUBLISHED. La soumission ne démarre jamais directement un workflow.

## Réparations
1. Projection en lecture de `EnterpriseRequest.status` vers « Mes demandes » sans écriture croisée ni réplication de statut. Les demandes antérieures sans liaison canonique conservent leur statut historique.
2. Projection des exécutions qui existent réellement, uniquement selon ACL Workflows / source `EnterpriseRequest`, droits `canViewAllRuns` ou participation, organisation courante et filtres de la route API.
3. Onglet Workflows : définition auto déclenchée `REQUEST_MANAGER_APPROVAL` visible seulement si active, publiée et autorisée. Aucun brouillon n'est annoncé comme opérationnel.
4. Liens profonds dans les deux sens : Activités → Demandes internes (`?request`), Activités → Workflows (`?run`), Workflows → Activités (`?activity`) uniquement pour l'activité que l'utilisateur peut consulter.
5. Département de validation facultatif dans le formulaire ; responsable du département actif et doté de `canApprove` sur le module Demandes internes, refus explicite de l'auto-validation. Le workflow reste indépendant des approbations métier.
6. Un workflow non démarré, non configuré ou bloqué conserve son vrai état ; aucune substitution par un succès ou une transition fictive.

## Risques et conditions opérationnelles
- Le modèle `REQUEST_MANAGER_APPROVAL` utilise `DEPARTMENT_MANAGER`. En l'absence de département/responsable éligible, il peut se bloquer ; ne pas choisir un approbateur arbitraire.
- Le moteur évènementiel de Production reste **fail-closed** derrière `WORKFLOW_WORKER_ENABLED` et `WORKFLOW_EVENT_CUTOVER_AT`. Le présent hotfix ne change **aucune** variable, ne déclenche pas de replay historique et ne réactive pas le worker.
- Pour traiter les événements futurs : vérifier l'état publication/trigger, la politique du worker, les permissions du manager, le cutover temporel et les anciennes exécutions avant d'activer le traitement.
- Ce correctif ne fusionne pas deux sources de vérité et ne permet aucune validation dans Activités entreprise.

## QA
- `pnpm qa:hotfix-877-activity-workflow`
- `pnpm qa:regression`, Prisma generate/migrations, typecheck, lint, build.
- Aucun déploiement, E2E ou worker en Production attesté avant preuves explicites.

## OWNER_E2E
1. Publier explicitement une définition `REQUEST_MANAGER_APPROVAL` autorisée pour l'entreprise de test (aucune publication automatique).
2. Vérifier que le manager du département est actif et distinct du demandeur, doté des permissions nécessaires ; soumettre un formulaire depuis Activités entreprise.
3. Dans Activités, afficher le vrai statut `EnterpriseRequest` et le lien Demandes internes ; vérifier la cohérence de l'objet et le lien `EnterpriseEntityLink`.
4. Lorsque l'outbox est traitée *dans un environnement de test contrôlé*, confirmer une seule exécution, l'attente approbation, le lien profond Workflows, le refus de l'auto-validation, la validation par le manager et la création idempotente de la tâche.
5. Vérifier rejets, annulation, workflow bloqué/non configuré, défaut de manager et erreurs de droits.
6. Tester un collaborateur non autorisé, une autre entreprise et les références hors tenant : aucune donnée ou lien Workflows ne doit fuiter.
7. FR/EN, dark/light, écrans 320/360/375/390/414/768/1024, navigation dans les deux sens, retour et rafraîchissement.
8. Ne pas déclarer l'E2E « bon » sans confirmation du propriétaire.

## Rollback
Aucune migration du schéma ni modification des contrôles d'activation du worker. PR de rollback applicatif indépendante, jamais de replay automatique. Production uniquement via `main` après CI et OWNER_E2E.
