# Modèle du moteur de workflows standards

## Entités

Le moteur existant distingue :

- `EnterpriseWorkflowDefinition` : identité, déclencheur et version courante ;
- `EnterpriseWorkflowVersion` : configuration immuable après publication ;
- `EnterpriseWorkflowStep` : type et configuration allow-listée ;
- `EnterpriseWorkflowTransition` : source, destination, résultat et condition ;
- `EnterpriseWorkflowRun` : instance liée à une définition, une version et un objet source ;
- `EnterpriseWorkflowStepRun` : état et acteur d'une étape ;
- `EnterpriseWorkflowActionAttempt` : tentative d'effet avec clé d'idempotence ;
- `EnterpriseWorkflowEvent` : historique observable ;
- `EnterpriseDomainEvent` : outbox/retry des événements métier.

## Versionnement

Une définition peut posséder plusieurs versions. La publication renseigne l'état et la date. Une instance conserve `workflowVersionId` pendant toute son exécution ; une nouvelle publication ne modifie pas les instances déjà démarrées.

## Étapes prises en charge

L'interface actuelle expose notamment : démarrage, condition, assignation, création de validation, création de tâche, action métier, notification, attente temporelle et fin. Chaque type possède une structure de configuration validée côté serveur.

## Acteurs

Les stratégies peuvent résoudre un utilisateur spécifique, un rôle, un département, le demandeur, le créateur, l'assigné ou l'acteur précédent. Le moteur vérifie que l'utilisateur résolu est membre actif avant l'exécution.

## Conditions

Les conditions utilisent des champs, opérateurs et valeurs autorisés. Elles sont persistées en JSON validé. Aucun script ou code arbitraire n'est exécuté depuis un modèle.

## Idempotence

- Une instance déclenchée possède une contrainte sur définition, événement et source.
- Chaque effet utilise `EnterpriseWorkflowActionAttempt.idempotencyKey`.
- Les événements de domaine possèdent aussi une clé d'idempotence.
- Un retry réutilise ou enregistre une tentative contrôlée, sans reproduire l'effet métier réussi.

## Attente, suspension et reprise

`resumeAt` et les statuts d'instance permettent les attentes temporelles et reprises. Les erreurs conservent catégorie, code et message. Les routes autorisées peuvent réessayer ou annuler en contrôlant la révision.

## Observabilité

Le module affiche les définitions, versions, instances, étapes courantes, échecs et événements. Les instances à reprendre peuvent être projetées dans le Calendrier, sans duplication du moteur.

## Limites

- Les branches parallèles complexes, quorums et sous-workflows ne sont annoncés que s'ils sont réellement pris en charge par les validateurs et le runtime.
- Le lien profond `?run=` est produit par les notifications et le calendrier ; l'ouverture automatique du détail doit rester couverte par l'interface ou, à défaut, la liste des exécutions autorisées.
- Les adaptateurs métier déterminent les objets et actions réellement disponibles.
