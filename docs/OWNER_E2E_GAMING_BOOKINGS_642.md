# OWNER_E2E — Gaming Bookings #642

Ce scénario doit être exécuté sur le head final de la PR #642 avant merge.

## Préconditions

- entreprise `HOSPITALITY_EVENTS / GAMING_LOUNGE` autorisée ;
- `GAMING_STATIONS`, `GAMING_SESSIONS` et `GAMING_BOOKINGS` activés selon les droits du testeur ;
- au moins cinq postes Gaming liés à des actifs canoniques ;
- au moins un sixième poste pour vérifier l’absence de plafond produit ;
- au moins un client CRM actif avec rôle `CUSTOMER` ;
- au moins un poste dont l’actif possède un site ;
- au moins un poste pouvant être placé en maintenance ou recevoir un incident majeur.

## Scénario

1. Ouvrir **Réservations Gaming** sur desktop puis mobile (320–414 px), en clair et sombre, en français puis en anglais.
2. Créer une réservation confirmée sur un poste avec un client CRM actif et vérifier que le client affiché correspond à la fiche CRM existante.
3. Vérifier que le site affiché dans le détail correspond au site de l’actif lié au poste et qu’aucun site distinct n’est demandé dans le formulaire.
4. Créer une seconde réservation sans client et vérifier qu’elle apparaît comme **joueur occasionnel / walk-in player** sans création automatique d’une fiche CRM.
5. Sur le même poste que l’étape 2, tenter une réservation confirmée dont le créneau chevauche partiellement la première : elle doit être refusée avec un message métier de conflit.
6. Créer deux créneaux exactement adjacents sur le même poste (`fin A = début B`) et vérifier qu’ils sont acceptés.
7. Créer une réservation de plus de 24 h et vérifier qu’elle est refusée sans fermer le formulaire ni perdre les valeurs déjà saisies.
8. Modifier une réservation confirmée vers un créneau qui chevauche une autre réservation : la modification doit être refusée et l’ancienne réservation doit rester intacte.
9. Modifier ensuite cette réservation vers un créneau libre et vérifier que la modification est enregistrée et journalisée.
10. Tester, si possible avec deux onglets, une modification concurrente sur la même révision : une seule doit réussir et l’autre doit demander une actualisation.
11. Sur une réservation confirmée, choisir **Enregistrer l’arrivée** et vérifier le passage à `CHECKED_IN` avec l’historique correspondant.
12. Choisir ensuite **Démarrer la session** : une seule session `ACTIVE` doit être créée, liée à la réservation, avec le même client éventuel et le même poste.
13. Vérifier dans **Sessions de jeu** que la session créée possède une durée initiale correspondant au créneau réservé et que le poste passe à `IN_USE`.
14. Rejouer la même intention de conversion lorsque le scénario/outillage le permet : aucune deuxième session ni deuxième transition ne doit être créée.
15. Vérifier qu’une réservation déjà convertie ne peut plus être modifiée, annulée ou reconvertie.
16. Sur une autre réservation confirmée, choisir **Marquer absent** : l’historique doit rester visible et le créneau doit cesser de bloquer une nouvelle réservation.
17. Sur une autre réservation brouillon ou confirmée, choisir **Annuler la réservation** : l’historique doit rester visible et le créneau doit être libéré.
18. Placer le poste d’une réservation `CHECKED_IN` en maintenance ou ouvrir un incident majeur sur son actif puis tenter la conversion : le démarrage de session doit être refusé avec la cause métier exacte.
19. Vérifier la recherche par référence, poste et client, les filtres de statut, la pagination et les vues **Liste / Calendrier**.
20. Vérifier que les dialogs création/modification restent scrollables avec le clavier mobile, sans débordement horizontal, et que succès/erreurs utilisent les toasts globaux.
21. Vérifier qu’un parc supérieur à cinq postes reste navigable dans les formulaires grâce à la pagination et qu’aucune limite de cinq n’apparaît.
22. Vérifier que #642 ne crée aucune facture, paiement, caisse, mouvement de trésorerie ni montant final lors de la réservation ou de la conversion.

## Validation attendue

Confirmer dans la conversation : `E2E #642 bon` ou signaler précisément l’étape qui échoue.
