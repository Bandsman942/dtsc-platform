# DTSC Platform — Onboarding complet d’une entreprise Shop

## 1. Périmètre

Ce document décrit le parcours canonique d’onboarding d’une entreprise cliente du secteur :

- secteur : `COMMERCE_RETAIL` ;
- template : Commerce Retail v2 ;
- profil métier par défaut : `RETAIL_CORE` ;
- profil spécialisé rétrocompatible : `RETAIL_TELCO_MOBILE_MONEY` ;
- cœur opérationnel Shop : `RETAIL_POS` et `RETAIL_DAILY_CLOSE` ;
- extensions optionnelles : `MOBILE_MONEY_AGENCY` et `TELCO_TOPUPS`.

Il couvre l’onboarding jusqu’à la première journée d’exploitation contrôlée.

Le provisioning d’une entreprise cliente reste actuellement piloté par DTSC depuis la Console interne. Ce document ne décrit donc pas encore un parcours public de création d’organisation en libre-service.

Le produit Shop déjà accepté conserve son statut `COMMERCIAL_READY`. Le programme Shop 2.0 est une évolution en quatre itérations et ne doit pas être présenté comme une certification globale achevée.

---

## 2. Les trois offres Shop

### STARTER — Shop Essentials

Objectif : préparer la digitalisation sans exploiter encore le POS complet.

Capacités principales :

- profil entreprise ;
- clients / CRM ;
- catalogue ;
- documents ;
- données de préparation conservées pour une future montée de plan.

Les modules Retail opérationnels exigent au minimum `BUSINESS`. STARTER ne doit donc pas être vendu comme un POS complet.

### BUSINESS — Shop Operations

Offre opérationnelle recommandée pour un Shop réel.

Socle :

- sites et dépôts ;
- inventaire et logistique ;
- fournisseurs et achats ;
- Finance, Trésorerie, comptabilité et caisse ;
- POS ;
- clôture journalière ;
- reporting par devise et consolidation FX.

Extensions activables selon le commerce :

- Mobile Money ;
- Télécom et forfaits.

Un commerce standard n’a pas à activer ces extensions pour utiliser Shop.

### ENTERPRISE — Shop Scale

Reprend le cœur opérationnel BUSINESS et ajoute la capacité de montée en échelle, la gouvernance et les autres capacités Enterprise éligibles.

Les évolutions offline, multi-store avancées et omnicanales font partie de Shop 2.0 itération 4 et ne doivent pas être promises comme terminées avant leur certification.

---

## 3. Étape 1 — Créer l’entreprise cliente

Depuis la Console DTSC :

1. créer une organisation de type `CLIENT` ;
2. renseigner nom, pays, ville, contacts et fuseau horaire ;
3. sélectionner `COMMERCE_RETAIL` ;
4. choisir STARTER, BUSINESS ou ENTERPRISE ;
5. désigner l’administrateur entreprise ;
6. appliquer le template sectoriel.

Résultat attendu pour un nouveau tenant :

- organisation créée ;
- abonnement créé si un plan est renseigné ;
- administrateur invité ;
- template Retail appliqué ;
- profil `RETAIL_CORE` actif ;
- aucun compte, float, solde ou provider réglementé inventé.

Si un tenant existant utilise déjà `RETAIL_TELCO_MOBILE_MONEY`, son profil reconnu et ses providers restent préservés pour éviter toute régression.

L’administrateur doit accepter son invitation avant de gérer réellement l’entreprise.

---

## 4. Étape 2 — Vérifier le profil Shop

Dans l’entreprise :

1. confirmer que le secteur affiché est Commerce Retail ;
2. confirmer que le profil Retail est actif ;
3. vérifier les modules autorisés par le plan ;
4. utiliser le bloc `Mise en service du Shop` comme checklist persistante.

Pour `RETAIL_CORE`, Mobile Money et Télécom ne sont pas des prérequis.

Si le client achète l’extension spécialisée, les wallets et réseaux configurables restent distincts :

### Wallets Mobile Money

- M-Pesa ;
- Orange Money ;
- Airtel Money ;
- Afrimoney.

### Réseaux Télécom

- Vodacom ;
- Orange ;
- Airtel ;
- Africell.

Wallet et réseau sont deux concepts différents.

---

## 5. Étape 3 — Organiser les collaborateurs et responsabilités

Postes du cœur Retail :

- `STORE_MANAGER` ;
- `SALES_MANAGER` ;
- `SELLER` ;
- `CASHIER` ;
- `STOCK_KEEPER` ;
- `STOCK_MANAGER` ;
- `PURCHASE_MANAGER` ;
- `RETAIL_CONTROLLER`.

Poste d’extension :

- `MOBILE_MONEY_AGENT` lorsque Mobile Money est activé.

Départements fondamentaux :

- Direction ;
- Stock / Achats ;
- Finance / Contrôle.

Les départements Ventes/Télécom et Mobile Money/Caisse peuvent être utilisés lorsque les extensions et l’organisation le nécessitent.

Règle : attribuer les postes avant l’exploitation et ne donner que les permissions nécessaires. Le contrôleur doit rester distinct de l’initiateur lorsqu’une validation indépendante est requise.

---

## 6. Étape 4 — Créer sites, dépôts et emplacements

Dans `Sites & Entrepôts` :

1. créer le site physique du Shop ;
2. créer au moins un dépôt ;
3. créer les emplacements nécessaires ;
4. vérifier que les articles suivis en stock sont rattachés au dépôt réel.

Le POS réutilise ces référentiels canoniques et ne crée pas de stock parallèle.

---

## 7. Étape 5 — Préparer le catalogue

Dans `Catalogue`, renseigner au minimum :

- code ;
- SKU si utilisé ;
- libellé ;
- type produit/service ;
- prix de vente indicatif ;
- coût/valorisation lorsque pertinent ;
- devise ;
- suivi de stock oui/non.

Exemples : téléphone, coque, chargeur, accessoires, service technique et forfait Télécom si l’extension est utilisée.

Le POS actuel protège le prix catalogue côté serveur. Une modification manuelle de prix/remise/taxe est une dérogation réservée à un responsable autorisé et doit être motivée. Le Pricing & Tax Engine complet appartient à Shop 2.0 itération 2.

---

## 8. Étape 6 — Charger le stock initial

Dans `Inventaire & Logistique` :

1. créer/rattacher les articles d’inventaire ;
2. effectuer l’entrée initiale via le mouvement métier approprié ;
3. vérifier les quantités disponibles par dépôt ;
4. vérifier la valorisation Finance Inventory ;
5. ne jamais modifier directement des soldes calculés.

Avant la première vente, les articles suivis en stock doivent disposer de couches de coût compatibles avec la valorisation commune lorsque le COGS doit être posté.

---

## 9. Étape 7 — Configurer Finance et la comptabilité POS

### 9.1 Devise fonctionnelle

Configurer la devise fonctionnelle dans Finance. Le provisioning Retail la réutilise en priorité comme devise de base.

Une fois des écritures comptables postées, le moteur Finance protège le changement de devise fonctionnelle.

### 9.2 Devise de présentation

Si l’entreprise souhaite consolider ses rapports dans une autre devise, renseigner `presentationCurrencyCode`.

### 9.3 Plan comptable et mappings obligatoires

Avant la première vente, Finance doit être `READY` et les mappings suivants doivent être actifs :

- `SALES_REVENUE` ;
- `TAX_PAYABLE` ;
- `COST_OF_SALES` ;
- `INVENTORY`.

Les journaux actifs suivants sont requis :

- `SALES` ;
- `INVENTORY`.

Une période comptable couvrant la date de vente doit être ouverte ou soft-closed selon les règles Finance.

### 9.4 Comptes financiers

Créer les vrais comptes nécessaires :

- `CASH` pour les caisses ;
- `BANK` / `CLEARING` selon les encaissements ;
- `MOBILE_MONEY` uniquement si l’extension l’exige.

Chaque compte de tender doit être lié à son compte ledger. DTSC ne doit jamais inventer un compte, un mapping ou un solde initial.

---

## 10. Étape 8 — Configurer les Taux de change

Chemin :

`Finance > Trésorerie > Taux de change et consolidation multi-devise`

Pour chaque paire nécessaire :

1. choisir la devise source ;
2. choisir la devise cible ;
3. saisir la convention `1 SOURCE = RATE TARGET` ;
4. choisir la date d’effet ;
5. renseigner la source ;
6. enregistrer.

Exemple : `1 USD = 2 850 CDF`.

Sources supportées : MANUAL, CENTRAL_BANK, COMMERCIAL_BANK, PROVIDER, CONTRACTUAL, IMPORTED.

Le système n’invente jamais un taux. Un taux publié reste historique ; pour le corriger, désactiver avec motif puis créer une nouvelle version datée.

---

## 11. Étape 9 — Ouvrir la première session de caisse

Avant un encaissement cash :

1. le caissier choisit sa vraie caisse ;
2. il compte le fonds d’ouverture ;
3. il ouvre la session.

Le Shop affiche ensuite l’état de la caisse. Une session `PENDING_VALIDATION` n’est pas une caisse utilisable.

---

## 12. Étape 10 — Effectuer la première vente POS

Scénario recommandé :

1. rechercher plusieurs articles par nom/SKU/code ;
2. ajouter plusieurs lignes au panier ;
3. vérifier dépôt et quantités ;
4. contrôler total et devise ;
5. encaisser en cash ou avec un autre compte autorisé ;
6. tester un paiement fractionné si pertinent ;
7. finaliser le ticket ;
8. vérifier la sortie de stock ;
9. vérifier les effets de trésorerie ;
10. vérifier les écritures comptables.

### Preuve comptable attendue

Pour une vente :

- débit du/des comptes de tender ;
- crédit `SALES_REVENUE` ;
- crédit `TAX_PAYABLE` lorsqu’une taxe existe ;
- débit `COST_OF_SALES` ;
- crédit `INVENTORY`.

Les débits et crédits doivent être équilibrés.

Le retry avec la même clé d’idempotence ne doit ni recréer le ticket ni dupliquer le posting.

### Performance

Le chemin serveur batch-load les produits, articles d’inventaire, comptes de tender et sessions de caisse nécessaires au ticket. Un ticket pouvant contenir jusqu’à 200 lignes ne doit pas déclencher une recherche catalogue/inventaire par ligne.

L’API de recherche POS serveur paginée existe dans Shop 2.0. Son raccordement complet au workspace actif reste un critère de clôture de l’itération 1.

---

## 13. Étape 11 — Tester l’annulation complète

Pour un ticket test :

1. annuler avec un motif ;
2. vérifier le statut `REVERSED` ;
3. vérifier le retour physique du stock ;
4. vérifier l’inversion des tenders ;
5. vérifier l’inversion revenu/taxe ;
6. vérifier la restauration du coût original : `Dr INVENTORY / Cr COST_OF_SALES` ;
7. rejouer la requête pour contrôler l’idempotence.

Les retours partiels, échanges, store credit et remboursements avancés appartiennent à l’itération 2.

---

## 14. Extension optionnelle — Mobile Money

Cette section ne s’applique que si le service est vendu et activé.

### Mapping

Dans `Agence Mobile Money > Configuration` :

1. sélectionner les wallets réellement utilisés ;
2. créer leurs vrais comptes financiers `MOBILE_MONEY` ;
3. mapper chaque wallet vers son compte de float ;
4. vérifier la devise.

Exemple : `M-Pesa → Float M-Pesa CDF`.

### Test dépôt/retrait

Tester `DEPOSIT` puis `WITHDRAWAL` avec :

- téléphone ;
- principal ;
- frais/commission ;
- référence opérateur ;
- confirmation ;
- effets cash/float ;
- anti-doublon de référence.

DTSC enregistre et rapproche actuellement l’opération ; l’exécution provider asynchrone appartient à l’itération 3.

---

## 15. Extension optionnelle — Télécom & forfaits

Cette section ne s’applique que si le service est vendu et activé.

### Mapping

Dans `Télécom & forfaits > Configuration` :

1. activer uniquement les réseaux utilisés ;
2. créer les vrais comptes float/clearing ;
3. mapper chaque réseau ;
4. vérifier la devise.

### Test

Tester :

- une recharge `SUCCESS` avec référence fournisseur ;
- une recharge `FAILED` ;
- une annulation contrôlée si nécessaire ;
- prix de vente, coût opérateur et marge ;
- compte d’encaissement et float ;
- anti-doublon.

L’exécution de la recharge sur le réseau opérateur reste externe tant qu’un adaptateur provider n’est pas connecté.

---

## 16. Étape 12 — Vérifier le reporting multi-devise

Rapport : `/enterprise-modules/RETAIL_POS/consolidated-report`.

Tester au minimum :

1. une opération dans chaque devise réellement utilisée ;
2. le rapport natif par devise ;
3. la consolidation dans la devise cible ;
4. la liste des taux utilisés.

Si un taux nécessaire manque, le rapport doit rester `INCOMPLETE` plutôt que publier un total partiel trompeur.

---

## 17. Étape 13 — Effectuer la clôture journalière

Dans `Clôture magasin` :

1. terminer les opérations ;
2. compter les coupures ;
3. déclarer les soldes cash ;
4. déclarer les floats uniquement pour les extensions utilisées ;
5. vérifier les écarts par devise ;
6. justifier chaque écart ;
7. soumettre la clôture ;
8. faire approuver/refuser par une autre personne autorisée.

Le soumissionnaire ne valide pas sa propre clôture lorsque la séparation des rôles est exigée.

`RETAIL_DAILY_CLOSE` dépend du Retail Core et ne requiert plus Mobile Money.

---

## 18. Critères de mise en service d’un tenant Retail Core

Le bloc `Mise en service du Shop` doit confirmer :

- profil Shop Retail actif ;
- site et dépôt opérationnels ;
- catalogue renseigné ;
- compte de caisse réel ;
- Finance `READY` ;
- mappings `SALES_REVENUE`, `TAX_PAYABLE`, `COST_OF_SALES`, `INVENTORY` ;
- journaux Sales/Inventory ;
- période de posting disponible ;
- consolidation FX disponible pour les devises opérationnelles ;
- rôles caisse/contrôle disponibles.

Pour les extensions :

- wallet Mobile Money mappé uniquement si Mobile Money est vendu ;
- réseau Télécom mappé uniquement si Télécom est vendu.

---

## 19. Checklist propriétaire d’acceptation du tenant

### Retail Core

- [ ] invitation administrateur acceptée ;
- [ ] structure et postes assignés ;
- [ ] site/dépôt ;
- [ ] catalogue ;
- [ ] stock initial et valorisation ;
- [ ] Finance `READY` ;
- [ ] mappings comptables POS ;
- [ ] journaux et période comptable ;
- [ ] comptes financiers réels ;
- [ ] devise fonctionnelle/de présentation ;
- [ ] Taux de change nécessaires ;
- [ ] caisse ouverte ;
- [ ] vente multi-articles ;
- [ ] paiement fractionné si utilisé ;
- [ ] contrôle des dérogations de prix ;
- [ ] posting vente équilibré ;
- [ ] COGS/Inventory équilibré ;
- [ ] retry idempotent ;
- [ ] annulation complète et posting miroir ;
- [ ] rapport multi-devise ;
- [ ] consolidation FX complète ;
- [ ] clôture ;
- [ ] validation indépendante ;
- [ ] contrôle mobile et desktop.

### Extension Mobile Money si vendue

- [ ] wallet(s) mappé(s) ;
- [ ] dépôt ;
- [ ] retrait ;
- [ ] anti-doublon ;
- [ ] rapprochement cash/float.

### Extension Télécom si vendue

- [ ] réseau(x) mappé(s) ;
- [ ] recharge SUCCESS ;
- [ ] recharge FAILED ;
- [ ] marge et float cohérents ;
- [ ] anti-doublon.

La validation de cette checklist signifie qu’un **tenant** est prêt à exploiter le périmètre activé. Elle ne change pas automatiquement le statut commercial du produit. Toute nouvelle promotion de maturité Shop 2.0 reste une décision explicite DTSC après preuves CI/E2E.
