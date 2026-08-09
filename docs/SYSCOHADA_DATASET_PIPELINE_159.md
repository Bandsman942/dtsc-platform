# SYSCOHADA — pipeline déterministe du dataset canonique

Programme parent : #147
Itération : #149
Sous-livraison : #159

## Objectif

Cette tranche construit le mécanisme technique qui transformera une source SYSCOHADA vérifiée en dataset canonique DTSC. Elle ne contient volontairement **aucun compte SYSCOHADA réel**.

Le pipeline doit empêcher qu’un développeur transforme directement une copie de PDF, un miroir Internet ou une extraction non revue en template de production.

## Chaîne de confiance

`Fichier officiel/légalement exploitable → fingerprint source → extraction structurée revue → validation → normalisation déterministe → fingerprint dataset → template DRAFT → revue comptable → DATASET_VERIFIED → autorisation → PUBLISHED`.

Les états de provenance définis par #158 restent opposables :

- `SOURCE_FILE_REQUIRED` ;
- `SOURCE_FILE_VERIFIED` ;
- `DATASET_VERIFIED`.

Le pipeline de #159 refuse la génération réelle tant que le manifeste n’est pas au moins `SOURCE_FILE_VERIFIED` avec un SHA-256 source valide.

## Schéma d’entrée

Le contrat JSON versionné se trouve dans :

`lib/enterprise/accounting/templates/syscohada/dataset-schema.v1.json`.

Il décrit un **dataset déjà relu**, pas une sortie OCR brute.

Chaque groupe/compte exige notamment :

- un code ;
- le libellé français officiel ;
- un libellé anglais DTSC séparé ;
- un statut de traduction `PENDING` ou `REVIEWED` ;
- un type comptable DTSC explicite ;
- la hiérarchie ;
- les règles de saisie/contrôle ;
- un `sourceLocator` permettant de revenir à la source réglementaire.

Le dataset porte également le SHA-256 du fichier source et l’identité de la revue humaine.

## Validation

`scripts/accounting/syscohada-dataset-lib.mjs` vérifie :

- identité framework/template/version ;
- lien SHA-256 avec le manifeste de source ;
- source vérifiée avant génération ;
- dates et scope ;
- codes de groupes uniques ;
- parents de groupes présents ;
- absence de cycles de groupes ;
- comptes uniques ;
- types/sous-types DTSC autorisés ;
- groupes référencés présents ;
- parents de comptes présents ;
- cohérence type enfant/parent ;
- cohérence des niveaux ;
- absence de cycles de comptes ;
- flags de contrôle/saisie valides ;
- compte de contrôle non saisissable directement ;
- `sourceLocator` obligatoire ;
- statut explicite des traductions.

La validation ne déduit pas automatiquement la nature comptable à partir du numéro de compte : la classification DTSC doit être revue et fournie explicitement.

## Normalisation et déterminisme

Le normaliseur :

- nettoie les champs textuels ;
- trie les groupes par ordre puis code ;
- trie les comptes par code ;
- trie les scopes ;
- ordonne récursivement les clés JSON ;
- produit une sérialisation canonique stable.

Le SHA-256 du dataset est calculé sur cette représentation canonique. Ainsi, deux entrées sémantiquement identiques mais ordonnées différemment produisent le même fingerprint.

## Génération du template

Le générateur ne produit qu’un template :

`status = DRAFT`.

Il ne génère **jamais** automatiquement :

- les semantic mappings ERP ;
- les journaux ;
- les mappings d’états financiers ;
- des libellés réglementaires absents ;
- des numéros de comptes ;
- des règles fiscales.

Ces éléments sont des livrables des étapes de revue et des itérations suivantes.

## CLI

Dry-run :

`node scripts/accounting/build-syscohada-dataset.mjs --input <dataset-revu.json> --dry-run`

Le dry-run valide et imprime le rapport d’intégrité sans écrire de fichiers.

Génération contrôlée :

`node scripts/accounting/build-syscohada-dataset.mjs --input <dataset-revu.json> --out <dataset-normalise.json> --template-out <template-draft.json> --report <rapport.json>`

Le manifeste peut être remplacé explicitement avec `--manifest` pour les procédures de validation contrôlées.

## Rapport d’intégrité

Le rapport machine-readable contient au minimum :

- `valid` ;
- liste des issues ;
- `datasetSha256` ;
- `accountCount` ;
- `groupCount` ;
- nombre de traductions en attente ;
- nombre de localisateurs source distincts.

Le rapport ne remplace pas la revue comptable humaine.

## Tests

`scripts/qa-syscohada-dataset-pipeline.mjs` utilise exclusivement des fixtures synthétiques clairement identifiées.

Il prouve notamment :

- acceptation d’une structure valide synthétique ;
- déterminisme du hash malgré l’ordre d’entrée ;
- génération `DRAFT` uniquement ;
- absence de mappings/journaux/états inventés ;
- refus lorsque la source n’est pas vérifiée ;
- détection des doublons ;
- détection des parents absents ;
- détection des niveaux incohérents ;
- détection d’un SHA source différent ;
- représentation explicite des traductions en attente.

Le gate est branché sur `qa:enterprise-accounting`, donc sur `qa:regression`.

## Mise à jour du manifeste après ingestion réelle

Quand DTSC disposera d’un fichier source officiellement vérifié :

1. calculer son SHA-256 avec `verify-syscohada-source.mjs` ;
2. passer le manifeste à `SOURCE_FILE_VERIFIED` avec nom, SHA, taille, date et acteur ;
3. construire manuellement/assisté le dataset structuré avec `sourceLocator` pour chaque élément ;
4. exécuter le pipeline en dry-run ;
5. corriger toutes les issues ;
6. générer dataset normalisé + template DRAFT + rapport ;
7. faire la revue comptable ;
8. renseigner `canonicalDataset.path`, `sha256`, compteurs et date ;
9. seulement après validation suffisante, passer à `DATASET_VERIFIED` ;
10. la publication reste en plus conditionnée par `AUTHORIZED_FOR_DTSC_IMPLEMENTATION`.

## Non-objectifs

#159 ne clôt pas #149 et n’implante pas le plan comptable réel. La prochaine donnée réglementaire ne doit entrer dans Git qu’avec la provenance et la revue prévues par ce pipeline.
