# Issue #135 — Audit UI/UX Retail / Shop

## Statut

Consolidation produit finale en cours dans l’issue #145, à partir de la Production certifiée :

- SHA : `bd948059eb2c2d2053f7f4359c61aa647bcdb13d` ;
- Release : `prod-20260809-0759-bd94805` ;
- Shop 2.0 technique : `COMPLETE` ;
- maturité commerciale conservée : `COMMERCIAL_READY`.

Ce document décrit l’état réel après les quatre tranches déjà livrées et la tranche finale de stabilisation. La clôture de #135 reste conditionnée aux Quality Gates, à l’acceptance comportementale, au merge dans `main` et à une Production Vercel `READY` sur le SHA fusionné.

---

## Tranche 1 — POS, offline, omnicanal, mise en service et équipements

### Problèmes initiaux

- parcours de vente principal enfoui derrière plusieurs surfaces secondaires ;
- jargon `Country pack`, `readiness`, états de synchronisation et détails techniques ;
- explications d’architecture visibles dans l’offline et l’omnicanal ;
- types de périphériques et statuts rendus depuis des enums ;
- client actif expliqué par son implémentation serveur.

### Corrections livrées

- le POS est prioritaire ;
- offline, commandes, équipements et mise en service utilisent la divulgation progressive ;
- messages métier FR/EN via `customerFacingError`, `customerFacingStatusLabel`, `customerFacingFulfillmentMode`, `customerFacingDeviceType` et les mappings de readiness ;
- suppression du vocabulaire d’architecture des surfaces clientes ;
- responsive mobile renforcé.

---

## Tranche 2 — Tarification, promotions, retours et remboursements

### Problèmes initiaux

- vocabulaire `canonical`, domaine Retail, legacy, posting et autres termes d’architecture ;
- enums bruts de promotion, retour, état produit, traitement stock et remboursement ;
- erreurs backend visibles telles quelles ;
- sources ERP décrites mais peu actionnables ;
- contrôles commerciaux trop denses sur mobile.

### Corrections livrées

- langage commercial FR/EN ;
- erreurs visibles systématiquement assainies ;
- liens vers `CATALOG` pour les prix produits et `FINANCE_TREASURY` pour les comptes de remboursement ;
- formulaires mono-colonne par défaut et rails tactiles ;
- aucune source de vérité Finance, Inventory ou Catalog parallèle.

---

## Tranche 3 — Valeur client et suivi des paiements

### Problèmes initiaux

Les capacités de fidélité, cartes-cadeaux, avoirs et paiements existaient dans les moteurs mais restaient peu visibles ou trop techniques dans le parcours commercial.

### Corrections livrées

- bloc replié `Fidélité & avoirs client` ;
- historique d’achats et soldes utiles au vendeur ;
- suivi récent des paiements uniquement pour les rôles autorisés ;
- états et moyens de paiement traduits ;
- aucune référence provider, payload, credential, secret ou diagnostic interne dans l’état UI ;
- acceptance mobile 390 px.

---

## Tranche 4 — Clôture quotidienne et passage vers Finance

Production : `prod-20260809-0759-bd94805`.

### Problèmes initiaux

- `RETAIL_DAILY_CLOSE` dépendait du gros workspace Shop ;
- clôture, POS, Mobile Money et Télécom partageaient une même surface monolithique ;
- types de comptes bruts visibles ;
- passage vers Finance peu explicite.

### Corrections livrées

- workspace autonome `RetailDailyCloseWorkspace` ;
- caisse active, soldes à compter, écarts et motifs clairement présentés ;
- ouverture de caisse avec le moteur existant ;
- soumission idempotente ;
- validation/refus réservés aux permissions `manage`, sans modifier l’interdiction backend d’auto-validation ;
- historique borné ;
- types de comptes et statuts traduits ;
- liens `FINANCE_CASH` et `FINANCE_TREASURY` ;
- E2E dédié à 390 px.

---

# Tranche finale — Issue #145 — Stabilisation produit et acceptance ERP

## Diagnostic final

Après les quatre tranches précédentes, les dettes P1 restantes étaient concentrées dans l’ancien `EnterpriseRetailShopWorkspace` :

1. un seul composant mélangeait encore POS, Mobile Money, Télécom, historique, configuration et rapports ;
2. le chargement et certaines mutations pouvaient remonter directement un message backend ;
3. la recherche POS expliquait encore qu’elle travaillait « côté serveur » ;
4. Mobile Money et Télécom exposaient encore des formulations telles que `provider float`, `supplier float`, `Wallet`, compte `non-cash` ou `Provider reference` ;
5. les confirmations et historiques utilisaient encore `providerCode` ou `transactionType` comme texte visible ;
6. les rapports rendaient `accountType` directement ;
7. la continuité Shop ↔ ERP restait répartie et non explicite sur toutes les surfaces opérationnelles.

## Corrections implémentées

### 1. Décomposition définitive du workspace monolithique

L’ancien `EnterpriseRetailShopWorkspace` est retiré du runtime.

Les responsabilités sont désormais séparées :

- `RetailPosWorkspace` — vente, panier, encaissement, tickets et historique POS ;
- `RetailOperatorWorkspace` — Mobile Money et Télécom ;
- `RetailDailyCloseWorkspace` — clôture quotidienne ;
- `retail-workspace-shared.tsx` — primitives communes de chargement, mutations, caisse, métriques, rapports et continuité ERP.

La séparation est une refactorisation d’interface : elle ne crée aucun moteur métier parallèle.

### 2. Erreurs clientes assainies

Les chargements, recherches et mutations des nouveaux workspaces passent par `customerFacingError`.

Les détails internes restent disponibles dans les réponses/logs serveurs protégés mais ne deviennent plus automatiquement le texte d’erreur affiché au client.

### 3. Mobile Money et Télécom professionnalisés

`lib/retail-customer-language.ts` ajoute des libellés métier dédiés pour :

- dépôt / retrait Mobile Money ;
- traitement des frais ;
- confirmations opérateur.

L’UI utilise maintenant :

- `Service Mobile Money` ;
- `Compte opérateur Mobile Money` ;
- `Compte opérateur Télécom` ;
- `Référence opérateur` ;
- les noms commerciaux des opérateurs.

Les codes opérateur, types de comptes et types de transaction restent des données internes/payloads mais ne servent plus de libellés clients.

### 4. Rapports et historique

- les types de comptes financiers utilisent `customerFacingFinancialAccountType` ;
- les statuts utilisent `customerFacingStatusLabel` ;
- l’historique Mobile Money utilise le type de transaction traduit ;
- les historiques opérateurs affichent le libellé de l’opérateur et non `providerCode` ;
- les listes restent bornées par les APIs de dashboard existantes.

### 5. Continuité ERP

Les workspaces exposent des liens d’action vers les autorités existantes :

#### POS

- `CRM_CUSTOMERS` ;
- `CATALOG` ;
- `INVENTORY_LOGISTICS` ;
- `SALES_QUOTES_ORDERS` ;
- `FINANCE_CASH` ;
- `REPORTS`.

#### Mobile Money / Télécom

- `FINANCE_CASH` ;
- `FINANCE_TREASURY` ;
- `REPORTS`.

#### Clôture quotidienne

- `FINANCE_CASH` ;
- `FINANCE_TREASURY`.

Ces liens rendent l’autorité métier actionnable sans dupliquer son CRUD dans Retail.

---

# Sources de vérité conservées

| Objet | Autorité | Usage Retail |
|---|---|---|
| Client | `EnterpriseBusinessParty` / CRM | sélection et historique |
| Produit | `EnterpriseCatalogItem` / Catalog | recherche et panier |
| Stock | Inventory commun | disponibilité, vente, retour, réservation |
| Commande | `EnterpriseSalesOrder` | omnicanal et fulfillment |
| Achat | Purchase commun | alimentation du stock |
| Paiement / caisse / trésorerie | Finance commun | encaissements, remboursements, soldes opérateurs |
| Comptabilité | `EnterpriseJournalEntry` | posting de vente, retour et écarts |
| Reporting | `REPORTS` + agrégats canoniques | lecture et décision |

Aucun dual-write permanent n’est introduit dans cette consolidation.

---

# Contrat mobile / i18n / accessibilité

La tranche finale ajoute une acceptance dédiée :

- **390 px, FR** : POS + continuité ERP ;
- **768 px, FR** : Mobile Money ;
- **1440 px, EN** : Télécom + rapports ;
- absence de débordement horizontal structurel ;
- absence des principaux termes techniques interdits ;
- absence d’`accountType` brut dans les rapports couverts.

Les scénarios historiques Shop 2.0 restent exécutés dans le même workflow comportemental.

---

# QA opposable

`scripts/qa-retail-product-coherence.mjs` bloque maintenant notamment :

- le retour du workspace monolithique ;
- une route Retail qui ne passe pas par les workspaces dédiés ;
- l’affichage de types de comptes bruts ;
- le retour des formulations techniques Mobile Money/Télécom connues ;
- les codes opérateur utilisés comme texte d’historique ;
- les erreurs brutes sur les nouveaux workspaces ;
- la perte des liens ERP prioritaires ;
- la perte des contrats offline, omnicanal, commercial, valeur client, paiements et clôture déjà établis.

Le gate est exécuté dans les Quality Gates et dans le workflow comportemental Shop 2.

---

# Critères de clôture #135

La consolidation pourra être déclarée terminée uniquement lorsque le même head de #145 aura :

- Delivery Governance verte ;
- migrations depuis zéro vertes ;
- type-check, QA, lint et build verts ;
- Quality Gates vertes ;
- Shop 2 Behavioral vert, y compris l’acceptance finale multi-écrans ;
- Shop 2 Commercial UI vert ;
- Shop 2 Global Readiness vert ;
- merge dans `main` ;
- Vercel Production `READY` sur le SHA fusionné ;
- GitHub Release Production correspondante.

Aucune promotion `COMMERCIAL_READY_GLOBAL` n’est incluse dans cette consolidation. Aucun chantier SYSCOHADA ou plan comptable n’est inclus.
