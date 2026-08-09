# SYSCOHADA révisé 2017 — bootstrap provisoire 0.1.0

Programme parent : #147
Itération : #149

## Décision produit

Le 9 août 2026, le propriétaire DTSC a autorisé une exception unique au gate de source fiable afin que le produit dispose immédiatement d'un premier template comptable sélectionnable basé sur le **SYSCOHADA révisé 2017**.

La version `OHADA_SYSCOHADA@0.1.0` est un **bootstrap runtime provisoire non officiel**. Le cadre réglementaire et les dates sont ancrés sur l'AUDCIF 2017 ; les numéros/libellés de comptes de cette version sont recoupés sur plusieurs références indépendantes non officielles.

Fingerprint du bundle de références :

`c4a07dbdd8b0d776cff18fb24cf5bbcc3e7a3ecedc719c4afb9ade4096af316c`

Références de bootstrap :

- `plan-comptable-ohada.com` ;
- `oopidi.com/compta/plan-comptable-syscohada` ;
- `lefisk.cm/blog/plan-comptable-syscohada-revise-liste-comptes`.

En cas d'écart, le texte officiel OHADA prévaut.

## Portée de la version 0.1.0

Le bootstrap est aligné sur l'entrée en vigueur du SYSCOHADA révisé pour les comptes personnels au `2018-01-01` et contient un noyau de comptes couvrant les flux ERP prioritaires : capitaux, dettes, immobilisations, stocks, tiers, TVA, banque, caisse, monnaie électronique/Mobile Money, achats, paie, ventes, change et impôt sur le résultat.

Les semantic mappings restent indépendants des secteurs. Retail, Health, Pharmacy et futurs secteurs consomment des clés métier et ne connaissent pas les numéros réglementaires.

Cette version n'est **pas une reproduction exhaustive et certifiée** du plan officiel. Elle sert à rendre le moteur fonctionnel et à permettre l'exécution des itérations 3 à 8.

## Ce que 0.1.0 autorise

- apparaître dans le registre canonique des templates ;
- être sélectionnée comme template `PUBLISHED` de bootstrap ;
- être appliquée uniquement via le service canonique et ses protections existantes ;
- servir aux développements et tests des itérations 3 à 8 ;
- être remplacée ultérieurement par une version officielle/revue sans réécrire les écritures historiques.

## Ce que 0.1.0 n'autorise pas

- aucune déclaration de conformité réglementaire ;
- aucun statut `ACCOUNTING_TEMPLATE_PRODUCTION_READY` ;
- aucune revendication d'exhaustivité du dataset ;
- aucun contournement des protections tenant/RBAC/périodes/posting ;
- aucune extension de cette dérogation à une version ultérieure.

## Politique des versions suivantes

À partir de toute version différente de `0.1.0`, le gate normal redevient obligatoire :

`source officielle ou légalement exploitable → fingerprint source → dataset structuré relu → validation déterministe → fingerprint dataset → revue comptable → DATASET_VERIFIED → AUTHORIZED_FOR_DTSC_IMPLEMENTATION → PUBLISHED`.

Le pipeline déterministe livré par #159 reste volontairement strict et continue d'exiger une source vérifiée pour `1.0.0` et les versions ultérieures.

## Limites comptables connues

- la sélection de comptes de 0.1.0 est volontairement réduite ;
- les traductions EN ne sont pas revendiquées comme libellés réglementaires ;
- les journaux versionnés, overlays pays, fiscalité détaillée et états réglementaires sont traités dans les itérations suivantes ;
- les classifications et mappings bootstrap doivent être revus avant toute promotion réglementaire ;
- l'absence d'un compte dans 0.1.0 ne signifie pas son absence du SYSCOHADA révisé.

## Règle de migration

La future version officielle ne doit jamais modifier silencieusement un plan actif. Le moteur de diff/migration de l'itération 8 doit préserver la filiation de `0.1.0`, expliquer les écarts et appliquer toute transition de manière contrôlée et auditée.
