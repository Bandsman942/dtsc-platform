# #1228 — Audit de l’imputation des stocks

Statut : anomalie de mapping confirmée dans le code ; correction comptable et configuration de l’écriture utilisateur non certifiées. Aucun journal historique modifié.

## Source vérifiée

[Guide d’application du SYSCOHADA, hébergé sur ohada.com](https://www.ohada.com/uploads/actualite/3504/Guide-d-application-du-SYSCOHADA.pdf), téléchargé le 25 novembre 2026. SHA-256 du PDF : `25c24c8b00be0eb53d7bdd7dce53c18ef9d46adbe2dbf16619996c0a75d4df0b`. Pages imprimées/PDF 23–24 et 76–77, extraction locale avec Poppler 26.09.0. Le document complet n’est pas redistribué dans le dépôt.

Le guide distingue achats, stocks et ventes : les marchandises relèvent respectivement de 601, 31 et 701. Il présente 6031 pour leurs variations de stock. En inventaire permanent, les mouvements de stock restent séparés des achats/ventes ; les entrées et sorties utilisent les variations en contrepartie de la classe 3. Les produits finis ont une autre famille de variation (736/36). Il faut donc qualifier l’article et l’événement avant de choisir un compte. Ces conclusions sont limitées au schéma décrit par ce guide ; elles ne prouvent pas la configuration d’une entreprise particulière.

## Méthodes effectivement présentes dans le moteur

- Valorisation : `inventory-accounting-service.ts` exige `EnterpriseFinanceConfiguration.inventoryValuationMethod = WEIGHTED_AVERAGE` à la réception et à la sortie. Les transferts vérifient également la méthode et la devise fonctionnelle. La configuration autorise syntaxiquement FIFO, mais ce moteur de valorisation la refuse : ne pas présenter FIFO comme effectivement pris en charge.
- Quantités résiduelles des couches : répartition proportionnelle entière des micro-unités, avec restes déterministes. C’est indépendant du choix physique des lots.
- Sortie physique : FEFO pour les articles tracés, avec exclusion des lots périmés, bloqués, archivés et des quantités promises. FEFO n’est pas la méthode de valorisation comptable.
- Organisation de la comptabilité : les mouvements valorisés sont comptabilisés au fil de l’eau ; ce comportement correspond à un inventaire permanent. La méthode de l’entreprise de la capture ne peut pas être confirmée sans sa configuration et les pièces de l’écriture.

## Comparaison avec les chemins réels

| Événement | Comportement du code inspecté | Conclusion et contrôle requis |
|---|---|---|
| Réception valorisée | `INVENTORY` au débit / `GOODS_RECEIVED_CLEARING` au crédit ; baseline 311/471 | Le clearing technique doit être rapproché avec la facture et le schéma de variation ; une correction isolée de la sortie est insuffisante. |
| Facture fournisseur liée à réception | Débit du clearing / crédit fournisseur, TVA selon preuve historique | Qualifier le passage par les comptes d’achat et de variation dans une politique versionnée coordonnée avec la réception. |
| Vente / sortie ordinaire | Débit `COST_OF_SALES`, crédit `INVENTORY` ; baseline 601/311 | Pour une marchandise en inventaire permanent, ce mapping de sortie confond achat et variation. La désignation améliorée ne corrige pas cette anomalie. |
| Retour client | Retour physique et annulation du coût via les événements canoniques | Préserver la règle et les comptes historiques de la vente d’origine ; tester avant/après changement de version. |
| Retour fournisseur | Débit clearing / crédit stock ; avoir lié séparé, historique HT/TVA/TTC vérifié | Correction à coordonner avec réception, facture et avoir ; conserver les preuves de coût et les réserves de dette. |
| Transfert | Débit/crédit stock, dimensions de site, preuve de conservation de quantité et valeur | Pas d’achat, vente ni coût des ventes ajouté au transfert. |
| Perte / ajustement / récupération | Perte dédiée vers charge ; récupération plafonnée, approuvée et liée à la sortie initiale | Qualifier motif, nature d’article et traitement de variation ; ne pas appliquer universellement 6031 à toutes les pertes ou productions. |

Sources de code : `domain-posting-builders.ts`, `core-posting-builders.ts`, `inventory-transfer-posting.ts`, `sector-adapters/retail.ts`, `sector-adapters/pharmacy.ts`, `semantic-account-registry.ts` et `templates/syscohada/syscohada.bootstrap.v0.1.0.json`.

## Correction à préparer, sans activation silencieuse

La baseline `OHADA_SYSCOHADA@0.1.0` est publiée et immuable par décision propriétaire. Elle n’est pas réécrite par #1228. Une nouvelle politique doit qualifier les classes d’articles, dériver un dataset fingerprinté de sources vérifiées, passer le builder canonique, le diff et la prévisualisation comptable (distincte d’un Preview Vercel), puis une migration contrôlée choisie par l’entreprise. Réception, facture, sortie, retours, variation et états doivent être testés ensemble avec versions de posting/idempotence conservées. Les tenants déjà actifs ne changent pas automatiquement de référentiel.

Pour `ST-MWW9CKWQ-A56124`, aucune devise, désignation historique, catégorie de marchandise, quantité, configuration effective ni source originale ne sont inventées depuis la capture. Le rapprochement de cette pièce reste à effectuer en lecture autorisée. Si l’imputation historique est erronée, la correction passe par contrepassation liée et nouvelle comptabilisation dans une période autorisée, jamais par mise à jour d’une écriture POSTED.

La clôture du lot comptable reste bloquée sur la politique versionnée coordonnée, les tests d’intégration correspondants et la preuve de configuration/source de la pièce signalée.
