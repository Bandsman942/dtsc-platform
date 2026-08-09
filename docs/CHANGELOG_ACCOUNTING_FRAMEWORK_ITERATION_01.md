# Changelog — Programme comptable DTSC, itération 1/8

Issue: #148
Programme parent: #147

## Objet

Fondation du moteur universel de référentiels et templates comptables DTSC.

## Changements

- création des contrats `Accounting Framework`, `Chart Template`, `Template Version`, groupes, comptes, semantic mappings, journaux et financial statement mappings ;
- création du registre canonique `chart-template-registry.ts` ;
- ajout d’une validation structurelle des templates ;
- ajout d’un mécanisme d’immutabilité runtime des versions publiées ;
- migration du template historique `GENERIC_SMALL_BUSINESS` vers un dataset versionné `1.0.0` ;
- extraction de `applyDraftChartTemplate()` vers un service dédié ;
- conservation des protections historiques `DRAFT`, absence de comptes et absence d’écritures `POSTED` ;
- application hiérarchique future-ready des groupes et comptes ;
- validation d’un `templateCode` fourni lors de la création d’un chart ;
- ajout du gate `qa-accounting-framework-registry.mjs`, exécuté par `qa:enterprise-accounting` et donc `qa:regression` ;
- ajout des règles durables dans `lib/enterprise/accounting/AGENTS.md` ;
- documentation de l’architecture et des frontières avec les itérations SYSCOHADA, adoption, mappings et migration.

## Compatibilité

Aucune migration Prisma n’est ajoutée.

Le template `GENERIC_SMALL_BUSINESS` conserve :

- son code public ;
- ses 13 comptes historiques ;
- les mêmes codes, libellés, types et sous-types ;
- `isSystemAccount = true` ;
- l’interdiction de saisie directe sur les comptes clients et fournisseurs ;
- le comportement historique `isControlAccount = false`.

`EnterpriseChartOfAccounts.templateCode` continue d’enregistrer `GENERIC_SMALL_BUSINESS` afin d’éviter une rupture de données. La persistance de la version source sera traitée dans l’itération 3 (#150).

## Hors périmètre confirmé

- aucun compte SYSCOHADA n’est ajouté ;
- aucun dataset SYCEBNL n’est ajouté ;
- aucune règle fiscale pays n’est ajoutée ;
- aucun état financier réglementaire nouveau n’est ajouté ;
- aucune promotion de maturité commerciale n’est effectuée.
