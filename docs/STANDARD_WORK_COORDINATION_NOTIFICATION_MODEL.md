# Modèle de notifications et rappels — coordination du travail

## Principe

Les domaines de coordination utilisent le moteur canonique `notifyUser` et les préférences de notifications déjà consolidées. Ils ne créent pas de deuxième centre de notifications.

## Événements couverts

Les services peuvent notifier :

- affectation d'une tâche ou d'une demande ;
- blocage et résolution ;
- demande d'information ;
- soumission et validation attendue ;
- correction demandée et nouvelle soumission ;
- approbation ou refus ;
- délégation de validation ;
- invitation ou modification de réunion ;
- publication d'un compte rendu ;
- création d'une action de suivi ;
- changement d'étape ou erreur de workflow ;
- document lié ou nouvelle version ;
- mention ou commentaire autorisé.

## Contenu minimal

Une notification contient :

- un type stable ;
- un titre professionnel ;
- un résumé sans secret ;
- l'utilisateur destinataire ;
- l'organisation lorsque nécessaire ;
- un lien profond interne vers l'objet exact.

Le corps ne doit pas contenir le contenu intégral d'un document, une donnée médicale, un secret, un jeton ou une condition de workflow sensible.

## Destinataires

Les destinataires sont résolus côté serveur : assigné, demandeur, validateur, organisateur, participants ou acteurs de workflow. Un identifiant utilisateur fourni par le client est revérifié comme membre actif et acteur autorisé.

## Rappels

`EnterpriseWorkReminder` porte :

- l'organisation et l'utilisateur ;
- le type et l'identifiant de l'objet ;
- le type de rappel ;
- la date `remindAt` ;
- l'état ;
- une clé d'idempotence ;
- les dates d'envoi ou d'annulation.

Une clé d'idempotence empêche l'envoi répété du même rappel. Le service métier annule ou ignore un rappel lorsque l'objet est terminé, annulé, archivé ou devenu inaccessible.

## Web Push

Web Push respecte le consentement, les préférences et la validité de l'abonnement. L'absence de Push ne bloque pas la notification interne. Le clic ouvre le même lien profond contrôlé.

## Accès révoqué

Une notification déjà reçue ne garantit pas l'accès. Le module cible revérifie le membership et affiche un état sûr si l'accès a été retiré.

## Observabilité

Les logs peuvent inclure le type, le destinataire, l'organisation, l'objet, la clé de déduplication et le résultat. Ils ne contiennent pas le payload sensible complet ni les URLs signées documentaires.

## Limites

- Les rappels planifiés nécessitent un worker ou une tâche planifiée opérationnelle ; le modèle de données seul n'est pas présenté comme un service d'envoi complet.
- Les escalades automatiques sont disponibles uniquement lorsqu'un workflow ou un SLA réel les configure.
