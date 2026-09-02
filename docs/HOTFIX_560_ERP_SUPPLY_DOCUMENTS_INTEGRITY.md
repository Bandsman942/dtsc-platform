# Hotfix #560 — ERP supply, sites, documents et stock/logistique

## Statut

Hotfix P1 lié à l’Issue `#560`.

Baseline de départ :

```text
main@2d2d5937f67bccfff04ab01074b27e62d58a1845
```

Branche :

```text
fix/560-erp-supply-documents-integrity
```

Ce document décrit le contrat livré. Les preuves d’exécution restent séparées : une commande n’est déclarée `CI_PROVEN` que lorsque GitHub Actions l’a réellement exécutée sur le SHA de la PR.

## Objectif fonctionnel

Remettre les modules suivants au niveau des patterns stabilisés dans Point de vente, Tâches & opérations, Demandes internes, Validations, Réunions et Workflows :

- `SUPPLIERS_PURCHASES` ;
- `SITES_WAREHOUSES` ;
- `DOCUMENTS` ;
- `INVENTORY_LOGISTICS`.

Le hotfix supprime les actions sans backend réel, les références libres concurrentes, les transitions sensibles sans revue, les hiérarchies tronquées silencieusement et les ruptures de continuité entre demande, achat, réception et stock.

## Chaîne canonique achat → stock

Le flux commun est désormais :

```text
EnterpriseRequest(requestType=PURCHASE_REQUEST, status=APPROVED)
  -> EnterprisePurchase(DRAFT)
  -> EnterpriseApproval
  -> EnterprisePurchase(APPROVED)
  -> EnterprisePurchase(ORDERED)
  -> EnterprisePurchaseReceipt
  -> EnterpriseStockMovement(PURCHASE_RECEIPT)
  -> EnterpriseInventoryBalance
```

Règles opposables :

1. une demande source d’un achat doit être une vraie `PURCHASE_REQUEST` approuvée ;
2. chaque ligne d’achat référence un `EnterpriseCatalogItem` réel du même `organizationId` ;
3. la nature attendue de la ligne (`GOODS` ou `SERVICE`) est conservée dans `EnterprisePurchaseItemCatalogLink` ;
4. site et entrepôt de réception sont validés côté serveur puis conservés dans `EnterprisePurchaseOperationalLink` ;
5. la réception calcule le reliquat à partir des réceptions déjà persistées et refuse toute sur-réception ;
6. la création de la réception et sa projection dans le stock commun sont exécutées dans la même transaction sérialisable ;
7. l’idempotence du stock utilise une clé stable par ligne de réception ;
8. un service ou article non suivi ne produit aucun faux mouvement de stock ;
9. aucun `PharmacyStockMovement`, mouvement HEALTH_CARE ou autre mouvement sectoriel n’est créé par dual-write implicite.

## Frontières Finance

Les objets restent distincts :

```text
EnterprisePurchase
!= EnterprisePurchaseReceipt
!= EnterpriseSupplierInvoice / EnterprisePayable
!= EnterpriseExpense
!= EnterprisePayment
```

Une commande ou réception physique n’est pas une facture fournisseur et ne constitue pas une comptabilisation automatique. Les actions financières provenant de l’achat dirigent vers le domaine `FINANCE_PAYABLES` lorsque le traitement fournisseur doit continuer.

## Sites, entrepôts et emplacements

`SITES_WAREHOUSES` est l’unique référentiel commun de localisation :

```text
Entreprise
  -> EnterpriseSite
  -> EnterpriseWarehouse
  -> EnterpriseStorageLocation
```

`INVENTORY_LOGISTICS` reste l’autorité des quantités, lots, balances et mouvements. Aucune quantité n’est dupliquée dans les objets de localisation.

Les protections d’intégrité interdisent maintenant :

- de désactiver un site avec des entrepôts actifs ;
- de désactiver un entrepôt avec des emplacements actifs ;
- de désactiver un entrepôt qui porte encore un stock ou une réservation ;
- de désactiver un emplacement avec des enfants actifs ;
- de désactiver un emplacement qui porte encore un stock, une réservation ou un lot disponible.

Les types de site, entrepôt et emplacement sont partagés entre UI et validation serveur. Les listes utilisent une pagination réelle. Une route de hiérarchie dédiée construit l’arbre depuis les sources canoniques et signale explicitement un résultat borné au lieu de masquer silencieusement des éléments.

## Stock et logistique

Le module possède quatre parcours métier cohérents :

- soldes et mouvements ;
- transferts ;
- inventaires ;
- ajustements.

### Transferts

Un transfert conserve une validation indépendante. Les entrepôts doivent différer, les emplacements sont contrôlés contre leur entrepôt, et les mouvements `TRANSFER_OUT` / `TRANSFER_IN` sont transactionnels et idempotents.

### Inventaires

Le contrat canonique utilise `SUBMITTED` pour l’état en attente de décision et `expectedQuantity` pour la quantité théorique. L’approbation applique les écarts par mouvements `COUNT_CORRECTION` plutôt que par modification directe du solde.

### Ajustements

Le bouton Ajustement dispose désormais d’un vrai backend :

```text
création
  -> PENDING_APPROVAL
  -> approbateur indépendant
  -> APPROVED/REJECTED
  -> ADJUSTMENT_IN ou ADJUSTMENT_OUT
  -> balance mise à jour
```

L’ajustement reste un objet audité et le journal de mouvements reste la source immuable de la variation.

### Stock négatif

La politique est portée par `EnterpriseInventoryItem.allowNegativeStock` :

- `false` par défaut : toute sortie conduisant sous zéro reçoit `NEGATIVE_STOCK_FORBIDDEN` ;
- `true` : le moteur autorise la balance négative pour cet article précis ;
- cette option ne contourne jamais la validation du tenant, de l’article, de l’entrepôt, de l’emplacement ou du lot.

## Documents

Les documents restent privés et versionnés. La création liée transmet la source canonique à `createEnterpriseDocument`, qui crée le document et son `EnterpriseEntityLink` dans la même transaction ; l’interface n’effectue plus un deuxième link post-création.

Les cibles documentaires sont revalidées côté serveur dans le même `organizationId`.

L’archivage est une action sensible :

- revue explicite ;
- motif professionnel obligatoire ;
- motif conservé dans l’événement opérationnel et l’audit ;
- aucune suppression physique des versions ;
- aucun lien de stockage public permanent.

## UX commune

Les workspaces touchés appliquent le contrat récent :

- listes métier paginées ;
- références contrôlées ;
- formulaire guidé ;
- `Dialog presentation="editor"` pour les formulaires longs et les revues sensibles ;
- contenu préservé lorsqu’une mutation échoue ;
- états loading et disabled ;
- feedback global/local ;
- revue/confirmation avant `ORDER`, `CLOSE`, `CANCEL`, décisions de stock et archivage documentaire ;
- mobile/tablette/desktop sans dépendre d’une hauteur fixe historique comme solution au clavier logiciel.

## Sécurité et multi-tenant

Les mutations conservent le contrat serveur applicable :

- session ;
- organisation active ;
- membership ;
- module/entitlement ;
- permission et visibilité ;
- same-origin ;
- validation Zod ;
- rate limit ;
- revalidation des références par `organizationId` ;
- transaction pour les opérations composées ;
- `ApiLog` / `AuditLog` sur les routes sensibles.

Aucun bouton masqué ou deep link n’est utilisé comme barrière de sécurité.

## Prisma et migrations

Le hotfix réutilise les modèles et tables de liaison existants :

- `EnterprisePurchaseOperationalLink` ;
- `EnterprisePurchaseItemCatalogLink` ;
- `EnterprisePurchaseReceiptOperationalLink` ;
- `EnterprisePurchaseReceiptItemStockLink` ;
- `EnterpriseStockAdjustment` ;
- `EnterpriseInventoryItem.allowNegativeStock`.

Aucune modification de schéma Prisma et aucune nouvelle migration ne sont nécessaires pour ce hotfix.

## QA permanente

Le gate ciblé est :

```text
scripts/qa-hotfix-560-supply-integrity.mjs
```

Il est appelé depuis :

```text
scripts/qa-enterprise-inventory-checks.mjs
```

et donc intégré à `pnpm qa:regression`, puisque la régression exécute déjà la QA `enterprise inventory`.

Le gate vérifie notamment :

- `PURCHASE_REQUEST` canonique ;
- références Catalogue et destination achat ;
- projection `PURCHASE_RECEIPT` ;
- idempotence ;
- politique `allowNegativeStock` ;
- backend Ajustements ;
- hiérarchie et guards Sites/Entrepôts/Emplacements ;
- archivage documentaire avec motif ;
- dialogs `editor` ;
- disparition du raccourci Achat → Finance Budgets.

## Matrice de preuves avant merge

Le texte ci-dessous décrit les contrôles requis, pas leur réussite anticipée.

| Contrôle | Statut initial | Preuve attendue |
|---|---|---|
| `git diff --check` | `NOT_EXECUTED` | CI/checkout du SHA |
| `pnpm prisma:generate` | `NOT_EXECUTED` | GitHub Actions |
| `pnpm type-check` | `NOT_EXECUTED` | GitHub Actions |
| `node scripts/qa-hotfix-560-supply-integrity.mjs` | `NOT_EXECUTED` | GitHub Actions |
| `pnpm qa:enterprise-inventory` | `NOT_EXECUTED` | GitHub Actions |
| `pnpm qa:regression` | `NOT_EXECUTED` | GitHub Actions |
| `pnpm lint` | `NOT_EXECUTED` | GitHub Actions |
| `pnpm build` | `NOT_EXECUTED` | GitHub Actions |
| E2E Fournisseurs & achats | `NOT_EXECUTED` | `OWNER_E2E` |
| E2E Sites & entrepôts | `NOT_EXECUTED` | `OWNER_E2E` |
| E2E Documents | `NOT_EXECUTED` | `OWNER_E2E` |
| E2E Stock & logistique | `NOT_EXECUTED` | `OWNER_E2E` |

## Rollback

Le rollback applicatif consiste à revert la PR #560. Aucune migration n’étant introduite, aucun rollback SQL n’est attendu. Si des réceptions ou ajustements ont déjà généré des mouvements après déploiement, leur historique métier ne doit pas être supprimé manuellement ; toute correction de données doit passer par une opération compensatrice auditable.

## Dette de contribution

- Dette créée : **Aucune visée**.
- Dette remboursée : action Ajustement sans backend, incohérences statuts/champs inventaire, références achats libres, rupture réception→stock, types de localisation divergents, hiérarchie tronquée silencieusement, double mutation de lien documentaire, archivage sans revue et ambiguïté documentaire sur le stock sectoriel versus stock commun.
- Dette maintenue : aucune dette matérielle connue n’est volontairement conservée dans le périmètre de #560 à ce stade.
- Dette reportée : aucune sans Issue dédiée.

- [x] J'ai lu et respecté `docs/CONTRIBUTING.md`.
