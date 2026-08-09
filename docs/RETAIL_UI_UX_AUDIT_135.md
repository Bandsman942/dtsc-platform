# Issue #135 — Audit UI/UX Retail / Shop — tranche 1

## Statut

Première tranche d’implémentation de la consolidation Retail engagée depuis le `main` de clôture Shop 2.0.

Cette tranche ne prétend pas clôturer l’issue #135. Elle traite les points les plus visibles du POS et pose les contrats qui permettront de poursuivre l’audit écran par écran.

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

## Fondations ajoutées

### Langage client

`lib/customer-facing-language.ts` centralise :

- traduction des reason codes ;
- statuts métier ;
- capacités Shop ;
- types d’équipement ;
- modes de retrait/livraison ;
- fallback humain pour erreur technique inconnue.

### Contrat documentaire

`docs/CUSTOMER_FACING_LANGUAGE_CONTRACT.md` rend opposables :

- les termes techniques interdits côté client ;
- la séparation diagnostic / copie client ;
- le fallback humain ;
- le FR/EN ;
- l’absence de surpromesse de conformité.

### QA

`scripts/qa-retail-product-coherence.mjs` vérifie cette première tranche :

- hiérarchie du POS ;
- usage du mapping client ;
- disparition des principales fuites techniques connues ;
- maintien des contrats de source de vérité ERP.

Le gate est exécuté dans :

- `Shop 2 commercial UI` ;
- `Quality gates`.

## Ce qui reste à auditer

### UI/UX Retail

- workspace principal `EnterpriseRetailShopWorkspace` ;
- pricing, taxes, promotions, dérogations ;
- retours et remboursements ;
- fidélité, gift cards et avoirs ;
- paiements et états provider ;
- clôture quotidienne ;
- Mobile Money ;
- Telco Topups ;
- reçus et historique ;
- rapports ;
- guides utilisateur ;
- responsive 390 / 768 / desktop sur tous les parcours.

### ERP ↔ Retail

- deep links objet par objet ;
- achat → réception → stock → POS ;
- POS → Sales Order → fulfillment ;
- retour → Inventory / Finance / fidélité ;
- caisse → Treasury / Accounting ;
- cohérence KPI avec Reports ;
- liens contextuels vers Validations, Tasks, Assets et AI Assistant lorsqu’ils sont réellement utiles.

### Langage client transversal

Le mapper posé dans cette tranche est d’abord consommé par les surfaces Retail les plus visibles. L’issue #135 exige ensuite l’audit des autres modules ERP clients pour éliminer les mêmes fuites techniques sans masquer les détails nécessaires aux outils internes DTSC.

## Règle de clôture de l’issue #135

L’issue principale ne pourra être clôturée qu’après :

- audit complet des surfaces Retail ;
- matrice ERP ↔ Retail validée et corrections appliquées ;
- E2E des parcours prioritaires ;
- contrat mobile et i18n ;
- QA de cohérence durable ;
- acceptance Production.
