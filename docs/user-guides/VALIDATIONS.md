# Guide utilisateur — Validations
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Validations** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

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
