# Guide utilisateur — Workflows
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Workflows** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

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

## Accès et permissions

- Ouvrez le module depuis la navigation du contexte actif.
- Les boutons et actions dépendent du rôle, du poste officiel, des permissions individuelles, du tenant actif et de l’état du module.
- Une action masquée dans l’interface reste également refusée par le serveur lorsqu’elle n’est pas autorisée.
- Sur mobile, utilisez le parcours liste → détail plein écran → formulaire plein écran → retour.

## Statuts, validations et traçabilité

- Les statuts visibles correspondent aux états réellement persistés ; les codes techniques ne sont pas présentés comme libellés métier.
- Les validations, refus, annulations, réouvertures et actions sensibles conservent leur auteur, leur date et, lorsque requis, leur motif.
- Une action répétée avec la même clé métier ne doit pas produire de doublon ni un second impact.

## Sécurité et confidentialité

- Les données sont limitées à l’utilisateur ou à l’organisation autorisée.
- Les références reçues du navigateur sont revérifiées côté serveur dans le même contexte.
- Les documents et informations sensibles utilisent les routes privées et les contrôles d’accès prévus par le module.

## Dépannage

- Actualisez la vue si une opération validée n’apparaît pas immédiatement.
- Vérifiez le contexte d’organisation, les permissions, le statut du module et la connexion réseau.
- En cas de refus persistant, conservez le message affiché et contactez le responsable du module ou le support DTSC sans partager de donnée sensible.
