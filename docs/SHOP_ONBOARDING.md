# DTSC Platform — Onboarding complet d’une entreprise Shop

## 1. Périmètre

Ce document décrit le parcours canonique d’onboarding d’une entreprise cliente du secteur :

- secteur : `COMMERCE_RETAIL` ;
- template : Commerce Retail v2 ;
- profil métier : `RETAIL_TELCO_MOBILE_MONEY` ;
- modules opérationnels Shop : `RETAIL_POS`, `MOBILE_MONEY_AGENCY`, `TELCO_TOPUPS`, `RETAIL_DAILY_CLOSE`.

Il couvre l’onboarding jusqu’à la première journée d’exploitation contrôlée.

Le provisioning d’une entreprise cliente reste actuellement piloté par DTSC depuis la Console interne. Ce document ne décrit donc pas un parcours public de création d’organisation en libre-service.

---

## 2. Les trois offres Shop

### STARTER — Shop Essentials

Objectif : préparer la digitalisation sans exploiter encore le Shop complet.

Capacités principales :

- profil entreprise ;
- clients / CRM ;
- catalogue ;
- documents ;
- données de préparation conservées pour une future montée de plan.

Les quatre modules opérationnels Retail exigent au minimum `BUSINESS`. STARTER ne doit donc pas être vendu comme un POS complet.

Parcours conseillé : créer l’entreprise, appliquer le template Shop, préparer l’identité, le catalogue, les clients et les documents, puis passer à BUSINESS avant le démarrage opérationnel.

### BUSINESS — Shop Operations

Offre opérationnelle recommandée pour un Shop réel.

Elle permet, selon les permissions et dépendances :

- sites et dépôts ;
- inventaire et logistique ;
- fournisseurs et achats ;
- Finance, Trésorerie et caisse ;
- POS ;
- Mobile Money ;
- Télécom et forfaits ;
- clôture journalière ;
- reporting par devise et consolidation FX.

### ENTERPRISE — Shop Scale

Reprend le même cœur opérationnel Shop que BUSINESS et ajoute la capacité de montée en échelle, de gouvernance et les autres capacités Enterprise éligibles.

Les quatre modules Retail ne deviennent pas meilleurs simplement parce que le plan est ENTERPRISE : le différentiel commercial porte sur l’échelle, la gouvernance et les capacités transverses du plan.

---

## 3. Étape 1 — Créer l’entreprise cliente

Depuis la Console DTSC :

1. créer une organisation de type `CLIENT` ;
2. renseigner le nom, le pays, la ville, les contacts et le fuseau horaire ;
3. sélectionner le secteur `COMMERCE_RETAIL` ;
4. choisir STARTER, BUSINESS ou ENTERPRISE ;
5. désigner l’administrateur entreprise ;
6. activer l’application du template sectoriel.

Résultat attendu :

- organisation créée ;
- abonnement créé si un plan est renseigné ;
- administrateur invité ;
- template Retail appliqué ;
- profil `RETAIL_TELCO_MOBILE_MONEY` provisionné ;
- providers Retail provisionnés.

L’administrateur doit accepter son invitation avant de gérer réellement l’entreprise.

---

## 4. Étape 2 — Vérifier le profil Shop

Dans l’entreprise :

1. confirmer que le secteur affiché est Commerce Retail ;
2. confirmer que le profil Retail est actif ;
3. vérifier que les modules autorisés correspondent au plan ;
4. utiliser le bloc `Mise en service du Shop` comme checklist persistante.

Les wallets pré-provisionnés sont :

- M-Pesa ;
- Orange Money ;
- Airtel Money ;
- Afrimoney.

Les réseaux Télécom pré-provisionnés sont :

- Vodacom ;
- Orange ;
- Airtel ;
- Africell.

Wallet et réseau sont deux concepts distincts.

---

## 5. Étape 3 — Organiser les collaborateurs et les responsabilités

Le template Shop prévoit notamment :

- `STORE_MANAGER` ;
- `SALES_MANAGER` ;
- `SELLER` ;
- `CASHIER` ;
- `MOBILE_MONEY_AGENT` ;
- `STOCK_KEEPER` ;
- `STOCK_MANAGER` ;
- `PURCHASE_MANAGER` ;
- `RETAIL_CONTROLLER`.

Départements canoniques :

- Direction ;
- Ventes / Télécom ;
- Mobile Money / Caisse ;
- Stock / Achats ;
- Finance / Contrôle.

Règle : attribuer les postes avant l’exploitation et ne donner que les permissions nécessaires.

Le contrôleur doit rester distinct de l’initiateur lorsqu’une validation indépendante est requise.

---

## 6. Étape 4 — Créer les sites, dépôts et emplacements

Dans `Sites & Entrepôts` :

1. créer le site physique du Shop ;
2. créer au moins un dépôt/entrepôt ;
3. créer les emplacements de stockage si nécessaire ;
4. vérifier que les articles suivis en stock peuvent être rattachés au dépôt réel.

Le POS utilise ces référentiels canoniques. Il ne crée pas de dépôt parallèle.

---

## 7. Étape 5 — Préparer le catalogue

Dans `Catalogue` :

Pour chaque produit ou service, renseigner au minimum :

- code ;
- SKU si utilisé ;
- libellé ;
- type produit/service ;
- prix de vente indicatif ;
- coût indicatif si pertinent ;
- devise ;
- suivi de stock oui/non.

Exemples :

- téléphone ;
- coque ;
- chargeur ;
- accessoires ;
- service technique ;
- forfait Télécom fréquent.

Le POS protège le prix catalogue côté serveur. Une modification de prix/remise/taxe est une dérogation réservée à un responsable autorisé et doit être motivée.

---

## 8. Étape 6 — Charger le stock initial

Dans `Inventaire & Logistique` :

1. créer/rattacher les articles d’inventaire ;
2. effectuer l’entrée de stock initiale via le mouvement métier approprié ;
3. vérifier les quantités disponibles par dépôt ;
4. ne pas contourner l’inventaire en modifiant directement des soldes calculés.

Avant la première vente, le POS doit afficher une disponibilité cohérente pour les articles suivis en stock.

---

## 9. Étape 7 — Configurer Finance

### 9.1 Devise fonctionnelle

Configurer la devise fonctionnelle de l’entreprise dans Finance.

Une fois des écritures comptables postées, le changement de devise fonctionnelle est verrouillé par le moteur Finance.

### 9.2 Devise de présentation

Si l’entreprise souhaite afficher ses rapports consolidés dans une autre devise, renseigner `presentationCurrencyCode`.

La cible de reporting est :

1. devise de présentation si configurée ;
2. sinon devise fonctionnelle.

### 9.3 Comptes financiers

Créer les vrais comptes nécessaires :

- `CASH` pour chaque caisse/devise ;
- `MOBILE_MONEY` pour les floats wallets ;
- `CLEARING` ou autre compte autorisé pour les floats Télécom selon l’organisation ;
- `BANK` si nécessaire.

DTSC ne doit jamais inventer un compte, un mapping ou un solde initial.

---

## 10. Étape 8 — Configurer les taux de change

Chemin :

`Finance > Trésorerie > Taux de change et consolidation multi-devise`

Pour chaque paire nécessaire :

1. choisir la devise source ;
2. choisir la devise cible ;
3. saisir la convention `1 SOURCE = RATE TARGET` ;
4. choisir la date d’effet ;
5. renseigner la source du taux ;
6. enregistrer.

Exemple :

`1 USD = 2 850 CDF`

Sources disponibles :

- MANUAL ;
- CENTRAL_BANK ;
- COMMERCIAL_BANK ;
- PROVIDER ;
- CONTRACTUAL ;
- IMPORTED.

Le système n’appelle pas automatiquement une banque centrale dans cette version : la source décrit la provenance du taux configuré.

Un taux publié est historique. Pour le corriger : désactiver avec motif puis créer une nouvelle version datée.

DTSC résout d’abord la paire directe et peut utiliser l’inverse lorsqu’elle seule existe.

---

## 11. Étape 9 — Mapper les wallets Mobile Money

Dans `Agence Mobile Money > Configuration` :

1. vérifier les wallets utilisés ;
2. créer auparavant leurs vrais comptes financiers `MOBILE_MONEY` ;
3. mapper chaque wallet vers son compte de float ;
4. vérifier la devise de chaque compte.

Exemple :

`M-Pesa → Float M-Pesa CDF`

L’agent ne sélectionne plus ce compte pendant chaque opération : le backend le résout depuis la configuration.

---

## 12. Étape 10 — Mapper les réseaux Télécom

Dans `Télécom & forfaits > Configuration` :

1. vérifier Vodacom, Orange, Airtel et Africell ;
2. créer les vrais comptes de float/clearing nécessaires ;
3. mapper chaque réseau vers son compte ;
4. vérifier la devise.

Exemple :

`Vodacom → Float Télécom Vodacom CDF`

M-Pesa ne remplace pas Vodacom et Orange Money ne remplace pas Orange réseau.

---

## 13. Étape 11 — Ouvrir la première session de caisse

Avant un encaissement cash ou une opération Mobile Money :

1. le caissier choisit sa vraie caisse ;
2. il compte le fonds d’ouverture ;
3. il ouvre la session.

Le Shop affiche ensuite clairement l’état de la caisse.

Le cash des opérations utilise automatiquement la session ouverte du collaborateur.

---

## 14. Étape 12 — Effectuer la première vente POS

Scénario recommandé :

1. rechercher plusieurs articles par nom/SKU/code ;
2. ajouter au même panier ;
3. vérifier le dépôt et les quantités ;
4. contrôler le total ;
5. encaisser en cash ou avec un autre compte autorisé ;
6. tester éventuellement un paiement fractionné ;
7. imprimer ou partager le ticket ;
8. vérifier la sortie de stock et les effets financiers.

Test de contrôle : un vendeur ordinaire ne doit pas pouvoir imposer un autre prix catalogue. Un responsable autorisé peut le faire uniquement avec un motif.

---

## 15. Étape 13 — Tester Mobile Money

### Dépôt

1. sélectionner le wallet ;
2. saisir le numéro client ;
3. saisir le principal, frais et commission ;
4. saisir la référence opérateur ;
5. vérifier l’écran de confirmation ;
6. confirmer.

Effet attendu : selon le modèle de dépôt, le cash et le float évoluent dans les sens définis par le service Retail.

### Retrait

Rejouer le même contrôle avec `WITHDRAWAL`.

### Anti-doublon

Réutiliser volontairement la même référence opérateur : la seconde opération doit être refusée.

### Limite actuelle

DTSC enregistre, sécurise, comptabilise et rapproche l’opération. L’exécution sur le réseau opérateur reste externe tant qu’une intégration partenaire n’est pas connectée.

---

## 16. Étape 14 — Tester Télécom

Tester :

- une recharge `SUCCESS` avec référence fournisseur ;
- une recharge `FAILED` ;
- une annulation contrôlée si nécessaire.

Vérifier :

- numéro normalisé ;
- confirmation avant validation ;
- prix de vente ;
- coût opérateur ;
- marge ;
- float réseau ;
- compte d’encaissement ;
- anti-doublon de référence.

L’exécution de la recharge reste externe tant qu’une API opérateur n’est pas connectée.

---

## 17. Étape 15 — Vérifier le reporting multi-devise

Le rapport consolidé Shop est accessible depuis la checklist de mise en service et sur :

`/enterprise-modules/RETAIL_POS/consolidated-report`

Tester au minimum :

1. une opération CDF ;
2. une opération USD ;
3. le rapport natif par devise ;
4. le rapport consolidé dans la devise cible ;
5. la liste des taux utilisés.

DTSC convertit chaque opération avec le taux applicable à sa date.

Si un taux manque, le rapport doit afficher `INCOMPLETE` et ne doit pas présenter un total partiel.

---

## 18. Étape 16 — Effectuer la clôture journalière

Dans `Clôture cash & float` :

1. terminer les opérations ;
2. compter les coupures de caisse ;
3. déclarer les soldes cash ;
4. déclarer les floats ;
5. vérifier les écarts par devise ;
6. justifier chaque écart ;
7. soumettre la clôture.

Une autre personne autorisée doit ensuite approuver ou refuser la clôture.

Le soumissionnaire ne valide pas sa propre clôture lorsque la séparation des rôles est exigée.

---

## 19. Critères de mise en service

Avant exploitation réelle, le bloc `Mise en service du Shop` doit permettre de vérifier :

- profil Shop Retail actif ;
- site et dépôt opérationnels ;
- catalogue de vente renseigné ;
- compte de caisse configuré ;
- consolidation FX disponible pour les devises opérationnelles ;
- au moins un wallet Mobile Money mappé si le service est vendu ;
- au moins un réseau Télécom mappé si le service est vendu ;
- rôles caisse/contrôle disponibles.

---

## 20. Checklist propriétaire d’acceptation

Avant de considérer un nouveau tenant comme exploitable :

- [ ] invitation administrateur acceptée ;
- [ ] structure et postes assignés ;
- [ ] site/dépôt ;
- [ ] catalogue ;
- [ ] stock initial ;
- [ ] Finance et comptes réels ;
- [ ] devise fonctionnelle/de présentation ;
- [ ] taux de change nécessaires ;
- [ ] mappings Mobile Money ;
- [ ] mappings Télécom ;
- [ ] caisse ouverte ;
- [ ] vente multi-articles ;
- [ ] paiement fractionné si utilisé ;
- [ ] contrôle des dérogations de prix ;
- [ ] dépôt Mobile Money ;
- [ ] retrait Mobile Money ;
- [ ] anti-doublon ;
- [ ] recharge SUCCESS ;
- [ ] recharge FAILED ;
- [ ] rapport CDF/USD ;
- [ ] consolidation FX complète ;
- [ ] clôture ;
- [ ] validation indépendante ;
- [ ] contrôle mobile et desktop.

Lorsque cette checklist métier est validée et que les gates CI restent verts, le profil peut être déclaré `COMMERCIAL_READY` par décision explicite DTSC.
