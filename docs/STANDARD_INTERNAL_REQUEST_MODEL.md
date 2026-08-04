# Modèle des demandes internes standards

## Autorité canonique

`EnterpriseRequest` est l'autorité du cycle de traitement. `EnterpriseActivityRequest` peut rester la source d'un formulaire sectoriel et créer une demande standard liée, mais ne remplace pas son historique opérationnel.

## Données principales

Une demande conserve : organisation, type, titre, description, demandeur, assigné, département, priorité, statut, échéance, source éventuelle, révision, dates de clôture et d'archivage.

## Cycle professionnel

Le cycle peut utiliser les familles suivantes selon le parcours existant :

```text
DRAFT → SUBMITTED → ASSIGNED / IN_REVIEW → IN_PROGRESS
IN_PROGRESS → WAITING_REQUESTER → IN_PROGRESS
IN_PROGRESS / APPROVED → RESOLVED → CLOSED
CLOSED / RESOLVED / FULFILLED → REOPENED
```

Les statuts historiques `APPROVED`, `REJECTED`, `FULFILLED` restent supportés pour compatibilité avec les services déjà déployés. Une transition non admise depuis l'état courant retourne `INVALID_STATE`.

## Informations complémentaires

Le responsable peut demander une information avec un commentaire obligatoire. Le demandeur répond dans le même objet. Les commentaires sont stockés dans `EnterpriseOperationalComment` et les transitions dans `EnterpriseOperationalEvent`.

## Résolution, clôture et réouverture

La résolution et la clôture sont distinctes. La réouverture remet `closedAt` à `null`, conserve les événements précédents et exige un motif. Le destinataire est notifié lorsque la règle le prévoit.

## Accès

Un gestionnaire autorisé voit le périmètre entreprise. Sinon, la visibilité est limitée au demandeur et à l'assigné. Les actions de traitement sont réservées à l'assigné ou au gestionnaire ; les réponses et réouvertures sont réservées au demandeur ou au gestionnaire.

## Validation et documents

Une validation est un objet séparé lié à la demande. Les documents sont attachés par le système documentaire canonique et les liens inter-modules existants.

## SLA

Aucun SLA n'est déduit d'une simple échéance. Un indicateur SLA ne peut être affiché qu'avec un calcul serveur documenté tenant compte des pauses, reprises et calendriers applicables.

## Limites

- Les catégories avancées et matrices SLA ne sont pas introduites par cette migration.
- Certains anciens boutons d'action continuent d'utiliser les transitions Core v2 historiques ; le panneau de coordination expose les nouveaux parcours sans supprimer la compatibilité.
