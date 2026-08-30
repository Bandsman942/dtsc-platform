# Guide utilisateur — Tâches et opérations
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Ce guide décrit l’utilisation opérationnelle de **Tâches et opérations** dans DTSC Platform et les contrôles réellement appliqués côté serveur.

## Créer et organiser le travail

Une tâche contient notamment un type, un titre, une priorité, un responsable, un département, une échéance et une description. Elle peut aussi être complétée par une checklist, des dépendances et des blocages dans son détail.

Toutes les références sont revérifiées dans l’organisation active.

## États métier

Le cycle canonique est :

- **À faire** (`TODO`) ;
- **En cours** (`IN_PROGRESS`) ;
- **Bloquée** (`BLOCKED`) ;
- **Terminée** (`DONE`) ;
- **Annulée** (`CANCELLED`).

Le serveur décide si la transition demandée est encore autorisée au moment de l’enregistrement.

## Checklist, blocages et dépendances

La checklist est facultative. Lorsqu’elle contient des éléments, tous les éléments actifs doivent être terminés avant de terminer la tâche.

Le serveur refuse également **Terminer** lorsqu’un blocage actif existe ou lorsqu’une tâche prédécesseur liée n’est pas encore terminée.

Les dépendances vers soi-même, vers une autre organisation ou créant un cycle restent interdites.

## Actions sensibles

**Bloquer**, **Annuler** et **Archiver** demandent un motif professionnel. Le motif est conservé dans la traçabilité de la transition.

Une fois la tâche `DONE` ou `CANCELLED`, sa coordination (checklist, dépendances, blocages) devient non modifiable.

## Expérience guidée

Les créations, modifications et actions sensibles utilisent les dialogues éditeur plein écran sur mobile. Une erreur serveur ou locale laisse le contexte visible afin de corriger la saisie sans recommencer le parcours.

## Accès et permissions

- Les actions dépendent du rôle, de l’assignation, des permissions et de l’organisation active.
- Une action masquée dans l’interface reste refusée côté serveur si elle n’est pas autorisée.
- Les révisions protègent contre une modification concurrente.

## Traçabilité

Chaque transition conserve l’acteur, l’état précédent, l’état suivant, la date et le motif lorsqu’il est requis. Les liens vers la source métier restent conservés.

## Dépannage

Si une terminaison est refusée, vérifiez successivement la checklist, les blocages actifs et les tâches prédécesseurs. Si la fiche a été modifiée simultanément, actualisez-la puis reprenez l’action à partir de la dernière révision affichée.
