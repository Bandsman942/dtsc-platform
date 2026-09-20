# OWNER_E2E — Hotfix #669 UI/i18n & Code Convergence ERP

Statut initial : **NOT_EXECUTED**.

Tester uniquement le SHA final de la PR après réussite des gates CI.

1. **Tiers, Catalogue, CRM et Contrats** : ouvrir chaque module depuis le hub ERP, créer ou ouvrir une fiche existante, ouvrir un formulaire puis revenir à la liste. Vérifier qu’aucune régression de navigation, données ou actions n’est visible après la convergence des anciens workspaces v2.
2. **Actifs & maintenance** : ouvrir un actif, un formulaire d’affectation/maintenance ou incident, puis revenir à la collection. Vérifier listes, détail, actions et feedback.
3. **IA Entreprise** : ouvrir l’assistant depuis son module, charger une conversation et vérifier historique, sources/outils autorisés et sélection de modèle. Aucun changement de permission ne doit apparaître.
4. **Comptabilité** : ouvrir Mise en service, Journal, revue et détail d’écriture. Vérifier les anciens deep links Comptabilité encore supportés, le journal compact et les formulaires plein écran.
5. **Finance opérationnelle** : ouvrir Ventes & créances/Achats & dettes, Paiements, Trésorerie, Banque/Rapprochement. Vérifier qu’un formulaire et un détail restent fonctionnels dans chaque famille.
6. **Finance aval** : ouvrir Fiscalité, Clôture, États financiers et Immobilisations et vérifier qu’ils passent par la même expérience canonique sans écran vide ni variante ancienne visible.
7. **Administration entreprise** : ouvrir Modules, Départements, Branding, Sécurité, Audit et Actions en attente. Vérifier qu’aucun panneau historique ou doublon n’apparaît.
8. **FR/EN** : sur le workspace commun et Finance, basculer FR puis EN. Vérifier notamment les indicateurs, actions, dates, Comptabilité périodique, Opérations de clôture et Cessions d’actifs. Aucun mélange FR/EN ne doit être visible dans les surfaces couvertes.
9. **Libellés métier** : vérifier qu’aucun statut ou enum brut tel que `PENDING_APPROVAL`, `IN_PROGRESS` ou une valeur avec underscore n’est rendu comme libellé principal dans les parcours couverts.
10. **Responsive** : vérifier au minimum 320, 360, 375, 390, 414, 768 et 1024 px sur au moins Tiers/CRM, Comptabilité et Administration. Aucun scroll horizontal global, bouton coupé ou champ inaccessible.
11. **Clavier et safe areas** : sur mobile, ouvrir un formulaire long, afficher le clavier, faire défiler jusqu’aux actions puis fermer le clavier. Le contenu et les actions doivent rester accessibles.
12. **Clair/sombre et clavier desktop** : vérifier focus visible, navigation clavier des actions/tabs, contraste et absence de rupture de surface dans les deux thèmes.
13. **Permissions** : avec un utilisateur en lecture seule, vérifier que la convergence de fichier n’a pas rendu une action d’écriture disponible.
14. **Tenant isolation** : tenter un deep link ou identifiant d’une autre entreprise sur un module couvert. Le comportement doit rester refusé sans fuite d’information.

Après validation, confirmer explicitement : `E2E #669 bon`, pour le SHA final testé.
