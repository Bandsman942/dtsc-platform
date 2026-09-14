# OWNER_E2E — Gaming Sessions #641

Ce scénario doit être exécuté sur le head final de la PR #641 avant merge.

## Préconditions

- entreprise `HOSPITALITY_EVENTS / GAMING_LOUNGE` autorisée ;
- `GAMING_STATIONS` et `GAMING_SESSIONS` activés selon les droits du testeur ;
- au moins cinq postes Gaming liés à des actifs canoniques, disponibles au départ ;
- au moins un poste ou actif pouvant être placé en maintenance/hors service pour le scénario négatif.

## Scénario

1. Ouvrir **Sessions de jeu** sur desktop puis mobile (au minimum 360 px), en clair et sombre.
2. Démarrer des sessions simultanées sur plusieurs postes distincts parmi les cinq postes disponibles.
3. Vérifier que chaque poste occupé passe à `IN_USE` côté **Postes de jeu**.
4. Tenter deux démarrages concurrents sur le même poste : une seule session live doit exister et la requête perdante doit recevoir une erreur métier compréhensible.
5. Mettre une session en pause avec `pauseBillable=false` ; vérifier que le temps facturable n’augmente pas pendant la pause et que le temps restant affiché reste stable.
6. Reprendre la session ; vérifier que la fin prévue est décalée conformément à la durée de pause.
7. Prolonger la session ; vérifier que la nouvelle fin prévue vient du serveur.
8. Transférer une session active ou en pause vers un autre poste disponible ; vérifier que l’ancien poste est libéré et le nouveau passe `IN_USE`.
9. Rejouer, lorsque le scénario le permet, la même intention avec la même clé d’idempotence et vérifier qu’aucune session ni transition supplémentaire n’est créée.
10. Terminer la session ; vérifier que `endedAt`, `pausedSeconds` et `billableSeconds` sont figés et que le poste est libéré.
11. Tenter une nouvelle transition de temps sur une session terminée ; elle doit être refusée.
12. Placer un poste en maintenance ou créer un incident majeur sur son actif, puis vérifier qu’un nouveau démarrage est refusé.
13. Vérifier qu’une station `IN_USE` ne peut pas être remise manuellement disponible ou bloquée tant que sa session live existe.
14. Vérifier recherche, filtres, pagination, historique des transitions, FR/EN, scroll/dialogs mobiles et absence de débordement.
15. Vérifier qu’un parc supérieur à cinq stations reste navigable et qu’aucune limite de cinq n’apparaît.

## Validation attendue

Confirmer dans la conversation : `E2E #641 bon` ou signaler précisément l’étape qui échoue.
