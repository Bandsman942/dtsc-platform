# Modèle d'agrégation du Calendrier standard

## Principe

Le Calendrier est une vue autorisée et bornée des dates de travail. Il ne copie pas les moteurs des tâches, demandes, validations, réunions, workflows ou documents.

## Contrat unifié

Chaque élément retourné expose :

- `sourceType` et `sourceId` ;
- titre et description limitée ;
- début, fin, indicateur journée entière et fuseau horaire ;
- statut et priorité ;
- contexte et organisation ;
- responsable et participants autorisés ;
- lien profond ;
- capacités d'édition et de suppression.

## Sources actuellement agrégées

- événements `InternalCalendarEvent` visibles dans le contexte actif ;
- tâches actives possédant un début ou une échéance ;
- demandes internes actives possédant une échéance ;
- validations en attente ;
- réunions autorisées ;
- instances de workflow en démarrage, reprise ou attente ;
- documents possédant une date d'expiration.

Les disponibilités et exceptions restent affichées par le module calendrier existant. Les absences RH restent canoniques dans le domaine temps/congés et ne sont pas copiées.

## Période et performance

L'API `/api/calendar/unified` charge par défaut les quatorze jours précédents et les soixante jours suivants. Une requête ne peut pas dépasser quatre-vingt-treize jours. Chaque source est bornée et tenant-scoped.

## Déduplication

Lorsqu'un `InternalCalendarEvent` référence un objet reconnu dans `sourceEntityType/sourceEntityId`, la projection adopte le couple canonique de cet objet. La projection directement chargée depuis le module source remplace alors la copie calendrier. La clé de déduplication est :

```text
sourceType + sourceId
```

Les événements historiques dont la source n'est pas reconnue restent accessibles comme événements calendrier, sans relation inventée.

## Édition

- Un événement créé directement dans le calendrier peut être modifié ou annulé par son parcours canonique si les capacités serveur l'autorisent.
- Une tâche, demande, validation, réunion, instance de workflow ou échéance documentaire est en lecture seule dans l'agrégateur et s'ouvre dans son module source.

## Fuseaux horaires

Les dates persistées restent en UTC. Le fuseau de l'utilisateur est résolu côté serveur et transmis au formatteur. Les filtres de période utilisent des dates absolues et non des conversions divergentes par composant.

## Sécurité

L'API vérifie session, contexte actif, accès au calendrier, entitlement et visibilité de chaque source. Le lien profond revérifie les droits dans le module cible ; il ne transporte aucune autorisation.

## Limites connues de l'itération 4

- L'agenda unifié est une liste professionnelle filtrable ; les grilles jour/semaine/mois restent assurées par le calendrier existant.
- Les ressources partagées et la proposition automatique de créneaux ne sont pas annoncées comme disponibles.
- Les échéances ERP apparaissent uniquement lorsqu'elles sont déjà exposées par une source canonique intégrée ; aucune synchronisation implicite n'est ajoutée.
