# Shop 2.0 — Itération 4/4 — Architecture offline, multi-store, omnicanale et globale

## Statut

Cette documentation décrit l’architecture de la branche de développement de l’Itération 4. Tant que les preuves finales CI, comportementales et Production ne sont pas réunies, Shop reste `COMMERCIAL_READY` et `ITERATION_4_IN_PROGRESS`. Le statut `COMMERCIAL_READY_GLOBAL` est interdit avant certification finale.

## Principes d’architecture

1. **Une seule vérité de vente** : toute vente réelle passe par `executeCanonicalRetailSale()`.
2. **Une seule vérité de stock** : `EnterpriseInventoryBalance`, mouvements Inventory et `EnterpriseInventoryReservation` restent canoniques.
3. **Une seule vérité de commande** : `EnterpriseSalesOrder` et `EnterpriseSalesOrderItem` restent canoniques.
4. **Une seule vérité de fulfillment** : `EnterpriseFulfillment` et `EnterpriseFulfillmentItem` restent canoniques.
5. **Une seule vérité Finance** : les écritures et valorisations passent par le domaine Finance/Accounting commun.
6. **Offline n’est jamais une seconde base métier** : le navigateur conserve uniquement un brouillon chiffré qui doit être rejoué et validé côté serveur.
7. **Country pack n’est pas une certification juridique** : un pack décrit des capacités produit et leurs preuves, sans inventer réglementation, taux ou conformité.
8. **Onboarding self-service ne fabrique pas de ressources canoniques** : il sélectionne des sites, dépôts, comptes, catalogues et membres déjà existants.

## Continuité hors ligne contrôlée

### Snapshot

Le serveur prépare un snapshot borné par organisation, site, dépôt et devise. Il contient uniquement les données nécessaires au checkout hors ligne : catalogue minimal, prix autoritatif, représentation nette de service, taxe, disponibilité Inventory, politique offline, date de génération et expiration.

Le snapshot ne contient pas : liste clients, email/téléphone client, secrets provider, credentials, token de paiement ou données Mobile Money/Telco.

Les prix/taxes sont calculés par `previewRetailCommercialPricing()`. Si une promotion active ou une condition de prix dynamique est détectée, le checkout offline est désactivé avec un motif observable. Le Retail Core ne tente pas de reproduire localement un moteur promotionnel dynamique.

### Stock local

La disponibilité embarquée provient de :

`onHand - legacyReserved - active EnterpriseInventoryReservation`.

Le navigateur soustrait ensuite les quantités déjà présentes dans sa file `PENDING_SYNC` et dans le panier courant. Cette protection réduit l’oversell local, mais le serveur reste l’autorité finale.

### Chiffrement local

Les snapshots et opérations sont stockés dans IndexedDB. Les payloads sont chiffrés en AES-GCM à l’aide d’une `CryptoKey` non exportable, séparée par organisation. Aucune vente offline n’est stockée en clair dans `localStorage`.

### Paiements offline

Seul `CASH` est accepté hors ligne. Sont explicitement bloqués : carte, Mobile Money, Telco, virement, gift card et store credit. Les paiements nécessitant une autorisation réseau ne peuvent jamais être matérialisés comme succès offline.

### Replay

Chaque brouillon possède un UUID et un hash de payload. Le serveur vérifie :

- organisation et membership ;
- module/entitlement/permission ;
- same-origin et rate limit ;
- validité du snapshot ;
- schéma Zod ;
- politique cash-only ;
- absence de client/coupon/override offline ;
- repricing et retaxation autoritatifs ;
- disponibilité stock ;
- readiness Finance/comptabilité ;
- idempotence.

États observables : `PENDING_SYNC`, `SYNCED`, `CONFLICT`, `REJECTED`.

Un conflit n’est jamais forcé. L’opérateur doit reconnecter, actualiser le contexte et recréer/revalider la transaction si nécessaire.

## Multi-store et réservations

`EnterpriseInventoryReservation` appartient au domaine Inventory commun et référence :

- l’organisation ;
- `EnterpriseSalesOrder` ;
- `EnterpriseSalesOrderItem` ;
- `EnterpriseInventoryItem` ;
- dépôt/localisation ;
- quantité, quantité fulfilled, expiration ;
- clé d’idempotence.

La création est réalisée en transaction `Serializable`. La disponibilité considère les réservations actives non expirées. Les transferts existants du domaine Inventory restent la voie canonique pour déplacer physiquement le stock entre sites.

Aucun champ `quantityOnHand` n’est créé dans le domaine Retail Itération 4.

## Omnicanal

Modes supportés par l’orchestration :

- `CLICK_COLLECT` ;
- `PICKUP_OTHER_STORE` ;
- `SHIP_FROM_STORE` ;
- `CUSTOMER_DELIVERY`.

Le POS sélectionne un `EnterpriseBusinessParty` canonique, un site source, un dépôt de fulfillment et des articles du catalogue canonique. À la soumission :

1. le moteur pricing serveur recalcule prix et taxes ;
2. `createEnterpriseDirectSalesOrder()` crée ou retrouve la commande canonique ;
3. `EnterpriseRetailOrderOrchestration` conserve uniquement le contexte canal/fulfillment/idempotence ;
4. Inventory réserve les lignes suivies en stock ;
5. si une réservation partielle échoue, les réservations déjà prises sont libérées et la commande fraîche est compensée ;
6. le statut cross-channel joint la commande, ses réservations et ses `EnterpriseFulfillment`.

Le contexte Retail ne duplique ni lignes, ni montants, ni devise, ni quantité commandée.

## Country packs

Le registre `RETAIL_COUNTRY_PACKS` déclare les capacités produit par pays. Le premier pack implémenté est `CD_RETAIL_CORE_V1`.

Capacités du socle :

- localisation Retail Core : `SUPPORTED` ;
- multi-devise : `SUPPORTED` via Finance commun ;
- référence fiscale : `TENANT_CONFIGURATION_REQUIRED` ;
- numérotation documentaire : `TENANT_CONFIGURATION_REQUIRED` ;
- fiscal receipt : `EVIDENCE_REQUIRED` ;
- e-invoicing : `NOT_CERTIFIED`.

Aucun taux fiscal n’est codé en dur. Le référentiel fiscal vient du tenant/Finance commun. Une capacité `EVIDENCE_REQUIRED` ne devient validée qu’avec preuves explicites enregistrées.

## Onboarding self-service

La readiness self-service mesure dix éléments :

1. country pack ;
2. devise fonctionnelle Finance ;
3. site ;
4. dépôt ;
5. compte financier de caisse ;
6. catalogue ;
7. liens Inventory des articles suivis ;
8. équipe active ;
9. readiness comptable ;
10. configuration Retail active.

L’assistant n’appelle aucune création automatique de compte financier, site, dépôt, balance Inventory ou solde. Les opérations administrées par DTSC restent administrées par DTSC.

## Sécurité et multi-tenant

Toutes les nouvelles API utilisent `authorizeRetailRequest()` avec le module `RETAIL_POS`, l’action adaptée (`read`, `write`, `submit`, `manage`), same-origin sur mutations et rate limiting. Les sélections liées sont revalidées avec `organizationId` côté serveur.

Le service worker public reste incapable de mettre en cache naïvement `/api/*` ou les navigations privées.

## Performance

- snapshots bornés par `maxItems` ;
- produit POS recherché côté serveur et paginé ;
- multi-store agrégé par lots ;
- commandes récentes paginées ;
- aucun bootstrap de tout le catalogue ou de toutes les balances ;
- réservation Inventory transactionnelle et ciblée ;
- replay batch limité.

## Rollback

Les migrations Itération 4 sont additives. Un rollback applicatif se fait par revert. Les ventes, commandes, réservations ou écritures déjà confirmées ne doivent pas être supprimées par SQL ; leur correction passe par les opérations métier inverses prévues par les domaines canoniques.
