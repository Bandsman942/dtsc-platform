# Guide utilisateur — Calendrier

## Rôle du module

Le Calendrier réunit les dates auxquelles vous avez réellement accès dans le contexte actif. Il affiche les événements calendrier ainsi que les projections autorisées de tâches, demandes, validations, réunions, workflows et échéances documentaires.

## Accéder au calendrier

Ouvrez **Calendrier** depuis la navigation de l'application. Le contexte actif détermine les collaborateurs, disponibilités et objets de travail visibles.

## Vues et filtres

Le calendrier existant propose les vues disponibles dans votre espace, notamment aujourd'hui, semaine, mois, collaborateur, département et conflits. L'**Agenda de travail unifié** ajoute :

- une recherche par titre ou description ;
- un filtre par source ;
- un compteur des éléments visibles ;
- un accès direct à l'objet canonique.

Sur mobile, la barre des vues et des sources défile horizontalement.

## Créer un événement

Utilisez **Nouvel événement** uniquement pour les types proposés par le formulaire. Sélectionnez le responsable, les participants, les dates, la priorité, le lieu et la visibilité. Les participants doivent appartenir au contexte autorisé.

Avant l'enregistrement, le serveur vérifie les chevauchements et indisponibilités. Un conflit doit être corrigé, sauf si votre rôle possède explicitement le droit de dérogation.

## Événements liés

Une tâche, réunion ou demande affichée dans l'agenda reste gérée par son module source. Cliquez sur **Ouvrir** pour accéder à cet objet. Le Calendrier ne crée pas une copie modifiable de cet objet.

Lorsque le calendrier possède déjà une projection liée au même objet, une seule entrée canonique est affichée.

## Disponibilités et exceptions

Selon votre contexte, vous pouvez enregistrer vos plages habituelles et des exceptions ponctuelles. Les responsables autorisés peuvent consulter ou gérer les disponibilités de leur équipe. Les congés gérés par le domaine RH ne sont pas recréés dans le calendrier.

## Fuseau horaire

Les dates sont enregistrées en UTC et affichées dans le fuseau configuré dans votre profil. Vérifiez ce réglage avant de planifier avec des participants distants.

## Liens profonds et accès révoqué

Les notifications peuvent ouvrir `/calendar?event=...` ou l'objet source. Les permissions sont revérifiées à l'ouverture. Un lien ancien n'accorde jamais un accès qui a été révoqué.

## Limites

- L'agenda unifié est une liste filtrable ; il ne remplace pas les grilles calendrier existantes.
- La proposition automatique du meilleur créneau et la réservation de ressources ne sont pas annoncées comme disponibles.
- Les dates ERP apparaissent seulement lorsqu'une source canonique intégrée les expose.
