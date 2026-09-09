# Manufacturing Core — architecture canonique

Statut : itération #606 du programme #604.

## Hiérarchie produit

```text
ERP commun DTSC
└── MANUFACTURING
    └── sous-secteurs spécialisés (TAILORING_APPAREL à partir de #607)
```

`MANUFACTURING` possède uniquement la transformation industrielle : nomenclatures, ordres, gammes, centres de travail, besoins matières, exécution, qualité, rebuts et reporting de production.

## Sources de vérité réutilisées

| Besoin Manufacturing | Source canonique |
|---|---|
| Produits finis, composants, unités | `EnterpriseCatalogItem` / `EnterpriseUnitOfMeasure` |
| Sites, entrepôts, emplacements | `EnterpriseSite` / `EnterpriseWarehouse` / `EnterpriseStorageLocation` |
| Disponibilité et journal de stock | `EnterpriseInventoryItem`, `EnterpriseInventoryBalance`, `EnterpriseStockMovement` |
| Commande client source | `EnterpriseSalesOrder` / `EnterpriseSalesOrderItem` |
| Réapprovisionnement de pénurie | `EnterprisePurchase` et Procurement commun |
| Opérateurs | `EnterpriseEmployee` |
| Temps approuvé existant | `EnterpriseTimesheetEntry` |
| Machines / équipements | `EnterpriseAsset` |
| Finance / valorisation | Finance et Accounting communs ; aucune comptabilité Manufacturing parallèle |

Il est interdit d’ajouter `ManufacturingStock`, `ManufacturingCustomer`, `ManufacturingSupplier`, un catalogue Manufacturing ou une comptabilité Manufacturing.

## Modules canoniques

- `MANUFACTURING_OVERVIEW`
- `BILL_OF_MATERIALS`
- `PRODUCTION_ORDERS`
- `PRODUCTION_ROUTINGS`
- `WORK_CENTERS`
- `MATERIAL_REQUIREMENTS`
- `PRODUCTION_EXECUTION`
- `QUALITY_CONTROL`
- `SCRAP_WASTE`
- `PRODUCTION_REPORTS`

Les anciens pseudo-modules `RAW_MATERIALS` et `FINISHED_PRODUCTS` restent uniquement comme traces historiques de template et sont désactivés. Les matières premières et produits finis sont des vues/qualifications du catalogue et du stock communs.

## Contrat des données Manufacturing

### Nomenclature

`EnterpriseBillOfMaterial` référence un article produit du catalogue commun. Chaque `EnterpriseBillOfMaterialLine` référence un composant du même catalogue. Le service revalide toutes les références avec le même `organizationId` et refuse une nomenclature récursive directe ou un composant non stockable lorsque sa consommation doit impacter le stock.

### Ordre de production

`EnterpriseProductionOrder` appartient à une organisation et peut référencer une commande/ligne de vente commune. Les identifiants Sales sont des références sectorielles revalidées côté serveur : Manufacturing n’est jamais la source de vérité de la commande client.

Le cycle cible est :

```text
DRAFT → SUBMITTED → RELEASED → IN_PROGRESS → COMPLETED
                 ↘ REJECTED
DRAFT/SUBMITTED/RELEASED → CANCELLED selon les règles métier
```

La soumission désigne un approbateur actif de l’organisation. L’approbation libère l’ordre après recalcul des besoins et disponibilités.

### Besoins matières

Les besoins sont dérivés de la nomenclature active : quantité de ligne × quantité d’ordre ÷ quantité de sortie de la nomenclature, avec le taux de rebut prévu. Chaque besoin résout un `EnterpriseInventoryItem` canonique et l’entrepôt matière de l’ordre.

La pénurie est calculée depuis `EnterpriseInventoryBalance`. Une demande de réapprovisionnement crée un `EnterprisePurchase` canonique avec une référence source Manufacturing ; aucune commande fournisseur parallèle n’est créée.

### Exécution et stock

Les impacts physiques passent exclusivement par `applyStockMovementTx` dans une transaction sérialisable :

- `PRODUCTION_CONSUMPTION` / `OUT` pour la consommation matière ;
- `PRODUCTION_OUTPUT` / `IN` pour l’entrée du produit fini ;
- `PRODUCTION_SCRAP` / `OUT` uniquement lorsqu’un rebut sort réellement une quantité déjà en stock.

Chaque écriture rejouable possède une clé d’idempotence persistante. `EnterpriseStockMovement` reste immuable et `EnterpriseInventoryBalance` reste la projection transactionnelle canonique.

### Opérateurs, temps et équipements

`EnterpriseProductionExecution` peut référencer :

- un `EnterpriseEmployee` actif ;
- un `EnterpriseAsset` actif ;
- une `EnterpriseTimesheetEntry` appartenant à une timesheet approuvée lorsque le temps a déjà été validé dans le module commun.

Manufacturing ne crée pas une deuxième feuille de temps. Le lien permet de rapprocher l’exécution atelier avec la source RH/Temps canonique.

### Qualité et rebuts

`EnterpriseProductionQualityCheck` conserve les contrôles propres à la fabrication. Un contrôle `HOLD` ou `FAIL` non compensé bloque la clôture lorsque la configuration ou l’opération impose la qualité.

`EnterpriseProductionScrap` conserve la cause et la quantité rebutée. `affectsInventory` est explicite afin de ne pas décrémenter deux fois un composant déjà consommé.

## Accès, abonnements et IA

Tous les modules Manufacturing sont limités au secteur `MANUFACTURING` et passent par le registre canonique : tenant module activé, dépendances, abonnement, permissions de poste et restriction temporaire.

Le socle Manufacturing nécessite au minimum le plan `BUSINESS`. `PRODUCTION_REPORTS` nécessite `ENTERPRISE`. L’outil IA Manufacturing reste en lecture seule, reprend les mêmes autorisations de module et ne contourne jamais les permissions de l’utilisateur.

## Positions initiales

Le template Manufacturing fournit :

- Responsable production ;
- Planificateur production ;
- Opérateur production ;
- Contrôleur qualité.

Les permissions sont bornées par action (`view`, `create`, `update`, `submit`, `approve`, `manage`) et ne donnent pas implicitement un droit d’administration aux managers.

## Couture

`TAILORING_APPAREL` reste `PLANNED` pendant #606. Aucune mesure, patron, gradation, essayage ou retouche n’est ajoutée au Manufacturing Core. Ces extensions appartiennent à #607 et devront référencer les objets Manufacturing au lieu de les dupliquer.

## Rollback

La migration #606 est additive. Le rollback applicatif peut désactiver les modules Manufacturing sans supprimer les tables. Les mouvements de stock déjà écrits restent dans le journal commun et ne sont jamais supprimés. Les anciens codes de template sont conservés désactivés pour audit et compatibilité historique.
