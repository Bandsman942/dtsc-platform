# OWNER_E2E — Gaming Checkout & Daily Close #644

## Règle de validation

Ce scénario doit être exécuté par le propriétaire fonctionnel sur la branche/PR finale de #644 après succès CI. La fusion est interdite tant que le propriétaire n’a pas répondu explicitement :

`E2E #644 bon`

Noter toute anomalie avec étape, utilisateur, site, devise, compte et référence de checkout concernés. Ne pas compenser une anomalie en modifiant directement la base.

## Préconditions

Préparer une entreprise `HOSPITALITY_EVENTS / GAMING_LOUNGE` possédant :

- au moins 6 postes Gaming actifs afin de vérifier l’absence de limite à cinq ;
- au moins un site avec timezone réelle ;
- au moins un service Catalogue Gaming actif et une règle Pricing active ;
- un client CRM actif et la possibilité de démarrer une session sans client ;
- deux utilisateurs distincts pouvant jouer les rôles maker/checker Finance ;
- un compte Cash actif dans une devise A avec session de caisse ouverte ;
- un compte Mobile Money actif dans la même devise A ;
- si disponible, un compte financier dans une devise B différente ;
- un produit physique Catalogue non suivi en stock ;
- un produit physique `trackInventory = true`, configuré dans Inventory avec quantité disponible ;
- si possible, un produit `lotTracking = true` pour vérifier le refus du choix automatique de lot.

## 1 — UX, responsive et langues

1. Ouvrir `GAMING_CHECKOUT` et `GAMING_DAILY_CLOSE` sur desktop puis mobile.
2. Vérifier mode clair et sombre.
3. Passer FR → EN → FR et vérifier que titres, actions, erreurs et formulaires changent sans rechargement incohérent.
4. Ouvrir les dialogs de création avec clavier mobile : le contenu doit rester scrollable verticalement, sans débordement horizontal et sans action inaccessible.
5. Vérifier que la liste fonctionne avec plus de cinq postes/sessions et qu’aucun plafond métier à cinq n’apparaît.

## 2 — Session terminée vers Checkout

6. Démarrer une session tarifée puis l’arrêter. Vérifier que le montant final est calculé par le serveur et que la session devient `TO_CHECKOUT`.
7. Rejouer la même commande `END`/retry si l’UI ou l’outil de test le permet. Vérifier qu’il n’existe qu’une seule transition effective vers `TO_CHECKOUT` et aucun second montant.
8. Vérifier qu’une ancienne session `ENDED` possédant `finalAmount`, devise et service reste proposée comme session encaissable.

## 3 — Checkout et facture exactement une fois

9. Sur une session avec client CRM identifié, préparer un checkout sans produit supplémentaire. Choisir un validateur de facture différent du maker. Vérifier : un seul `EnterpriseGamingCheckout`, une seule `EnterpriseSalesInvoice`, même client CRM, même devise que la session.
10. Réessayer la préparation de la même session. Vérifier qu’aucune seconde facture ni second checkout n’est créé.
11. Préparer ensuite un checkout à partir d’une session anonyme. Vérifier qu’aucune fiche joueur personnelle n’est créée et que la facture utilise le tiers système walk-in canonique.
12. Avec le maker, tenter une action réservée au validateur si les permissions ne l’autorisent pas : elle doit être refusée proprement.
13. Avec le checker affecté, approuver et émettre la facture. Vérifier qu’une créance Finance est créée et que le checkout devient encaissable.

## 4 — Paiement Cash

14. Ajouter un paiement Cash partiel avec le compte Cash de la même devise et affecter un validateur Paiements distinct. Vérifier que le paiement reste dans le workflow Finance et que le checkout n’invente aucun tender/caisse Gaming.
15. Approuver le paiement avec le checker. Vérifier : `EnterprisePayment` confirmé, mouvement de caisse commun, transaction Trésorerie commune, allocation sur la créance, checkout `PARTIALLY_PAID` si le solde reste positif.
16. Fermer temporairement la session de caisse ou utiliser un compte non compatible puis tenter un autre paiement Cash. Vérifier une erreur métier spécifique ; aucun paiement confirmé ni mouvement de trésorerie orphelin ne doit être créé.

## 5 — Mobile Money et paiement mixte

17. Sur le même checkout partiellement payé, ajouter le solde via Mobile Money avec un compte Mobile Money compatible. Faire approuver le paiement.
18. Vérifier que la somme des allocations Cash + Mobile Money règle exactement la créance et que facture, checkout et session deviennent `PAID`.
19. Tenter de préparer un paiement dont le montant dépasse le solde disponible, y compris quand un autre paiement est déjà `PENDING_APPROVAL`. Le serveur doit refuser le dépassement.
20. Rejouer une même clé/idempotency de paiement si possible. Vérifier qu’aucun second `EnterprisePayment`, mouvement Trésorerie ou allocation n’est créé.

## 6 — Reçu réconcilié

21. Ouvrir le reçu. Vérifier qu’il affiche la référence Checkout, la session/poste, le numéro de facture, les lignes, la devise, le total et les deux paiements confirmés.
22. Comparer les identifiants/références avec les modules Finance/Paiements : le reçu doit être réconciliable et ne doit pas représenter une seconde source de vérité.

## 7 — Produits physiques et Inventory

23. Créer une nouvelle session tarifée, la terminer, puis préparer son checkout avec :
   - un produit physique non suivi en stock ;
   - un produit `trackInventory = true` avec entrepôt compatible.
24. Vérifier que le prix des extras vient du Catalogue dans la devise de la session et que le produit suivi génère une seule sortie Inventory `SALE_FULFILLMENT`.
25. Vérifier que le temps de jeu/service ne génère aucun mouvement de stock.
26. Tenter un entrepôt d’un autre site : le serveur doit refuser.
27. Si un article `lotTracking = true` existe, tenter de l’ajouter : le serveur doit refuser le checkout plutôt que choisir automatiquement un lot.

## 8 — Annulation avant émission

28. Préparer un checkout avec un produit suivi puis l’annuler avant émission avec un motif valide.
29. Vérifier : facture en attente annulée, checkout/session `CANCELLED`, sortie Inventory compensée par un `RETURN_IN`, aucune transaction financière confirmée créée.
30. Rejouer l’annulation : aucun second retour Inventory ne doit apparaître.

## 9 — Remboursement complet et inverses Finance

31. Utiliser un checkout `PAID` contenant au moins un paiement et, idéalement, un produit suivi. Demander un remboursement complet avec motif et validateur distinct.
32. Vérifier que le checkout devient `REFUND_PENDING` et qu’un paiement sortant `REFUND` existe dans le workflow Paiements.
33. Avec le demandeur initial, tenter d’approuver son propre remboursement : le serveur doit refuser.
34. Avec le checker autorisé, approuver le remboursement.
35. Vérifier après succès :
   - allocations client confirmées inversées ;
   - écriture d’allocation contrepassée lorsqu’elle existait ;
   - avoir client créé depuis les montants historiques et `POSTED` ;
   - remboursement `CONFIRMED`/réconciliable ;
   - transaction Trésorerie sortante ;
   - mouvement Cash inverse si remboursement Cash ;
   - posting `CUSTOMER_REFUND_CONFIRMED` présent ;
   - produits suivis restockés une seule fois ;
   - checkout `REFUNDED` ;
   - historique financier initial conservé.
36. Rejouer demande/approbation avec les mêmes identifiants lorsque possible. Vérifier l’absence de double avoir, double remboursement, double retour Inventory ou double posting.
37. Réouvrir le reçu du checkout remboursé et vérifier paiements, remboursement et avoir.

## 10 — Clôture journalière, timezone et paiement tardif

38. Créer ou choisir une session terminée la veille, mais effectuer son paiement aujourd’hui. Créer la clôture d’aujourd’hui pour son site. Vérifier que le paiement est inclus dans les lignes financières d’aujourd’hui même si la session n’est pas comptée parmi les sessions terminées aujourd’hui.
39. Effectuer, si possible, aujourd’hui un remboursement d’un checkout d’un jour précédent. Vérifier que le remboursement diminue l’`expectedAmount` de la clôture d’aujourd’hui.
40. Sur un site dont la timezone diffère d’UTC, effectuer une opération proche d’une frontière de journée locale ou vérifier les timestamps existants. La clôture doit utiliser minuit → minuit dans la timezone du site, pas la date UTC brute.
41. Déclarer une ligne Cash et une ligne Mobile Money. Vérifier pour chaque ligne : compte, méthode, devise, nombre d’encaissements, `inboundAmount`, `refundAmount`, `expectedAmount`, `declaredAmount`, `differenceAmount`.
42. Créer des flux en devise A et B puis les déclarer sur des lignes séparées. Vérifier qu’aucun total implicite A+B ou conversion FX n’est affiché/enregistré.
43. Saisir un montant déclaré différent de l’attendu sans motif : la clôture doit être refusée.
44. Ajouter un motif d’écart puis soumettre : la clôture devient `SUBMITTED` et conserve le motif.
45. Rejouer la même soumission/idempotency : aucune deuxième clôture active n’est créée.
46. Tenter de créer une deuxième clôture `SUBMITTED/VALIDATED` pour le même site et la même journée avec une autre clé : le serveur/DB doit refuser.

## 11 — Maker/checker de clôture

47. Avec le soumissionnaire, tenter de valider sa propre clôture : refus obligatoire.
48. Avec un autre utilisateur possédant `GAMING_DAILY_CLOSE.manage`, valider la clôture. Vérifier `VALIDATED`, acteur et date de validation.
49. Sur une autre journée, tester le rejet avec motif obligatoire et vérifier `REJECTED` + motif.

## 12 — Permissions, tenant isolation et audit

50. Avec un utilisateur sans droit Gaming Checkout, vérifier que le module/API est inaccessible.
51. Avec un utilisateur Gaming autorisé mais sans permission Finance requise, tenter une action Finance : elle doit être refusée, sans contournement par le module Gaming.
52. Si possible dans l’environnement de test, tenter d’utiliser un `financialAccountId`, `warehouseId`, `catalogItemId`, `checkoutId` ou autre UUID appartenant à une autre entreprise. Il doit être traité comme inaccessible/invalide.
53. Vérifier les `AuditLog`/`ApiLog` principaux : création checkout, approbation facture, création/approbation paiement, remboursement, soumission et décision clôture.

## 13 — Régression finale

54. Vérifier que Stations, Sessions, Réservations et Pricing fonctionnent encore, notamment : >5 postes, chronométrage serveur, réservation → session tarifée et snapshot de prix.
55. Vérifier qu’aucun modèle/écran de caisse, facture, paiement, devise, client ou stock parallèle spécifique Gaming n’a été introduit.
56. Vérifier qu’aucun Preview Vercel n’a été utilisé pour les commits de la PR ; seule la chaîne CI de la PR et, après fusion, le déploiement Production depuis `main` sont autorisés par la politique actuelle.

## Résultat attendu

Toutes les étapes applicables passent. Pour les scénarios nécessitant une configuration absente de l’environnement (par exemple deuxième devise ou article lotifié), documenter explicitement la précondition manquante au lieu de considérer le contrôle comme réussi.

Après validation complète, répondre dans la conversation :

`E2E #644 bon`
