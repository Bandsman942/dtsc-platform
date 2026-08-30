# Guide utilisateur — Demandes internes
> **Contrat de guide DTSC v2** — Fonctionnalités réellement déployées, interface FR/EN, permissions serveur et parcours mobile.

## Objectif et périmètre

Le module **Demandes internes** formalise un besoin adressé à un collaborateur ou à une équipe dans l’organisation active. Ce guide décrit le cycle canonique réellement persisté.

## Créer une demande

Le type est choisi dans le catalogue contrôlé : Général, Information, Document, Validation, Support, Action, Réunion, Suivi ou Autre. Le titre, la description, la priorité, le destinataire, le département et l’échéance complètent le brouillon.

Le destinataire et le département sont revérifiés dans la même organisation.

## Statuts, validations et traçabilité

Les seuls états métier persistés sont :

- **Brouillon** (`DRAFT`) ;
- **Soumise** (`SUBMITTED`) ;
- **En revue** (`IN_REVIEW`) ;
- **Approuvée** (`APPROVED`) ;
- **Rejetée** (`REJECTED`) ;
- **Traitée** (`FULFILLED`) ;
- **Annulée** (`CANCELLED`).

Les actions de coordination n’introduisent pas une seconde machine d’état. Demander une information ou répondre conserve la demande dans son état canonique de revue, tandis que les échanges, versions, motifs, acteurs et transitions restent historisés séparément.

## Prise en charge et échanges

Après soumission, un utilisateur autorisé peut prendre la demande en charge. Les demandes d’information et réponses sont conservées dans la conversation opérationnelle et dans l’historique.

Chaque mutation transmet la révision de la fiche. Si un autre utilisateur l’a modifiée entre-temps, le serveur refuse l’action et demande une actualisation.

## Résolution, clôture et réouverture

**Résoudre** conduit au résultat métier `FULFILLED`. **Clôturer** confirme la fin du traitement sans créer un nouvel état parallèle. Une réouverture repart vers `IN_REVIEW` et conserve l’historique précédent.

Une demande approuvée peut également être marquée comme traitée si aucune validation bloquante ne subsiste.

## Validation et correction

Une validation liée utilise le module **Validations**. Si une correction est demandée, la validation passe dans son cycle de correction et la demande revient en brouillon pour être modifiée, puis resoumise. Le statut `CORRECTION_REQUESTED` appartient à la validation, pas à la demande.

## Actions sensibles

Les annulations, clôtures, réouvertures et autres actions nécessitant un contexte utilisent un motif professionnel. Le motif est conservé dans les commentaires ou événements opérationnels.

## Accès et permissions

- Le demandeur contrôle son brouillon et les actions qui lui sont explicitement réservées.
- Le responsable ou l’assigné traite la demande selon son état et ses permissions.
- Les contrôles serveur restent l’autorité finale, indépendamment de l’affichage UI.

## Sécurité et confidentialité

Les demandes, assignations, départements et validations liées restent strictement limitées à l’organisation active. Les références externes sont rejetées côté serveur, les permissions sont revérifiées à chaque mutation et les motifs ou commentaires sensibles ne doivent jamais devenir visibles à un autre tenant.

## Expérience guidée

Les formulaires utilisent le catalogue de types FR/EN et les dialogues éditeur adaptés au mobile. Les erreurs sont affichées sans effacer la saisie en cours.

## Dépannage

Si une action devient indisponible, vérifiez l’état actuel, l’assignation et la révision de la demande. Actualisez la fiche après un conflit de révision avant de réessayer.
