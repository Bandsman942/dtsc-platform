# RETAIL SHOP — Pilotage financier de direction et gestion de stocks par l'ERP

Issue [#1105](https://github.com/Bandsman942/dtsc-platform/issues/1105) · Branche `feat/1105-retail-executive-dashboard` · Candidat **v1.9.0** · 10 novembre 2026 · **NON LIVRÉ**

## Finalité et frontière des sources

Le tableau de bord « Pilotage des boutiques » est destiné au propriétaire et à l'administrateur de l'entreprise RETAIL. Il consolide les opérations autorisées des modules souscrits dans l'ERP, puis les détaille boutique par boutique. La source métier canonique reste dans chaque module ; le dashboard ne crée ni vente, ni créance, ni entrée de stock, ni compte financier parallèle. Les montants sont calculés avec `Prisma.Decimal`, regroupés **par devise native** (CDF, USD, etc.), sans conversion au taux du jour ni somme interdevises. Le fuseau de l'entreprise détermine les jours civils des filtres et événements.

| Famille | Source et date de rattachement | Interprétation obligatoire |
| --- | --- | --- |
| POS historique | `EnterpriseRetailSale` COMPLETED par `soldAt`, tenders associés | Historique, **ne pas ajouter** aux factures Finance |
| Factures clients | `EnterpriseSalesInvoice` liées à `EnterpriseRetailInvoiceCheckout` par émission | Total net des avoirs ; paiements et soldes à date présentés séparément |
| Encaissements Finance | `EnterprisePaymentAllocation` CONFIRMED et paiement CONFIRMED/RECONCILED par date de paiement | Seuls les encaissements affectés aux factures RETAIL pendant la période sont inclus |
| Créances ouvertes et échues | Soldes des factures Retail et échéance, toutes dates d'émission | **Position actuelle**, pas un flux de la période |
| Dépenses | `EnterpriseExpense` APPROVED par date de dépense | Approbation ≠ paiement effectif |
| Comptabilité | Lignes `EnterpriseJournalLine` postées, comptes de produits/charges, période comptable | Marge/résultat **provisoires et non certifiés** ; affectation manquante isolée |
| Mobile Money | Transactions CONFIRMED, compte d'espèces rattaché à une boutique | Principal dépôt/retrait ≠ CA ; commission opérateur et frais client distincts |
| Télécom | Recharges SUCCESS, compte de règlement rattaché à une boutique | Vente, coût opérateur, marge **opérationnelle**, non résultat comptable |
| Trésorerie | Comptes financiers actifs par boutique/devise | Positions opérationnelle/rapprochée/disponible **à date** |
| Stock | Balances, seuils sur article, lots à péremption par dépôt | Quantités sans valorisation financière inventée ; alertes sans reconstitution de ventes |

### Consolidation sans perdre les opérations non affectées

Le mode **Entreprise** additionne uniquement des montants de *même devise et même nature* de toutes les boutiques actives, puis inclut séparément les sources à boutique absente ainsi que les écritures historiques de boutiques fermées (pour le résultat posté). Le mode **Boutique** exclut strictement toutes ces opérations non attribuées et les autres boutiques. Les tableaux affichent cette réserve de périmètre, sans répartir arbitrairement une dépense ou une recette sur les magasins.

Chaque source facultative est lue uniquement si son module est réellement autorisé par l'abonnement et le RBAC (`MOBILE_MONEY_AGENCY`, `TELCO_TOPUPS`, `FINANCE_TREASURY`, `INVENTORY_LOGISTICS`, `FINANCE_ACCOUNTING`, `REPORTS`). Le POS seul ne donne pas la permission de lire la trésorerie ou les données d'agence Mobile Money.

## UI Design 2.0, alertes et personnalisation

- Vues **consolidée**, **par boutique**, **par devise** ; dates de début/fin, période courte, rafraîchissement. Les graphiques comparatifs filtrent une boutique par clic et les histogrammes journaliers détaillent le jour sélectionné, avec légendes et couleurs de signalement.
- 22 métriques financières : ventes/encaissements historiques POS, factures émises, affectations à date, encaissements Finance, créances ouvertes/échues, dépenses approuvées, chiffre d'affaires/coût des ventes/marge brute/résultat comptables postés, dépôts/retraits/commissions/frais Mobile Money, ventes/coûts/marges Télécom, soldes de trésorerie opérationnelle/rapprochée/disponible.
- Alerte orange pour créance dépassant le seuil administrateur ; rouge pour lot expiré ou perte ; vert pour indicateur favorable, selon la valeur ; texte explicatif sous les chiffres. L'absence de source n'est jamais interprétée comme un revenu nul certifié.
- Les préférences administrateur (`dashboard-preferences`) règlent la période initiale, le KPI de graphique, le seuil d'encours, le nombre de jours avant péremption et l'affichage du POS historique. `settingsJson` est fusionné, non remplacé ; contrôle de révision + journal d'audit.

## Rapports officiels de l'entreprise

Le dashboard et le module `REPORTS` utilisent `buildRetailExecutiveExport` : colonnes des 22 indicateurs, période, boutique, devises natives, méthodologie, avertissement comptable et signalement des affectations manquantes, exports CSV, XLSX et PDF avec identité entreprise. « Enregistrer dans Rapports » crée côté serveur `EnterpriseReport` de type `RETAIL_EXECUTIVE`, snapshot `retail-executive/v1` à partir des données **recalculées et autorisées** (jamais des montants du navigateur). Il peut ensuite être ouvert, consulté et réexporté dans le registre transversal ; l'accès à ce registre est contrôlé par le droit `REPORTS`.

Ce snapshot est une photographie à sa génération, distincte du dashboard rafraîchissable. Il ne constitue ni un bilan légal, ni un compte de résultat audité, ni une valorisation certifiée de l'inventaire.

## Inventaire : séparation catalogue / stock / lots

| Écran | Données autorisées | Ce qui reste interdit |
| --- | --- | --- |
| Catalogue article/service | Désignation, identité, SKU, nature et prix, caractère stockable | Définir un lot, une date de péremption ou créer une quantité pendant l'édition du catalogue |
| Inventaire · Règles de stock | Seuil bas, quantité cible, suivi par lot, suivi d'expiration | Désactiver le suivi en présence de lots enregistrés |
| Inventaire · Lots par dépôt | Numéro unique article/dépôt, fabrication, péremption, statut disponible/bloqué/quarantaine, observations | Écrire directement une quantité dans un lot ; changer son identité après création |
| Inventaire · Opérations | Entrées/réceptions/ajustements validés, réservations, sorties, transferts, inventaires | Mouvement silencieux depuis un formulaire catalogue ou de lot |

Les APIs utilisent le tenant, les droits `INVENTORY_LOGISTICS`, la portée de dépôt RETAIL, le contrôle même-origine, la révision optimiste et l'audit. Les lots historiques ne sont pas modifiés et aucune migration/destruction n'est nécessaire. Les dates de péremption et l'obligation de lot s'appliquent aux lots nouvellement enregistrés ; les mécanismes existants des mouvements, FIFO/FEFO et de quarantaine restent à tester avec les cas métier avant qualification.

## Régressions et recette E2E du propriétaire

1. Comme administrateur de **SHOP BCN MULTI TEST**, ouvrir POS → **Pilotage des boutiques**. Vérifier les deux boutiques Gombe/Limete, la vue entreprise, les devises natives distinctes et un filtre date exacte/plage sur le fuseau Kinshasa.
2. Effectuer une facture Finance dans Gombe, la faire valider/émettre, puis encaisser avec confirmation et affectation. Les encaissements du jour, factures émises, règlement à date, créances et trésorerie reflètent chacun **leur source**, sans double compter une vente POS historique.
3. Sélectionner Gombe dans la comparaison graphique, inspecter l'évolution par jour, revenir à « toutes ». Les montants Limete ou sans site n'apparaissent pas dans le détail Gombe ; le consolidé les réintègre dans leur seule devise.
4. Avec le module Mobile Money souscrit, exécuter un dépôt puis un retrait et contrôler le **principal exclu du CA**, commissions et frais séparés ; avec Télécom, contrôler vente, coût opérateur et marge. Désactiver l'accès à ces modules pour un acteur : aucune valeur protégée ne doit fuir.
5. Vérifier les indicateurs de dépenses approuvées, créances échues, écritures postées, les alertes orange/rouge et la note **résultat provisoire non certifié**. Ne jamais interpréter une vente sans coût valorisé comme une marge certifiée.
6. Exporter les mêmes filtres vers CSV, Excel et PDF : enseigne, devise, titres, colonnes, nombres et réserve de certification cohérents. Enregistrer le rapport dans `REPORTS`, le rouvrir et le réexporter. Sans droit REPORTS, la création doit être refusée.
7. Ouvrir les **paramètres** du dashboard : changer période et seuil de créance/péremption ; enregistrer, rafraîchir puis rouvrir pour vérifier la persistance. Un collaborateur non administrateur ne doit pas accéder aux paramètres.
8. Modifier un article stockable dans le **Catalogue** : aucun champ lot/péremption/seuil/quantité de réapprovisionnement. Accéder à **Inventaire → Règles de stock, lots et péremptions** ; chercher l'article (y compris au-delà de 50 articles), configurer seuil, suivi lot et péremption.
9. Enregistrer un lot pour le dépôt Gombe et sa péremption. Vérifier qu'il affiche **zéro quantité** avant une réception réelle validée, puis que les balances évoluent uniquement avec le mouvement. Empêcher doublon numéro article/dépôt, lot sans suivi, dates incohérentes, désactivation du suivi avec lot existant et accès depuis une boutique non autorisée.
10. Valider en navigateur desktop et mobile avec langues FR/EN, mode clair/sombre, filtres et actions au clavier ; vérifier qu'aucun écran ne coupe le tableau ou les graphiques.

### QA technique et publication

- `node scripts/qa-retail-executive-1105.mjs` vérifie la séparation des devises, les additions Decimal, les opérations sans boutique, les 22 KPIs, les exports, les frontières RBAC/stock ; maintenir les QA RETAIL #1042, #1083 et #1101.
- TypeScript, lint, build et workflows GitHub obligatoires sur **la branche de PR**, sans aucun Preview Vercel. Aucun secret nouveau, aucune migration Prisma, aucun déploiement direct Production.
- Le propriétaire répond **`E2E final #<PR> BON`** après recette ; seulement alors, revue + fusion de la PR dans `main`, puis suivi du déploiement automatique depuis `main`.

### Risques et rollback

Les agrégats SQL peuvent augmenter la charge sur de longues périodes et dépendent des affectations historiques de boutiques ; la requête borne la période à 400 jours, les lots sont paginés, et les totaux ne prétendent pas certifier des imputations absentes. Les sources restées sans boutique restent explicites. En cas d'anomalie, revenir au commit de déploiement précédent via une PR de revert sur `main` et conserver toutes les données : **aucune migration destructive, aucun mouvement généré par le dashboard**.

Hors scope explicite : certification comptable légale, conversion FX historique consolidée, valorisation exhaustive des stocks, nouveaux moteurs de paiement ou de comptabilisation, activation commerciale automatique de modules non souscrits.
