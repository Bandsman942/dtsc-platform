# Guide utilisateur — Réunions
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Le module **Réunions** couvre la préparation, la tenue, le compte rendu versionné, les décisions et les tâches de suivi.

## Planifier une réunion

Renseignez le titre, les dates, le mode, le département, les participants et l’ordre du jour.

Le formulaire adapte les champs au mode choisi :

- **En ligne** : lien de réunion obligatoire ;
- **Présentiel** : lieu physique obligatoire ;
- **Hybride** : lieu physique et lien obligatoires.

Quand le mode change, les données devenues incompatibles ne sont pas conservées comme seconde source cachée.

## Participants et réponses

Les participants doivent être des membres actifs de l’organisation. Lors d’une modification, les participants déjà présents conservent leur réponse `ACCEPTED`, `DECLINED`, `TENTATIVE` ou `INVITED`. Seuls les nouveaux participants démarrent à `INVITED`.

Un participant retiré est supprimé explicitement de la réunion.

## Statuts, validations et traçabilité

Le cycle principal est **Planifiée → En cours → Terminée**, avec possibilité d’annulation selon les permissions. L’édition générale n’est autorisée que pendant les états planifié ou en cours.

**Annuler** et **Archiver** demandent un motif professionnel dans l’interface guidée. Les changements d’état, réponses des participants, versions de compte rendu, décisions et actions de suivi restent historisés avec leurs acteurs.

## Ordre du jour structuré

La structure de l’ordre du jour est préparée avant le démarrage. Pendant la réunion, les sujets peuvent être marqués comme discutés, reportés ou annulés. Après la fin, l’ordre du jour ne peut plus être modifié.

## Compte rendu versionné

Le compte rendu n’est jamais saisi dans le formulaire général de réunion. Il possède son propre moteur versionné.

- un brouillon de compte rendu peut être enregistré pendant ou après la réunion ;
- chaque enregistrement crée une nouvelle version ;
- la publication est autorisée uniquement lorsque la réunion est `COMPLETED` ;
- l’historique des versions reste conservé.

## Décisions et tâches de suivi

Les décisions sont enregistrées pendant ou après la réunion. Une décision peut produire une vraie tâche liée. Les actions de suivi peuvent être liées ou déliées pendant ou après la réunion, mais pas avant son démarrage ni après annulation.

## Accès et permissions

L’organisateur ou un responsable autorisé pilote les changements d’état et les modifications. Toutes les mutations restent vérifiées côté serveur dans l’organisation active.

## Sécurité et confidentialité

Les participants, départements, décisions, comptes rendus et tâches de suivi sont revalidés dans la même organisation. Les liens et lieux ne donnent aucun droit supplémentaire : l’accès dépend toujours de la session, du membership et des permissions serveur applicables à la réunion.

## Expérience guidée

Les formulaires et détails utilisent la présentation éditeur adaptée au mobile. Les champs requis changent selon le mode et les erreurs n’effacent pas la saisie en cours.

## Dépannage

Si la publication d’un compte rendu est refusée, terminez d’abord la réunion. Si un champ lieu/lien est signalé, vérifiez le mode actif. Après une modification concurrente, actualisez la réunion avant de reprendre l’action.
