# Guide utilisateur — Validations

## Rôle du module

Le module **Validations** centralise les décisions sans dupliquer l’objet métier soumis. Chaque validation conserve un lien vers sa tâche, demande, budget, dépense, document, réunion ou autre source canonique.

Le bouton **Guide utilisateur** de l’en-tête ouvre ce guide dans l’application.

## Consulter la file

La file affiche :

- les validations demandées par vous ;
- celles qui vous sont attribuées ;
- celles du contexte entreprise lorsque votre permission l’autorise ;
- le statut ;
- la source ;
- la révision ;
- la date de soumission.

## Versions de soumission

Chaque soumission crée une version avec un snapshot de l’objet. Une correction puis une resoumission créent une nouvelle version ; la version précédente et sa décision restent conservées.

## Décider

Seul le validateur désigné ou le délégué explicitement autorisé peut :

- approuver ;
- refuser ;
- demander une correction.

Le serveur vérifie la révision, l’état, l’acteur, la source et la clé d’idempotence avant d’enregistrer la décision.

## Demander une correction

Le motif est obligatoire et doit indiquer ce qui doit changer. Le demandeur corrige l’objet source puis soumet une nouvelle version.

## Déléguer

Une délégation est possible uniquement vers un membre actif de la même organisation disposant des capacités nécessaires. Elle est historisée et notifiée.

## Auto-approbation

L’auto-approbation est refusée lorsque le parcours métier l’interdit. Un rôle élevé n’est pas un contournement automatique.

## Idempotence

Un double clic ou un retry réseau ne crée pas deux décisions. La clé de décision dépend de la validation, de la version, de l’acteur et de l’action.

## Documents, commentaires et liens

Les documents et commentaires restent gérés par leurs modules canoniques. Le lien profond ouvre la validation exacte puis revérifie les permissions actuelles.

## Historique

Le détail affiche les versions, décisions, motifs, délégations, corrections, dates et acteurs. Une décision finalisée n’est pas modifiée silencieusement ; une nouvelle procédure métier est requise pour la remplacer.
