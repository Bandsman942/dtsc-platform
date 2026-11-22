# OWNER_E2E final — Ticket 2 KIN FOREX — #1218

Statut : **À EXÉCUTER / NON VALIDÉ**. L'existence de la checklist ne vaut pas résultat de test.

## Données de test
- Entreprise KIN FOREX, deux boutiques A et B, deux magasins/dépôts actifs avec stocks indépendants.
- Identité légale factice : RCCM CD/KIN/RCCM/26-B-TEST ; ID.NAT 01-TEST-26 ; téléphone fictif « 081 TEST 001 » (ne pas employer de vrais numéros).
- Article A : 2 × 20 000 CDF ; article B : 3 × 15 000 CDF. Taxes/remises 0 pour cette simulation. Total dû : **85 000 CDF**.
- Espèces reçues : **100 000 CDF** ; monnaie attendue : **15 000 CDF**.
- Stock article A initial 20, entrée 10, vente 7, autre sortie 2 : stock final 21.
- Stock article B initial 15, entrée 5, vente 8, aucune autre sortie : stock final 12.

## Scénarios bloquants
1. L'administrateur ouvre paramètres RETAIL : config entreprise, identifiants juridiques, champs vides et overrides A/B ; acteur non administrateur 403.
2. Modifier RCCM/téléphone demande step-up, respecte la révision ; revision obsolète => 409 ; site B ne peut pas modifier RCCM.
3. Préparer et imprimer une facture de A en A4 et 80 mm : nom de boutique, téléphone A, RCCM, ID.NAT, identité légale. Modifier ensuite l'identité et réimprimer : l'ancienne facture garde ses valeurs; nouvelle facture prend les nouvelles.
4. Panier multi-lignes A + B ; modifier les quantités plusieurs fois et attendre l'aperçu serveur : le montant dû devient **85 000 CDF**, et non le premier article.
5. Avant intervention sur espèces, le champ reçu suit le total (mode TOTAL) ; une fois modifié à 100 000, changer le panier : le montant reçu reste 100 000, la monnaie est recalculée ; « Reprendre le montant exact » fonctionne.
6. Mode EMPTY : aucun montant reçu pré-rempli, montant dû néanmoins correct. Refus si espèces reçues < montant dû.
7. Répéter le clic et rejouer l'idempotencyKey : facture, paiement, caisse, stock, comptabilité uniques et équilibrés ; currency mismatch et prix périmé bloqués côté backend.
8. Créer mouvements réels dans la boutique A avec date commerciale identifiée : stock initial, entrées, sorties, ventes; rapport A affiche 21 et 12 ; ni factures non délivrées ni services ne sortent du stock.
9. Réserver un article sans le vendre : stock physique stable, disponible réduit **uniquement pour date actuelle**. Jour historique : aucune réservation historique artificielle.
10. Transférer des unités de A vers B : sortie A et entrée B, sans double comptage; chacun de ses rapports reste local.
11. Rapport boutique A : changer date, paginer, rechercher stocks, exporter CSV complet et Excel, impression A4/Enregistrer PDF. Les quantités respectent le fuseau (tester à minuit).
12. Contrôler les bornes, 5 000 articles export, HTML escaping et injection de formule CSV. Les non-autorisés et opérateurs de B ne doivent pas accéder au rapport A même en modifiant siteId.
13. Vérifier dark/light, FR/EN, mobile 320, 360, 375, 390, 414, 768 et 1024 ; toasts, accessibilité, table scrollable, bouton retour.
14. Régression ancien mode facturation avec caissier, retours/avoirs, Finance, inventaire, fiscalité, multi-boutiques, multi-tenant et SHOP spécifiques.
15. Contrôler le registre de factures, les logs et le snapshot imprimé ; archivage PDF métier officiel distinct non livré (voir limites).

## Preuves à recueillir
- SHA exact du commit et de la CI, type-check/lint/build/QA ciblées/QA de régression.
- Captures écran desktop/mobile, factures A4/80mm, XLSX/CSV et PDF obtenu par l'impression navigateur.
- Requêtes API autorisées/interdites et preuves d'isolation organisation/site.
- Preuve chiffrée Finance + Stock (aucun double mouvement).
- Commentaire propriétaire explicite : « E2E final #1218 BON » ou « KO » avec scénario.

**Pas de fusion tant que l'E2E final n'est pas validé par le propriétaire.**
