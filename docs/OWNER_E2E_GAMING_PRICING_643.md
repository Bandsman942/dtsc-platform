# OWNER_E2E — Gaming Pricing #643

Ce scénario doit être exécuté sur le head final de la PR #643 avant merge.

## Préconditions

- entreprise `HOSPITALITY_EVENTS / GAMING_LOUNGE` autorisée ;
- `GAMING_STATIONS`, `GAMING_SESSIONS`, `GAMING_BOOKINGS` et `GAMING_PRICING_PACKAGES` accessibles selon les droits du testeur ;
- au moins six postes pour confirmer l’absence de plafond à cinq ;
- au moins un service Catalogue actif de type `SERVICE` ;
- au moins une devise active dans Finance ;
- au moins un utilisateur avec `enterprise.gaming.pricing.manage` et un autre sans ce droit ;
- un poste lié à un actif dont le site possède une timezone connue ;
- une réservation `CHECKED_IN` disponible pour tester la conversion tarifée.

## Scénario

1. Ouvrir **Tarifs & forfaits Gaming** sur desktop puis mobile 320–414 px, en clair/sombre, FR puis EN.
2. Vérifier qu’un tarif ne peut référencer qu’un service actif du Catalogue et qu’aucun second catalogue Gaming n’est créé.
3. Créer un tarif `PER_MINUTE` actif, puis simuler exactement **30 minutes** sans renseigner de date de simulation. Vérifier que l’heure serveur courante est utilisée, jamais le 1er janvier 1970, puis vérifier règle, devise et montant attendus.
4. Créer un tarif `PER_HOUR` actif, puis simuler exactement **60 minutes** et une durée dépassant l’incrément. Vérifier l’arrondi serveur.
5. Créer un `PACKAGE` de **180 minutes / 3 heures**, le simuler à 180 minutes et vérifier le montant forfaitaire.
6. Vérifier qu’un package/durée fixe avec une durée différente ne gagne pas la résolution.
7. Créer une règle limitée à un jour et une plage horaire. Tester juste avant le début, à la frontière de début, juste avant la fin et à la frontière de fin.
8. Tester une plage horaire traversant minuit et vérifier la timezone du site de l’actif du poste.
9. Tester une règle globale et une règle plus spécifique par poste/famille de console/groupe de joueurs avec la même priorité ; vérifier le départage par spécificité.
10. Modifier les priorités pour vérifier que la priorité serveur reste déterministe et indépendante de l’ordre visuel de la liste.
11. Utiliser une devise inactive/non autorisée et vérifier le refus métier avant activation/utilisation du tarif.
12. Dans **Sessions de jeu**, choisir poste + service + durée + joueurs et cliquer **Calculer le tarif** ; vérifier que l’aperçu correspond à la simulation Pricing.
13. Démarrer la session et vérifier `quotedAmount`, devise, règle retenue et service dans le détail.
14. Modifier ensuite le montant de la règle tarifaire active. Recharger la session déjà démarrée : son montant estimé/snapshot doit rester inchangé.
15. Pour une session `PER_MINUTE` ou `PER_HOUR`, laisser évoluer le temps facturable puis terminer la session. Vérifier que `finalAmount` suit le temps facturable et l’incrément du snapshot.
16. Pour une session `PACKAGE`/`FIXED_DURATION`, terminer la session et vérifier que le montant final reste le forfait snapshotté.
17. Rejouer le même démarrage avec la même intention/idempotency key via l’outillage disponible : aucune seconde session, transition ou nouvelle résolution tarifaire ne doit apparaître.
18. Avec l’utilisateur sans droit `manage`, tenter une dérogation : elle doit être refusée.
19. Avec l’utilisateur `manage`, saisir un montant dérogatoire sans motif puis avec un motif valide : le premier doit être refusé, le second accepté et auditable.
20. Modifier/désactiver/archiver une règle et vérifier que les anciennes sessions conservent leur règle/snapshot/montants historiques.
21. Dans **Réservations Gaming**, prendre une réservation `CHECKED_IN`, cliquer **Démarrer la session**, choisir un service Catalogue et vérifier que le bouton de démarrage reste indisponible tant qu’aucun aperçu tarifaire n’a été calculé.
22. Calculer l’aperçu de cette réservation et vérifier que la durée utilisée correspond au créneau réservé et que le nombre de joueurs correspond à la réservation.
23. Démarrer la session réservée et vérifier qu’elle possède immédiatement `serviceCatalogItemId`, règle, snapshot, devise et `quotedAmount`, tout en restant liée à la réservation par `bookingId`.
24. Rejouer la même conversion/idempotency key via l’outillage disponible : aucune seconde session ni deuxième conversion ne doit apparaître.
25. Vérifier recherche, filtres, pagination des règles, pagination des services et pagination des postes avec un parc supérieur à cinq.
26. Vérifier que les dialogs Pricing, Sessions et conversion Réservation restent scrollables avec clavier mobile, sans débordement horizontal, et que les erreurs/succès utilisent le feedback commun.
27. Après simulations, démarrages, conversions de réservation et fins de session, vérifier que #643 n’a créé **aucune vente, facture, paiement, caisse, mouvement bancaire/Mobile Money ou mouvement de trésorerie**.
28. Vérifier qu’aucune somme multi-devise n’est présentée : chaque session tarifée garde une seule devise validée.

## Validation attendue

Confirmer dans la conversation : `E2E #643 bon` ou signaler précisément l’étape qui échoue.
