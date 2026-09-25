# OWNER_E2E — Hotfix #670 ERP Deletion & Certification

Statut initial : **NOT_EXECUTED**.

Tester uniquement le SHA final de la PR après réussite de toutes les gates CI.

1. **Navigation ERP commune** : depuis le hub entreprise, ouvrir Tiers, Catalogue, CRM, Contrats, Actifs & maintenance et IA Entreprise. Vérifier qu’aucun écran n’est vide et qu’aucune route ne dépend d’un ancien nom `v2/v3/hotfix/legacy`.
2. **Tiers / CRM / Contrats** : ouvrir une fiche existante, un formulaire et une action métier dans chacun de ces modules, puis revenir à la liste.
3. **Catalogue / Actifs** : ouvrir création/édition Catalogue et une fiche Actif avec une action maintenance/affectation.
4. **IA Entreprise** : ouvrir une conversation existante, vérifier modèles, historique, sources/outils autorisés et permissions de l’utilisateur.
5. **Finance opérationnelle** : ouvrir Ventes & créances, Achats & dettes, Paiements, Trésorerie, Caisse, Banque et Rapprochement ; ouvrir au moins un détail et un formulaire/action disponible.
6. **Comptabilité et Finance aval** : vérifier Comptabilité, Fiscalité, Clôture, États financiers et Immobilisations, y compris les deep links déjà utilisés en production.
7. **Administration entreprise** : vérifier Vue d’ensemble, Départements, Modules, Branding/Paramètres, Sécurité, Audit et Actions en cours.
8. **Secteurs** : ouvrir au minimum un parcours Shop/Retail, Health, Pharmacy et un autre secteur actif de l’entreprise de test. Vérifier qu’aucune suppression de bridge commun n’a cassé leur navigation ou leurs références ERP.
9. **FR/EN** : basculer la langue sur les parcours Core, Finance et Administration. Aucun ancien jargon technique, enum brut ou mélange inattendu de langue.
10. **Mobile/responsive** : vérifier 320, 360, 375, 390, 414, 768 et 1024 px sur Tiers/CRM, Finance et Administration. Aucun scroll horizontal global ni action inaccessible.
11. **Clavier mobile / safe areas** : ouvrir un formulaire long, afficher le clavier, défiler jusqu’aux actions, fermer le clavier et confirmer que tout reste accessible.
12. **Permissions** : avec un utilisateur lecture seule, vérifier qu’aucune action d’écriture n’est apparue après suppression des bridges.
13. **Entitlements** : désactiver ou utiliser un plan n’incluant pas un module de test ; l’accès doit rester bloqué par le resolver canonique, sans fallback via un ancien chemin.
14. **Tenant isolation** : tenter un deep link d’un autre tenant sur un objet couvert ; aucune donnée ne doit être révélée.
15. **Absence de variante historique** : sur les parcours ci-dessus, aucun libellé, écran ou comportement ne doit révéler une deuxième variante de workspace.

Après validation, confirmer explicitement : `E2E #670 bon`, pour le SHA final testé.
