# OWNER_E2E — Filtres SLA opérationnels #469

Statut : **NON EXÉCUTÉ — validation propriétaire requise avant merge**.

## Objectif

Valider dans l’interface Administration DTSC que les filtres SLA ne sont plus décoratifs : les priorités et statuts viennent du workflow réel, empêchent une liaison incompatible et clôturent effectivement le chrono quand un statut d’arrêt est atteint.

## Préconditions

- utiliser un compte autorisé à gérer les SLA opérationnels ;
- disposer d’au moins un objet test pour `TASK`, `OPERATION` et `DEPARTMENT_REQUEST` ;
- ne pas modifier les données de production métier critiques pour ce test ;
- la PR doit être testée sur son head exact et le SHA doit être communiqué dans la demande OWNER_E2E.

## Parcours 1 — TASK

1. Ouvrir **Administration DTSC → SLA opérationnels avancés**.
2. Créer une règle pour **Tâche** avec une priorité contrôlée, un statut de démarrage correspondant à la tâche test et au moins un statut d’arrêt parmi les statuts proposés.
3. Vérifier qu’aucun champ libre ne permet de saisir manuellement une priorité ou un statut.
4. Dans **Démarrer un suivi**, choisir `TASK`, sélectionner la tâche sans copier son identifiant technique puis sélectionner la règle compatible.
5. Démarrer le suivi et vérifier qu’il apparaît parmi les instances actives.
6. Faire évoluer la tâche vers un statut d’arrêt configuré.
7. Cliquer **Évaluer maintenant** et vérifier que l’instance passe à `COMPLETED` au lieu de continuer vers `WARNING` ou `BREACHED`.

## Parcours 2 — OPERATION

1. Créer une règle **Opération** avec une priorité différente de celle de l’opération test.
2. Sélectionner l’opération dans **Démarrer un suivi** et vérifier que la règle incompatible n’est pas proposée comme règle compatible.
3. Créer ou utiliser une règle dont priorité et statut de démarrage correspondent à l’opération.
4. Démarrer le suivi avec cette règle et confirmer le succès.
5. Faire passer l’opération dans un statut d’arrêt configuré, exécuter **Évaluer maintenant** et confirmer la clôture automatique du suivi.

## Parcours 3 — DEPARTMENT_REQUEST

1. Créer une règle **Demande inter-départements** avec un statut de démarrage précis.
2. Sélectionner une demande dont le statut ne correspond pas et confirmer qu’aucune règle incompatible n’est proposée.
3. Faire évoluer ou choisir une demande dans le statut attendu.
4. Démarrer le suivi depuis le sélecteur contrôlé.
5. Faire atteindre à la demande un statut d’arrêt configuré puis exécuter **Évaluer maintenant**.
6. Vérifier que le suivi est clôturé automatiquement.

## Compatibilité historique

Si une ancienne politique contient une valeur de priorité ou de statut qui n’existe plus dans le référentiel du workflow :

- la politique doit rester lisible ;
- l’interface doit signaler qu’une valeur historique est hors référentiel ;
- cette valeur ne doit pas apparaître comme nouveau choix autorisé ;
- le moteur ne doit pas bloquer les anciennes politiques uniquement à cause de cette valeur historique invalide.

## Responsive / accessibilité

Sur au moins un parcours, vérifier également :

- mobile 320–414 px et desktop ;
- aucun débordement horizontal ;
- listes de statuts utilisables au tactile ;
- focus clavier visible sur les select, cases à cocher et boutons ;
- libellés longs lisibles ;
- mode clair et sombre.

## Preuve attendue

La validation humaine doit être donnée sous la forme : **`E2E #<PR> bon`** sur le head exact communiqué. Cette preuve est enregistrée séparément de la CI ; une CI verte ne remplace jamais l’OWNER_E2E.
