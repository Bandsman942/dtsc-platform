# Guide utilisateur — Workflows

## Rôle du module

Le module **Workflows** exécute des processus transverses versionnés. Il distingue le modèle, la version publiée, l’instance, les étapes, les acteurs, les transitions et les événements d’exécution.

Le bouton **Guide utilisateur** ouvre ce guide directement dans l’application.

## Modèles et versions

Un modèle décrit le déclencheur, les étapes, les acteurs, les conditions, les délais, les notifications et le résultat attendu.

Une version publiée n’est jamais modifiée rétroactivement. Toute évolution crée une nouvelle version, tandis que les instances existantes restent liées à leur version d’origine.

## Démarrer une instance

Une instance conserve :

- le modèle et la version ;
- l’objet source ;
- l’initiateur ;
- l’étape actuelle ;
- les acteurs résolus ;
- les délais ;
- l’historique ;
- les événements d’outbox.

## Acteurs et transitions

Les acteurs sont résolus côté serveur à partir des règles prises en charge : utilisateur, rôle, poste, département, responsable d’objet ou gestionnaire explicitement autorisé.

Une transition est disponible uniquement pour l’acteur résolu de l’étape courante. Les droits ne sont pas déduits d’un libellé saisi dans l’interface.

## Conditions

Les conditions utilisent uniquement des champs et opérateurs allow-listés. Aucun code JavaScript fourni par l’utilisateur n’est exécuté.

## Idempotence

Chaque transition possède une clé stable. Un double clic, un retry réseau ou un worker relancé ne produit pas deux décisions ni deux effets métier.

## Délais, SLA et reprise

Les délais d’étape, dates de reprise et escalades sont conservés dans l’instance.

Une politique SLA peut compléter le workflow sans remplacer son statut métier. Le SLA calcule les états RUNNING, WARNING et BREACHED.

## Observabilité

Le détail expose la version, l’étape, les acteurs, les délais, les transitions, les erreurs et les retries autorisés. Les secrets et données sensibles ne sont jamais affichés dans les logs utilisateur.

## Liens profonds

Une notification peut ouvrir directement l’instance avec `?run=...`. L’accès est revérifié au moment de l’ouverture.
