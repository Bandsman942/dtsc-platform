# Architecture sectorielle générique — Secteur → Sous-secteur

Statut : contrat d’implémentation du programme #604, itération #605.

## 1. Objectif

DTSC Platform doit représenter les spécialisations métier selon une hiérarchie stable :

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

## 3. Source canonique de classification

`lib/enterprise/business-subtype-registry.ts` devient le registre de métadonnées de classification inter-secteurs.

Il contient :

- le `sectorCode` propriétaire ;
- le `code` de sous-secteur ;
- les labels FR/EN ;
- les descriptions FR/EN ;
- le statut d’implémentation `ACTIVE|PLANNED`.

Le registre ne possède pas les règles runtime d’un secteur. Le scope de modules, le provisioning et les règles métier restent dans le domaine sectoriel concerné.

## 4. Compatibilité Retail

`lib/enterprise/retail/subtype-registry.ts` reste un adaptateur de compatibilité Retail :

- il conserve `RetailBusinessSubtypeCode = "SHOP"` ;
- il conserve `RETAIL_MODULE_CODES` comme autorité du scope Shop ;
- il consomme les labels/descriptions du registre générique ;
- il préserve la lecture historique des configurations Retail existantes ;
- il ne transforme pas `TAILORING_APPAREL` en sous-type Retail.

Aucun changement de comportement Shop n’est autorisé dans cette étape.

## 5. Règles permanentes

1. Un sous-secteur appartient à un seul secteur canonique.
2. Un code inconnu ou associé au mauvais secteur est refusé côté serveur.
3. Un sous-secteur `PLANNED` n’est jamais proposé comme option active.
4. La preview Administration DTSC et le provisioning doivent utiliser le même résolveur générique avant la fin de #605.
5. Les entreprises historiques restent rétrocompatibles pendant le cutover.
6. Le Core ERP reste source de vérité pour CRM, catalogue, ventes, achats, stock, RH, finance, projets, actifs, documents, workflows, reporting et IA.
7. Aucune migration historique n’est réécrite.
8. Tout stockage de classification ajouté dans #605 doit être additif et cohérent avec le couple secteur/sous-secteur.
9. Toute surface visible respecte i18n, mobile, clair/sombre, accessibilité et `docs/FORM_UX_CONTRACT.md`.
10. Aucun module sectoriel absent du registre canonique ou non implémenté ne peut devenir actif.

## 6. Découpage de l’itération #605

### Slice A — registre générique et adaptateur Retail

- introduire le registre cross-sector ;
- déplacer la métadonnée `SHOP` vers ce registre ;
- conserver les règles de modules dans Retail ;
- déclarer `TAILORING_APPAREL` en `PLANNED` uniquement.

### Slice B — persistance et validation génériques

- ajouter le stockage de classification nécessaire ;
- valider le couple secteur/sous-secteur côté serveur ;
- préserver le bridge historique Retail sans dual-write permanent.

### Slice C — preview et provisioning

- remplacer les branches Retail spécifiques par un résolveur générique ;
- garantir le même résultat `COMMERCE_RETAIL + SHOP` qu’avant ;
- conserver les modules inconnus/non implémentés fail-closed.

### Slice D — Administration DTSC et QA

- combobox de sous-secteur pilotée par le secteur ;
- options actives uniquement ;
- FR/EN et contrat formulaire ;
- QA Retail + classification + régression + E2E Administration DTSC.

## 7. Rollback

Le rollback de la Slice A consiste à revenir au registre Retail local antérieur. Aucune donnée n’est migrée dans cette slice et aucune donnée tenant n’est modifiée.

Les slices suivantes devront documenter leur rollback spécifique avant merge.

## 8. Dette de contribution

Dette créée attendue : **Aucune**.

Le bridge Retail existant est une compatibilité historique explicitement couverte par #605. Toute nouvelle compatibilité temporaire doit être bornée, testée et reliée à une Issue si elle survit à l’itération.
