# Guide utilisateur — Réunions
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide explique l’utilisation opérationnelle de **Réunions** dans DTSC Platform. Il décrit uniquement les actions disponibles dans l’application, leurs règles métier et les contrôles appliqués.

## Rôle du module

Le module **Réunions** couvre la préparation, la tenue, le compte rendu, les décisions et les tâches de suivi.

Le bouton **Guide utilisateur** ouvre ce guide directement dans l’application.

## Créer une réunion

Renseignez le titre, l’objet, les dates, le mode, le lieu ou lien d’appel, l’organisateur, les participants, le département et la source éventuelle.

Lorsque la réunion est créée depuis le Calendrier interne, le créateur reste responsable et les autres collaborateurs sont invités. Une réunion n’apparaît dans le calendrier personnel d’un participant qu’après son acceptation.

## Conflits et créneaux

Les conflits du responsable et de chaque participant sont contrôlés avant la planification et de nouveau avant l’acceptation.

Le moteur local de proposition de créneaux peut rechercher des périodes compatibles sur quatorze jours maximum.

## Ordre du jour

Ajoutez des sujets avec :

- un titre ;
- une description ;
- un responsable facultatif ;
- une durée estimée ;
- une position ;
- un statut de traitement.

## Checklist et progression

Les résultats de préparation ou de suivi peuvent être ajoutés à la checklist. La progression est calculée à partir des éléments réalisés.

## Compte rendu

Chaque enregistrement crée une version. Une version publiée conserve son numéro, son auteur et sa date. Une nouvelle version ne remplace jamais silencieusement l’historique.

## Décisions et tâches de suivi

Une décision peut être transformée explicitement en vraie tâche :

1. la tâche est créée dans le module Tâches ;
2. le responsable et l’échéance sont enregistrés ;
3. le lien réunion → tâche est conservé ;
4. la tâche apparaît dans le calendrier lorsqu’elle est datée.

## Commentaires et mentions

Les participants autorisés peuvent commenter et mentionner des collaborateurs. Les mentions cliquables proposent des actions professionnelles soumises aux permissions actuelles.

## Appels audio et vidéo

Les réunions réutilisent l’infrastructure Collaboration déjà déployée. Aucun second moteur d’appel n’est créé.

## Ressources

Le créateur responsable peut réserver une salle, un véhicule, un équipement ou un espace de travail pour sa réunion. Le moteur interdit les chevauchements de réservation.

## Synchronisation externe

Google Calendar et Microsoft 365 restent désactivés proprement tant que leurs variables OAuth ne sont pas configurées. Aucun faux succès ni aucune exception Production ne sont produits.

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
