# OWNER_E2E — Hotfix #667 Canonical ERP Foundations

Statut initial : **NOT_EXECUTED**.

Tester le SHA final de la branche/PR après validation automatique.

1. Projets : soumettre un formulaire incomplet puis une création valide. L’échec doit afficher une cause exploitable, conserver les saisies et ne jamais afficher `Invalid payload`.
2. Actifs : provoquer une référence invalide ou un champ manquant ; vérifier le feedback global et la possibilité de corriger sans fermer le formulaire.
3. Contrats/CRM : provoquer une validation puis une transition métier invalide ; vérifier que le message reste métier et que le code technique n’est pas le libellé principal.
4. Achats/Fournisseurs : tester création, modification et action avec une donnée invalide puis valide ; aucune exception brute ne doit apparaître.
5. Finance : tester Comptabilité, Trésorerie, taux de change et clôture. Les erreurs historiques de `requestJson` doivent continuer à être traduites correctement.
6. Documents : tester partage/révocation avec une personne invalide ou hors contexte ; aucune fuite de tenant et message stable.
7. Retail : tester au moins une promotion ou action fidélité invalide et une action valide.
8. Pharmacie/Santé : tester une mutation invalide puis valide sur un module disponible dans l’entreprise de recette.
9. IA Entreprise : provoquer une action de projet/paramètre invalide ; le client doit recevoir un message sûr sans message technique du fournisseur.
10. Vérifier FR et EN sur au moins un flux commun et un flux Finance.
11. Vérifier mobile 320/360/390/414 px sur au moins deux formulaires concernés : pas de débordement horizontal global, données conservées en cas d’erreur.
12. Vérifier qu’un identifiant d’un autre tenant ne permet pas de contourner les contrôles existants.

Après validation, commenter la PR avec `OWNER_E2E #667 bon` et le SHA final testé.
