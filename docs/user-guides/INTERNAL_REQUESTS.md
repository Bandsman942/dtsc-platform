# Guide utilisateur — Demandes internes

## Rôle du module

Le module **Demandes internes** formalise un besoin adressé à une équipe ou à un responsable de l'entreprise. Il conserve le demandeur, le type, la description, la priorité, l'assignation, l'échéance, les réponses et l'historique.

## Créer une demande

Cliquez sur **Nouvelle demande** et renseignez :

- le type ou la catégorie proposée ;
- l'objet et la description ;
- la priorité ;
- le destinataire ou le département ;
- l'échéance souhaitée lorsque nécessaire ;
- la source métier éventuelle.

Le formulaire valide le contexte, le membership et le destinataire côté serveur. Une demande peut être enregistrée en brouillon ou directement soumise selon le parcours.

## Rechercher et filtrer

Utilisez la recherche et les filtres de statut, priorité, assigné et département. Les résultats sont paginés et limités aux demandes que votre rôle peut consulter.

## Traitement

Selon vos capacités et l'état courant, les actions professionnelles incluent :

- soumettre une demande en brouillon ;
- trier ou assigner la demande ;
- commencer le traitement ;
- demander des informations complémentaires ;
- répondre et reprendre le traitement ;
- résoudre ;
- clôturer ;
- rouvrir lorsque la règle l'autorise ;
- rejeter ou annuler avec un motif lorsque requis.

Les transitions non autorisées sont refusées côté serveur.

## Demande d'information

Lorsqu'une information manque, le responsable peut placer la demande en attente du demandeur et expliquer ce qui est nécessaire. Le demandeur répond dans le même objet ; l'historique conserve les deux actions.

## Résolution, clôture et réouverture

**Résolue** signifie qu'une solution a été fournie. **Clôturée** signifie que le traitement est terminé. Une réouverture ne supprime jamais l'ancienne résolution ; elle crée un nouvel événement d'historique et notifie l'assigné lorsque le moteur le prévoit.

## Validation

Une demande soumise peut produire une validation commune lorsque le parcours métier l'exige. La file de validations ne copie pas la demande : elle référence l'objet source et ouvre sa fiche.

## Documents, commentaires et notifications

Les pièces jointes utilisent le stockage documentaire canonique. Les commentaires utilisent la primitive commune et peuvent produire des notifications. Une notification ouvre la demande exacte et revérifie l'accès actuel.

## SLA

Le module n'affiche un délai SLA que lorsqu'un calcul serveur réel est disponible. Une simple date d'échéance n'est pas présentée comme un SLA contractuel.

## Limites

- Les catégories configurables dépendent des référentiels déjà activés dans l'entreprise.
- Les matrices SLA complexes, pauses automatiques et escalades planifiées ne sont pas annoncées si elles ne sont pas configurées.
- La suppression définitive d'une demande traitée n'est pas proposée ; l'historique reste conservé.
