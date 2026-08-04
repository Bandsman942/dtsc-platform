# Modèle standard des validations

## Autorité

`EnterpriseApproval` représente l'action attendue sur un objet source. Il ne copie pas l'objet métier et ne remplace pas son service de transition.

## Composition

- validation : cible, demandeur, validateur, statut, révision et commentaire courant ;
- version soumise : snapshot JSON, numéro, auteur, commentaire et date ;
- décision : version, acteur, résultat, motif, clé d'idempotence et date ;
- événements opérationnels : correction, délégation, resoumission et transitions visibles.

## Soumission et version

La première décision garantit l'existence d'une version 1. Une demande de correction conserve cette version. La resoumission crée la version suivante à partir de l'état actuel de l'objet source.

Les snapshots utilisent uniquement des champs métier réels et sérialisables. Pour un budget, ils comprennent les métadonnées du budget et ses lignes planifiées, et non un montant total inexistant.

## Décision

Une approbation ou un refus :

1. vérifie le validateur, l'organisation, l'état et la révision ;
2. refuse l'auto-approbation lorsque le parcours l'interdit ;
3. appelle le service canonique correspondant à la cible ;
4. crée une décision liée à la version soumise ;
5. écrit l'audit et notifie le demandeur.

La contrainte sur la clé d'idempotence et sur acteur/version empêche une double décision.

## Correction

`REQUEST_CORRECTION` exige un motif. Les tâches et demandes prises en charge retournent dans leur état de correction contrôlé. `RESUBMIT` est réservé au demandeur ou au gestionnaire autorisé et remet la validation en attente.

## Délégation

`DELEGATE` vérifie que le nouveau validateur est membre actif de la même organisation et qu'il n'est pas le demandeur. L'ancien validateur reste visible dans l'événement d'audit.

## Sources intégrées

Les services actuels couvrent notamment les tâches, demandes, réunions, achats, budgets, dépenses et incidents qualité pharmacie. Toute nouvelle cible exige un adaptateur serveur ; une option frontend seule est interdite.

## Limites

- Les groupes de validateurs, quorums et votes parallèles relèvent du moteur de workflow lorsqu'ils sont configurés.
- La révocation d'une décision finale exige une procédure métier distincte.
- Les objets qui ne possèdent pas d'état de correction restent en lecture/action limitée jusqu'à l'ajout d'un adaptateur explicite.
