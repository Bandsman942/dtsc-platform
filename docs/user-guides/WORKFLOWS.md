# Guide utilisateur — Workflows

## Rôle du module

Le module **Workflows** exécute des processus transverses versionnés. Il distingue le modèle, sa version publiée, l'instance en cours, les étapes, les acteurs et les événements d'exécution.

## Modèles et versions

Un modèle décrit le déclencheur, les étapes, transitions, acteurs, conditions, délais, notifications et résultat attendu. Une version publiée n'est pas modifiée rétroactivement : toute évolution fonctionnelle crée une nouvelle version.

Une instance reste liée à la version avec laquelle elle a démarré, même si une nouvelle version du modèle est publiée ensuite.

## Créer ou modifier un modèle

Les gestionnaires autorisés peuvent créer un modèle en brouillon, configurer ses étapes et publier une version. Les formulaires doivent utiliser les types d'étapes et règles proposés par le moteur ; aucun code JavaScript ou expression arbitraire n'est accepté.

## Démarrer une instance

Une instance peut être démarrée depuis le module Workflows ou par un service métier intégré. Elle conserve :

- le modèle et sa version ;
- l'objet source ;
- l'utilisateur initiateur ;
- l'étape actuelle ;
- les acteurs résolus ;
- l'historique et les événements d'outbox.

## Acteurs

Les acteurs sont résolus côté serveur à partir des règles prises en charge : utilisateur, rôle, poste, département, responsable de l'objet ou gestionnaire autorisé. La résolution enregistrée ne dépend pas d'un libellé saisi dans l'interface.

## Agir sur une étape

Selon votre affectation et l'état, vous pouvez approuver, refuser, demander une correction ou exécuter l'action prévue. Le serveur vérifie l'étape courante, l'acteur, la version et la transition autorisée.

## Conditions

Les conditions utilisent uniquement les champs et opérateurs autorisés. Elles sont évaluées côté serveur et auditées. Un modèle ne peut pas exécuter du code fourni par l'utilisateur.

## Délais, suspension et reprise

Une instance peut porter une date limite, une date de reprise, une escalade ou un retry selon le type d'étape. Les actions disponibles incluent, lorsque le modèle le permet :

- suspendre ;
- reprendre ;
- attendre une information ou un événement ;
- annuler ;
- réessayer après erreur.

Les instances avec `resumeAt` peuvent apparaître dans l'agenda unifié.

## Idempotence et retries

Chaque transition et effet externe utilise les mécanismes d'idempotence du moteur. Un double clic, un événement d'outbox rejoué ou un worker relancé ne doit pas créer une deuxième décision ou un deuxième effet métier.

## Observabilité

Le détail expose l'état, la version, l'étape actuelle, les acteurs, les délais et l'historique disponibles. Les erreurs et retries sont conservés sans afficher de secrets ou de données sensibles dans les logs utilisateur.

## Limites

- Les types d'étapes disponibles dépendent du moteur déjà déployé ; le module ne simule pas des règles complexes uniquement dans le frontend.
- Les éditeurs graphiques avancés, quorums et branches parallèles ne sont annoncés que si le backend les prend réellement en charge.
- La correction d'un objet source dépend de l'adaptateur métier correspondant.
