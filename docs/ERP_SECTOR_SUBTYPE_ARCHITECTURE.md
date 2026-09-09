# Architecture sectorielle générique — Secteur → Sous-secteur

Statut : contrat d’implémentation du programme #604, itération #605.

## 1. Objectif

DTSC Platform représente les spécialisations métier selon une hiérarchie stable :

```text
ERP commun
  ↓
Secteur
  ↓
Sous-secteur métier optionnel
```

Le sous-secteur ne remplace jamais le secteur et ne crée jamais une deuxième source de vérité pour les domaines ERP communs.

## 2. Classifications initiales

### Commerce Retail

```text
COMMERCE_RETAIL
├── aucun sous-secteur → Commerce retail général
└── SHOP                → Retail général + modules Shop
```

`SHOP` reste actif et rétrocompatible avec les entreprises Retail historiques.

### Manufacturing

```text
MANUFACTURING
├── aucun sous-secteur  → Manufacturing général
└── TAILORING_APPAREL   → Couture, confection & habillement
```

Dans l’itération #605, `TAILORING_APPAREL` est uniquement déclaré `PLANNED`. Il ne devient pas sélectionnable et ne doit activer aucun module tant que les itérations Manufacturing dédiées n’ont pas livré modèle, services, routes, workspaces, permissions, entitlements et QA réels.

## 3. Sources de vérité

### Registre de classification

`lib/enterprise/business-subtype-registry.ts` est l’autorité inter-secteurs des sous-secteurs disponibles.

Il contient :

- le `sectorCode` propriétaire ;
- le code de sous-secteur ;
- les labels FR/EN ;
- les descriptions FR/EN ;
- le statut d’implémentation `ACTIVE|PLANNED`.

Le registre ne possède pas les règles runtime d’un secteur. Le scope de modules, le provisioning et les règles métier restent dans le domaine sectoriel concerné.

### Choix d’une organisation

`EnterpriseBusinessSubtypeSelection` persiste uniquement le choix de classification d’une organisation :

- `organizationId` unique ;
- `sectorCode` ;
- `businessSubtypeCode` nullable ;
- version du contrat ;
- origine de la sélection et acteur DTSC éventuel.

Cette table n’est pas un second registre : une valeur persistée n’est utilisable que si le registre code confirme encore que le sous-secteur est `ACTIVE` et appartient au secteur courant de l’organisation. Le service `lib/enterprise/business-subtype-selection.ts` revalide également que l’organisation existe et porte le même `sectorCode` avant toute écriture.

## 4. Compatibilité Retail

`lib/enterprise/retail/subtype-registry.ts` reste un adaptateur de compatibilité Retail :

- il conserve `RetailBusinessSubtypeCode = "SHOP"` ;
- il conserve `RETAIL_MODULE_CODES` comme autorité du scope Shop ;
- il consomme les labels/descriptions du registre générique ;
- il préserve la lecture historique des configurations Retail existantes ;
- il ne transforme pas `TAILORING_APPAREL` en sous-type Retail.

`EnterpriseRetailConfiguration.settingsJson` reste temporairement le miroir de compatibilité du runtime Shop. Les nouveaux flux Administration DTSC écrivent la classification générique puis synchronisent ce miroir uniquement pour Retail. Il ne devient pas l’autorité inter-secteurs.

Aucun changement de comportement Shop n’est autorisé dans cette étape.

## 5. Backfill #605

La migration additive `20260909002000_generic_business_subtype_selection` crée la table de sélection et initialise les organisations existantes sans réécrire aucune migration historique.

Règles de backfill :

1. organisation sans `sectorCode` : aucune ligne créée ;
2. secteur non Retail : sous-secteur `null` ;
3. Retail avec marqueur #512 explicite et `businessSubtypeCode = SHOP` : `SHOP` ;
4. Retail avec marqueur #512 explicite sans `SHOP` : `null`, donc Commerce retail général ;
5. Retail historique sans marqueur #512 : `SHOP`, afin de préserver le comportement antérieur au cutover.

Le backfill est idempotent grâce à l’unicité `organizationId` et `ON CONFLICT DO NOTHING`.

## 6. Règles permanentes

1. Un sous-secteur appartient à un seul secteur canonique.
2. Un code inconnu ou associé au mauvais secteur est refusé côté serveur.
3. Un sous-secteur `PLANNED` n’est jamais proposé comme option active.
4. La preview Administration DTSC et le provisioning utilisent le même résolveur générique.
5. Les entreprises historiques restent rétrocompatibles pendant le cutover.
6. Le Core ERP reste source de vérité pour CRM, catalogue, ventes, achats, stock, RH, finance, projets, actifs, documents, workflows, reporting et IA.
7. Aucune migration historique n’est réécrite.
8. Le stockage de classification est additif et cohérent avec le couple secteur/sous-secteur.
9. Toute surface visible respecte i18n, mobile, clair/sombre, accessibilité et `docs/FORM_UX_CONTRACT.md`.
10. Aucun module sectoriel absent du registre canonique ou non implémenté ne peut devenir actif.
11. Administration DTSC ne lit ni ne pré-remplit aucune donnée métier privée du tenant pour déterminer cette classification.

## 7. Flux Administration DTSC

Le formulaire de création ne possède plus de branche `Retail` codée en dur.

1. DTSC sélectionne un secteur.
2. `GET /api/admin/sector-templates` retourne la preview et les sous-secteurs `ACTIVE` autorisés pour ce secteur.
3. La combobox de sous-secteur apparaît uniquement lorsqu’au moins une option active existe.
4. La sélection est renvoyée comme `businessSubtypeCode`.
5. Le serveur revalide le couple secteur/sous-secteur.
6. Si le template est appliqué, le wrapper canonique persiste la classification, applique le template et exécute le normaliseur fail-closed des modules.
7. Si le template est différé, la classification est tout de même persistée ; pour Retail seulement, le miroir historique est synchronisé.

Ainsi `COMMERCE_RETAIL → SHOP` continue de fonctionner, mais le formulaire n’a aucune connaissance codée en dur de Shop. `MANUFACTURING → TAILORING_APPAREL` restera invisible tant que ce dernier est `PLANNED`.

## 8. Découpage de l’itération #605

### Slice A — registre générique et adaptateur Retail

- registre cross-sector ;
- métadonnée `SHOP` dans ce registre ;
- règles de modules conservées dans Retail ;
- `TAILORING_APPAREL` déclaré `PLANNED` uniquement.

### Slice B — persistance et validation génériques

- modèle `EnterpriseBusinessSubtypeSelection` ;
- migration additive et backfill rétrocompatible ;
- validation serveur du couple secteur/sous-secteur ;
- bridge historique Retail conservé pendant le cutover.

### Slice C — preview et provisioning

- résolveur générique en entrée de preview et de provisioning ;
- même résultat `COMMERCE_RETAIL + SHOP` qu’avant ;
- modules inconnus/non implémentés conservés fail-closed.

### Slice D — Administration DTSC et QA

- combobox de sous-secteur pilotée par les données de l’API ;
- options `ACTIVE` uniquement ;
- libellés nouveaux FR/EN dans le dictionnaire Console ;
- QA Retail + classification + régression + E2E Administration DTSC.

## 9. Rollback

Le rollback applicatif consiste à revenir au registre/formulaire antérieurs et à continuer de lire le miroir Retail historique pour Shop.

La table `EnterpriseBusinessSubtypeSelection` est additive. En rollback applicatif, elle peut rester présente sans être consommée : elle ne remplace ni les données ERP communes ni les données Retail. Sa suppression physique ne fait pas partie du rollback normal et ne doit être envisagée qu’après une migration ultérieure explicite.

Aucune donnée métier du tenant n’est supprimée ou transformée par #605.

## 10. Dette de contribution

Dette créée attendue : **Aucune**.

Le miroir `EnterpriseRetailConfiguration.settingsJson` est une compatibilité historique bornée au cutover Retail. L’autorité de classification inter-secteurs est désormais le registre générique + la sélection d’organisation. Toute nouvelle compatibilité temporaire doit être bornée, testée et reliée à une Issue si elle survit à l’itération.
