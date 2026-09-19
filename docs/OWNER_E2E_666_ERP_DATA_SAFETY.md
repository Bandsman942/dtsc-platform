# OWNER_E2E — Hotfix #666 ERP Data Safety

Statut initial : **NOT_EXECUTED**.

Valider sur le SHA final de la PR, avec une entreprise de test autorisée.

1. Dans Administration/Finance, vérifier une entreprise avec devise fonctionnelle CDF et fuseau `Africa/Kinshasa`.
2. Ouvrir Ventes & créances et créer un brouillon de facture. Vérifier que la date proposée correspond au jour métier de l’entreprise et que la devise proposée est CDF, jamais USD par défaut.
3. Ouvrir Paiements, préparer un paiement et vérifier les mêmes propriétés. Changer de type de paiement puis revenir : la devise ne doit pas revenir arbitrairement à USD.
4. Ouvrir Achats et créer un achat. Vérifier que la devise doit être explicitement choisie lorsqu’aucune valeur existante n’est fournie.
5. Ouvrir Paie/RH et confirmer qu’une entreprise sans référentiel de devises n’affiche pas artificiellement USD comme unique option.
6. Ouvrir Projets et Manufacturing. Vérifier que les créations utilisent la devise fonctionnelle configurée ou restent bloquées lorsque la configuration obligatoire manque.
7. Créer une opération portant une référence datée (achat, budget/dépense, production ou rapport selon les modules disponibles) autour du changement de jour si possible. Vérifier que la date encodée suit le fuseau de l’entreprise.
8. Tester une entreprise de recette dont la devise fonctionnelle est volontairement absente : une opération exigeant cette devise doit échouer avec un message métier de configuration, sans créer de donnée.
9. Vérifier mobile 320/360/390/414 px sur au moins un formulaire Finance modifié : aucun débordement horizontal global, champs accessibles avec clavier ouvert.
10. Vérifier qu’aucune donnée existante n’a été réécrite par le hotfix.

Après validation, commenter la PR avec `OWNER_E2E #666 bon` en citant le SHA final testé.
