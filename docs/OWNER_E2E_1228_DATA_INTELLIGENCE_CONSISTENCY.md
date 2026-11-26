# Recette propriétaire #1228

La recette concerne la PR #1229 et la version candidate 1.24.5. Exécuter les scénarios sur le commit proposé pour l’E2E, dans une installation isolée. Le cahier des charges et les preuves automatiques restent dans [le dossier du hotfix](HOTFIX_1228_DATA_INTELLIGENCE_CONSISTENCY.md).

## Comptes et données

| Élément | Jeu de recette |
|---|---|
| Organisation A | Une entreprise Retail avec deux boutiques, un entrepôt par boutique, des comptes de trésorerie en CDF et USD et un exercice ouvert |
| Organisation B | Une seconde entreprise avec un article et une référence de vente identiques à ceux de l’organisation A |
| Acteurs | Administrateur d’A, opérateur affecté à la première boutique, validateur distinct, responsable Finance, acteur d’une autre organisation |
| Articles | Pièce à zéro décimale, litres à trois décimales et unité de test à six décimales. Un article de la première boutique possède deux lots de dates distinctes |
| Volumes | Au moins 51 fiches dans le résultat filtré. Des fiches supplémentaires hors période et hors boutique rendent visibles les effets des filtres |

## Quantités et opérations

1. Ouvrir Stock & logistique, Valorisation et le rapport journalier de fermeture pour les trois articles. Vérifier les symboles et la précision de l’unité sur les listes, les détails et les exports. Une quantité historique plus précise que l’unité doit rester lisible avec son signalement.
2. Ouvrir un transfert, un comptage et un ajustement. Sélectionner successivement la pièce et l’unité à six décimales. Vérifier que la pièce refuse 0,5, que l’unité de test accepte 0,000001 et refuse 0,0000001, et que le comptage accepte zéro. Vérifier le refus serveur avec un utilisateur ayant le droit de soumettre, puis avec un utilisateur non habilité.
3. Créer un achat de 0,000007 dans l’unité de test. Après approbation et commande, réceptionner 0,000003 puis 0,000004. Contrôler le reliquat 0,000004 puis zéro et vérifier 0,000007 dans l’aperçu A4. Sur un autre achat en cours, modifier l’unité catalogue et vérifier que le document signale le conflit avant tout mouvement de stock.
4. Tester l’achat, la vente et le stockage avec deux unités configurées lorsque le parcours de conversion est disponible. Contrôler le facteur réel, l’unité cible et la trace du facteur employé. Un changement de configuration ultérieur doit conserver l’historique du document.
5. Sur un article de recette avec un carton à trois décimales et une unité de stock entière, configurer un carton pour huit unités. Dans Stock & logistique, soumettre `0,125` carton et vérifier que le validateur voit les deux quantités. Après l’expédition d’une unité, créer une deuxième version à seize unités par carton. La réception doit enregistrer une unité et conserver la première version. Le rejeu ne crée aucun second mouvement. Sur un autre transfert en transit, modifier le code de l’unité de stock dans la recette et vérifier le refus de la réception tant que cette incohérence existe.
5. Réserver et livrer une partie d’un lot, transférer un autre lot et effectuer un retour. Contrôler séparément stock physique, réservations, stock disponible et quantités valorisées. Vérifier que le transfert conserve la quantité et la valeur entre les deux entrepôts.

## Filtres, exports et droits

1. Filtrer par boutique, période exacte puis intervalle, statut et texte métier. Relever le nombre de résultats, le sous-total filtré et le sous-total de page. Changer de page, y compris vers un résultat vide. Le sous-total filtré doit rester identique et le général doit rester borné aux droits de l’acteur.
2. Reprendre le même jeu de filtres sur Stock, Ventes, Achats, Factures, Créances, Dettes, Paiements, Trésorerie, Caisse et Comptabilité. Vérifier que les totaux par devise sont distincts et que les entrées et sorties de trésorerie restent attribuées à leurs comptes. Vérifier les agrégats sectoriels applicables dans le périmètre de l’organisation.
3. Exporter les mêmes résultats en CSV, XLSX et PDF lorsqu’ils sont proposés sur le registre. Rapprocher le nombre de lignes, les filtres, les sous-totaux, les libellés et les devises. Les quantités dépassant la précision numérique d’Excel doivent rester exactes dans les cellules.
4. Répéter avec l’opérateur d’une seule boutique, le validateur et l’acteur d’une autre organisation. Tenter l’ouverture depuis l’interface et la lecture directe des API et exports. Les listes, quantités, projections historiques et totaux doivent respecter le même périmètre.

## Comptabilité

1. Créer une sortie de stock valorisée puis ouvrir le journal et le grand livre. Vérifier la référence, la désignation enregistrée, le coût, les comptes, l’équilibre et l’idempotence. Après renommage de l’article, vérifier que la désignation du posting d’origine reste lisible.
2. Ouvrir une écriture historique et vérifier la distinction entre désignation enregistrée, désignation actuelle retrouvée et référence introuvable. Contrôler aussi la recherche et l’export.
3. Reprendre la pièce ST‑MWW9CKWQ‑A56124 avec la méthode configurée, la catégorie de l’article, le mouvement d’origine et le référentiel effectif. Vérifier la politique versionnée appliquée dans une organisation de recette depuis réception et facture fournisseur jusqu’à sortie, retour et états. Comparer les références historiques avant et après le changement de version.
4. Dans Comptabilité → Configurer → Mise en service, sélectionner le plan SYSCOHADA 0.1.0 et ouvrir **Comparer la politique marchandises**. Vérifier le compte proposé, le signalement si son code existe et le total des écritures comptabilisées ou contrepassées. À partir du grand livre et de la balance, contrôler une ligne portant six décimales et la rapprocher de l’export.

## Présentation et validation

Tester les largeurs 320, 360, 375, 390, 414, 768, 1024 et 1440 px, les interfaces FR/EN et les thèmes clair/sombre. Vérifier le clavier, le focus visible, les messages et la lecture des nombres longs. Sur mobile, le rail d’indicateurs doit atteindre le dernier indicateur avec la flèche droite ou Fin et revenir au premier avec la flèche gauche ou Début.

Consigner le commit testé, l’organisation et le rôle utilisés, ainsi que les résultats. Confirmer **E2E FINAL #1229 BON** après réussite de la recette sur le commit proposé.

### Mobile Money — registre des dépôts et retraits

Sur 58 opérations admissibles, deux devises et deux boutiques, filtrer par type, statut, dates et référence. Comparer les cinq montants exacts par devise/type/statut et les trois périmètres de total ; changer de page et exporter CSV, XLSX et PDF. Vérifier le téléphone masqué, les montants négatifs, la séparation des conversions FX (aperçu distinct) et la lecture interdite pour une autre organisation ou une boutique non autorisée. Le registre FX complet et le solde à date ne sont pas validés par ce scénario.

### Mobile Money — conversions de devises

Avec 57 conversions autorisées, deux paires inverses et une conversion contrepassée, comparer les trois périmètres des montants source et cible sur plusieurs pages et dans les trois exports. Le taux historique, son jour, le statut métier et l’état du posting d’origine doivent rester distincts. Vérifier qu’un opérateur d’une seule boutique ne reçoit pas une conversion dont l’un des wallets est hors boutique ou partagé sans affectation. Tester la reprise comptable idempotente d’une opération confirmée en attente ; aucun nouveau mouvement wallet ne doit être créé. La validation des soldes à date et des droits de toutes les mutations reste indépendante.
