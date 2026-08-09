# Issue #135 — Audit UI/UX Retail / Shop

## Statut

Consolidation Retail engagée depuis le `main` de clôture Shop 2.0 et livrée par tranches opposables.

Ce document ne prétend pas clôturer l’issue #135. Il suit les écarts détectés, les corrections appliquées et les zones qui restent à auditer.

---

# Tranche 1 — POS, offline, omnicanal, mise en service et équipements

## Diagnostic initial

### P1 — Hiérarchie du POS surchargée

Avant cette tranche, `RETAIL_POS` affichait successivement :

1. client actif ;
2. périphériques ;
3. readiness / country pack ;
4. offline ;
5. omnicanal ;
6. workspace principal du Shop.

Le parcours de vente principal arrivait donc après plusieurs surfaces de configuration ou d’exception.

**Correction :** le workspace Shop est désormais prioritaire. Les outils offline/commandes et mise en service/équipements sont regroupés par divulgation progressive après le parcours principal.

### P1 — Langage technique visible dans la mise en service

Exemples constatés : `Country pack`, `readiness`, statuts bruts, détails JSON, `COMMERCIAL_READY_GLOBAL`, références à la preuve de release.

**Correction :** conversion vers « Mise en service du Shop », « Configuration pays », « Prêt à vendre », labels de capacités métier et détails humainement lisibles.

### P1 — Langage technique visible dans l’offline

Exemples constatés : `AES-GCM`, `IndexedDB`, `snapshot`, `server reconciliation`, UUID d’opération, statuts `PENDING_SYNC`, `CONFLICT`, codes de conflit bruts.

**Correction :** présentation centrée sur « Vente hors connexion », protection locale, synchronisation, vente à vérifier et messages d’action. Le moteur interne n’est pas modifié.

### P1 — Langage technique visible dans les commandes omnicanales

Exemples constatés : « canonical CRM customer », « fulfillment », « server reprices on submit », « authoritative pricing », « cross-channel status ».

**Correction :** « Client », « retrait ou livraison », « prix vérifié automatiquement », « suivi des commandes » et statuts traduits.

### P2 — Type de périphérique rendu depuis l’enum

Le type de périphérique était généré via `replaceAll("_", " ")`, ce qui exposait le vocabulaire du modèle.

**Correction :** mapping métier FR/EN via le contrat de langage client.

### P2 — Client actif expliqué par l’implémentation serveur

Le texte expliquait que le client serait « rattaché côté serveur » à la vente suivante.

**Correction :** bénéfice métier : personnalisation de la vente et continuité de l’historique d’achats.

---

# Tranche 2 — Issue #138 — Tarification, promotions, retours et remboursements

Branche de livraison : `refactor/138-retail-commercial-coherence`, créée depuis la baseline Production `ed4ec212abbb60c139c47617389a34cc6f66fc1f`.

## Diagnostic

### P1 — L’espace commercial exposait l’architecture au client

Exemples constatés :

- « Canonical sale prices » / « Prix de vente canoniques » ;
- « Retail price conditions » ;
- explication du « common Catalog » et du prix « canonical » appliqué au POS ;
- promotions décrites comme un « dedicated Retail domain » ne réutilisant pas une « retired legacy source » ;
- texte expliquant que le parcours ne « bypass » pas Finance ou Inventory.

Ces formulations décrivaient correctement l’architecture, mais n’aidaient pas l’utilisateur à agir.

**Correction :** l’écran parle maintenant de prix de vente, règles de prix à la caisse, offres clients, retours à examiner et remboursement. La cohérence ERP est matérialisée par des liens d’action au lieu d’être racontée dans la copie.

### P1 — Enums et statuts bruts dans les formulaires et cartes

Exemples constatés :

- `PERCENTAGE`, `FIXED_AMOUNT`, `QUANTITY_BREAK`, `BUY_X_GET_Y`, `BUNDLE` ;
- `EXCLUSIVE`, `STACKABLE` ;
- `RETURN`, `EXCHANGE` ;
- `SELLABLE`, `OPENED`, `DAMAGED`, `DEFECTIVE`, `EXPIRED` ;
- `RESTOCK`, `SCRAP`, `NO_STOCK` ;
- `ORIGINAL_TENDER`, `BANK_TRANSFER` ;
- statuts de promotion et de retour rendus directement ;
- type de compte financier rendu brut.

**Correction :** toutes ces valeurs restent inchangées dans les payloads métier, mais leur rendu passe par `lib/customer-facing-language.ts` en français et en anglais.

### P1 — Erreurs backend affichables telles quelles

`retail-commercial-workspace.tsx` relayait `body.message` ou `body.error` puis affichait directement `caught.message`.

**Correction :** toutes les erreurs visibles passent désormais par `customerFacingError`. Les reason codes connus disposent de messages métier ; un code technique inconnu utilise un fallback humain.

### P1 — Sources de vérité ERP décrites mais peu actionnables

Le texte rappelait que Catalogue, Finance et Inventory restaient propriétaires des données, mais sans fournir systématiquement le chemin d’action.

**Correction :**

- la tarification renvoie vers **Catalogue** pour administrer les prix produits ;
- le remboursement renvoie vers **Trésorerie** pour administrer les comptes financiers compatibles ;
- aucun CRUD parallèle n’est créé dans Retail.

### P2 — Hiérarchie et responsive de l’écran commercial

Plusieurs champs étaient regroupés par deux colonnes sans repli explicite, et le rail d’onglets ne déclarait pas son contrat tactile.

**Correction :**

- formulaires mono-colonne par défaut, deux colonnes à partir de `sm` seulement ;
- onglets et filtres en rail horizontal tactile `pan-x` ;
- actions de validation empilées sur mobile ;
- aucun identifiant interne utilisé comme fallback d’affichage.

## Contrats renforcés pendant la tranche 2

`lib/customer-facing-language.ts` couvre maintenant aussi :

- types de promotion ;
- règles de cumul ;
- canaux de vente ;
- types de retour ;
- état du produit ;
- traitement du stock ;
- modes de remboursement ;
- types de compte financier ;
- `PENDING_APPROVAL` ;
- erreurs courantes de retours et paiements.

`scripts/qa-retail-product-coherence.mjs` vérifie désormais en plus :

- consommation de tous ces mappings par l’espace commercial ;
- disparition des formulations d’architecture de la tranche ;
- absence de libellés d’enum bruts connus dans les options clientes ;
- absence de `caught.message` rendu directement ;
- présence des deep links Catalogue et Trésorerie ;
- maintien du rail tactile.

---

# Fondations communes

## Langage client

`lib/customer-facing-language.ts` centralise :

- traduction des reason codes ;
- statuts métier ;
- capacités Shop ;
- types d’équipement ;
- modes de retrait/livraison ;
- vocabulaire commercial Retail ;
- fallback humain pour erreur technique inconnue.

## Contrat documentaire

`docs/CUSTOMER_FACING_LANGUAGE_CONTRACT.md` rend opposables :

- les termes techniques interdits côté client ;
- la séparation diagnostic / copie client ;
- le fallback humain ;
- le FR/EN ;
- la traduction des enums rendues ;
- les liens vers les sources ERP plutôt que l’explication de leur architecture ;
- l’absence de surpromesse de conformité.

## QA

`scripts/qa-retail-product-coherence.mjs` est exécuté dans :

- `Shop 2 commercial UI` ;
- `Quality gates`.

---

# Ce qui reste à auditer

## UI/UX Retail

- workspace principal `EnterpriseRetailShopWorkspace` en profondeur ;
- dérogations prix/remises/taxes dans le parcours de vente ;
- fidélité, gift cards et avoirs ;
- paiements et états provider ;
- clôture quotidienne ;
- Mobile Money ;
- Telco Topups ;
- reçus et historique ;
- rapports ;
- guides utilisateur ;
- responsive 390 / 768 / desktop sur tous les parcours.

## ERP ↔ Retail

- deep links objet par objet ;
- achat → réception → stock → POS ;
- POS → Sales Order → fulfillment ;
- retour → Inventory / Finance / fidélité ;
- caisse → Treasury / Accounting ;
- cohérence KPI avec Reports ;
- liens contextuels vers Validations, Tasks, Assets et AI Assistant lorsqu’ils sont réellement utiles.

## Langage client transversal

Le mapper est maintenant consommé par les surfaces Retail les plus visibles et l’espace commercial. L’issue #135 exige encore l’audit des autres parcours Retail puis, progressivement, des autres modules ERP clients pour éliminer les mêmes fuites techniques sans masquer les détails nécessaires aux outils internes DTSC.

## Règle de clôture de l’issue #135

L’issue principale ne pourra être clôturée qu’après :

- audit complet des surfaces Retail ;
- matrice ERP ↔ Retail validée et corrections appliquées ;
- E2E des parcours prioritaires ;
- contrat mobile et i18n ;
- QA de cohérence durable ;
- acceptance Production.
