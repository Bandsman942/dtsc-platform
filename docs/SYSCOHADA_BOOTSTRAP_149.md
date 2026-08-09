# SYSCOHADA — bootstrap provisoire 0.1.0

Programme parent : #147  
Itération : #149

## Décision produit

Le 9 août 2026, le propriétaire DTSC a autorisé une exception unique au gate de source fiable afin que le produit dispose immédiatement d'un premier template comptable sélectionnable.

La version `OHADA_SYSCOHADA@0.1.0` est donc un **bootstrap runtime provisoire**. Elle est construite depuis le document utilisateur `Ohada-Acte-Uniforme-2000-plan-des-comptes.pdf`, dont le SHA-256 est :

`ab1603afc1d2664fc7d6a05160aa895526ad864b922bd11858f8e976020d7627`

Le document fourni est une copie Droit-Afrique du plan comptable OHADA suivant l'acte uniforme du 22 février 2000. Il ne doit pas être présenté comme une copie officielle du SYSCOHADA révisé porté par l'AUDCIF 2017.

## Portée de la version 0.1.0

La version bootstrap contient un noyau fonctionnel de comptes nécessaires aux flux ERP les plus courants : capitaux, dettes, immobilisations, stocks, tiers, TVA, banque, caisse, achats, charges, paie, ventes et change.

Elle fournit aussi un premier ensemble de semantic mappings génériques pour que le moteur Finance puisse résoudre les principaux événements sans introduire de numéros SYSCOHADA dans Retail, Health ou Pharmacy.

Cette version n'est **pas une reproduction exhaustive** des 9 classes et 1 172 comptes/sous-comptes détectés dans le PDF. L'extraction complète reste un matériau de travail pour la version canonique revue.

## Ce que 0.1.0 autorise

- apparaître dans le registre canonique des templates ;
- être sélectionnée comme template `PUBLISHED` de bootstrap ;
- être appliquée uniquement via le service canonique et ses protections existantes ;
- servir aux développements des itérations 3 à 8 ;
- être remplacée ultérieurement par une version officielle/revue sans réécrire les écritures historiques.

## Ce que 0.1.0 n'autorise pas

- aucune déclaration de conformité réglementaire ;
- aucun statut `ACCOUNTING_TEMPLATE_PRODUCTION_READY` ;
- aucune affirmation « SYSCOHADA révisé 2017/2026 » pour les données provenant de ce PDF ;
- aucun contournement des protections tenant/RBAC/périodes/posting ;
- aucune extension de cette dérogation à une version ultérieure.

## Politique des versions suivantes

À partir de toute version différente de `0.1.0`, le gate normal redevient obligatoire :

`source officielle ou légalement exploitable → fingerprint source → dataset structuré relu → validation déterministe → fingerprint dataset → revue comptable → DATASET_VERIFIED → AUTHORIZED_FOR_DTSC_IMPLEMENTATION → PUBLISHED`.

Le pipeline déterministe livré par #159 reste volontairement inchangé et continue d'exiger une source vérifiée.

## Limites comptables connues

- la sélection de comptes de 0.1.0 est volontairement réduite ;
- les libellés anglais réglementaires ne sont pas revendiqués ;
- les journaux versionnés, overlays pays, fiscalité détaillée et états réglementaires relèvent des itérations suivantes ;
- les classifications et mappings bootstrap devront être revus par un professionnel comptable avant promotion réglementaire ;
- l'absence d'un compte dans 0.1.0 ne signifie pas son absence du référentiel OHADA.

## Règle de migration

La future version officielle ne devra jamais modifier silencieusement un plan actif. Le moteur de diff/migration de l'itération 8 doit préserver la filiation de `0.1.0`, expliquer les écarts et appliquer toute transition de manière contrôlée et auditée.
