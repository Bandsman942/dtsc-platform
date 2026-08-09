# DTSC Accounting Framework & Chart Template Architecture

Programme parent: #147
Itération: #148 — Comptabilité 1/8

## Objectif

Cette architecture établit la fondation multi-référentiel de DTSC ERP. Elle sépare les référentiels juridiques/comptables, les templates distribués par DTSC et les plans réellement exploités par les organisations clientes.

Le but de l’itération 1 n’est pas d’implanter le SYSCOHADA. Il est de garantir qu’un référentiel comme SYSCOHADA, SYCEBNL ou un futur référentiel puisse être ajouté sans modifier les moteurs métier Retail, Health, Pharmacy ou les futurs secteurs.

## Modèle conceptuel

Le flux canonique est :

`Framework Registry → Chart Template → Template Version → Organization Chart → Semantic Account Mapping → Posting Engine`.

### Framework Registry

Un `Accounting Framework` représente le cadre comptable de référence. Il porte un code stable, une nature `GENERIC` ou `REGULATORY`, les juridictions/types d’entités concernés et une provenance.

Le framework initial `DTSC_GENERIC` existe uniquement pour préserver le template historique `GENERIC_SMALL_BUSINESS`. Il ne constitue pas une norme réglementaire.

### Chart Template

Un `Chart Template` est un paquet DTSC structuré appartenant à un framework. Il contient les groupes, comptes, métadonnées, mappings sémantiques, journaux et mappings d’états qui pourront être enrichis au fil des itérations.

Aucun template réglementaire majeur ne doit être ajouté directement dans `master-service.ts`.

### Template Version

Chaque template possède une version explicite `x.y.z`, des dates d’effet et une source. Une version `PUBLISHED` est traitée comme immutable dans le code : elle est chargée depuis un dataset versionné et deep-frozen par le registre.

Une modification réglementaire ou structurelle future doit créer une nouvelle version. Elle ne doit jamais réécrire silencieusement une version publiée déjà adoptée.

### Organization Chart

Le `Organization Chart` reste le plan tenant-scoped matérialisé par `EnterpriseChartOfAccounts`, `EnterpriseAccountGroup` et `EnterpriseLedgerAccount`.

Pendant l’itération 1, `EnterpriseChartOfAccounts.templateCode` continue de stocker le code legacy du template pour compatibilité. La persistance complète de la filiation `framework/template/version/adoption` appartient à l’itération 3 (#150) et devra être additive.

### Semantic Account Mapping

Les modules métier doivent exprimer des intentions comptables par des clés sémantiques, pas par des numéros réglementaires. `EnterpriseAccountMapping` reste la base de cette résolution.

L’itération 4 (#151) généralisera cette couche. Les secteurs ne doivent pas coder de numéros SYSCOHADA en dur.

## Registre canonique

Le registre vit dans :

- `lib/enterprise/accounting/chart-template-types.ts` ;
- `lib/enterprise/accounting/chart-template-registry.ts` ;
- `lib/enterprise/accounting/templates/*.json` ;
- `lib/enterprise/accounting/chart-template-application-service.ts`.

Il expose les contrats internes stables :

- `listAccountingFrameworks()` ;
- `getAccountingFramework()` ;
- `listChartTemplates()` ;
- `getChartTemplate()` ;
- `validateChartTemplate()` ;
- `validateRegisteredChartTemplates()` ;
- `applyDraftChartTemplate()`.

## Validation structurelle

Le registre vérifie avant utilisation :

- code et version du template ;
- date d’effet ;
- framework connu ;
- provenance minimale ;
- unicité des groupes et comptes ;
- types/sous-types compatibles avec les constantes Finance ;
- parents présents ;
- absence de cycle de comptes ;
- groupes référencés présents ;
- mappings sémantiques pointant vers un compte existant ;
- types de journaux connus ;
- mappings d’états pointant vers des comptes existants.

Le QA `scripts/qa-accounting-framework-registry.mjs`, inclus dans `qa:enterprise-accounting` via le gate existant, protège également la migration legacy.

## Application d’un template

`applyDraftChartTemplate()` a été déplacé hors de `master-service.ts` vers un service dédié.

Le contrat historique est préservé :

1. le chart doit appartenir à l’organisation ;
2. il doit être `DRAFT` ;
3. il ne doit contenir aucun compte ;
4. l’organisation ne doit avoir aucune écriture `POSTED` ;
5. le template doit être `PUBLISHED` et présent dans le registre ;
6. l’opération s’exécute en transaction `Serializable`.

Le moteur applique les groupes puis les comptes par couches hiérarchiques, ce qui prépare les futurs templates complexes sans introduire de dépendance à un secteur.

## Compatibilité `GENERIC_SMALL_BUSINESS`

Le template historique a été extrait de `master-service.ts` vers `templates/generic-small-business.v1.json` sous la référence conceptuelle :

`GENERIC_SMALL_BUSINESS@1.0.0`.

La matérialisation en base continue volontairement d’enregistrer `templateCode = GENERIC_SMALL_BUSINESS` pendant cette itération afin de ne pas casser les données existantes.

Les 13 comptes legacy, leurs codes, libellés, types, sous-types, statut système et règles `allowDirectPosting` restent inchangés. Les comptes `ACCOUNTS_RECEIVABLE` et `ACCOUNTS_PAYABLE` restent non saisissables directement, sans introduire un nouveau comportement `isControlAccount`.

## Provenance

Chaque framework/template doit déclarer au minimum :

- `source.kind` ;
- `source.authority` ;
- `source.reference` ;
- `source.verifiedAt` ;
- `effectiveFrom` ;
- `version`.

Pour un référentiel réglementaire futur, `source.kind` devra être `OFFICIAL` ou `LICENSED` selon le support légal réellement utilisé par DTSC.

Aucune donnée réglementaire ne doit être inventée à partir de conventions internes.

## SYSCOHADA et SYCEBNL

SYSCOHADA et SYCEBNL sont explicitement hors périmètre de l’itération 1. Ils seront ajoutés comme frameworks/templates versionnés dans les itérations suivantes, à partir de sources officielles ou légalement exploitables.

Le moteur générique doit rester indépendant de leurs numéros, classes et états spécifiques.

## Versionnement et immutabilité

Règles durables :

- une version `PUBLISHED` est immutable ;
- une correction crée une nouvelle version ;
- un template actif dans une organisation ne doit jamais être remplacé silencieusement ;
- les écritures `POSTED` ne sont jamais réécrites pour suivre une nouvelle version ;
- un diff/moteur de migration contrôlé sera ajouté en itération 8 (#155).

## Décision Prisma de l’itération 1

Aucune migration Prisma n’est nécessaire dans cette itération.

Raison : le besoin immédiat est de créer la source canonique des templates et de préserver l’existant. Ajouter maintenant des tables d’adoption/version organisationnelle introduirait prématurément le lifecycle de l’itération 3.

La future persistance de la version source devra être additive, tenant-aware et accompagnée d’une migration versionnée.

## Anti-hardcode sectoriel

Interdictions :

- numéro SYSCOHADA dans un builder Retail/Health/Pharmacy ;
- tableau local de comptes réglementaires dans un secteur ;
- fallback silencieux d’une clé sémantique vers un numéro de compte ;
- duplication du registre dans un module sectoriel ;
- mutation d’un dataset `PUBLISHED` sans changement de version.

## Étapes suivantes

- #149 : référentiel SYSCOHADA canonique et versionné ;
- #150 : adoption/personnalisation par organisation et persistance de filiation ;
- #151 : couverture exhaustive des Semantic Account Mapping ;
- #152 : journaux, overlays pays et fiscalité ;
- #153 : états financiers ;
- #154 : UX/onboarding ;
- #155 : migration de versions et acceptance Production.
