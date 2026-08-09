# SYSCOHADA — provenance de la source réglementaire

Programme parent : #147
Itération : #149 — Comptabilité 2/8
Dernière vérification réglementaire : 2026-08-09

## Décision

DTSC ne publie pas un template SYSCOHADA à partir d’un blog, d’une copie Scribd, d’un dépôt tiers ou d’une reconstruction de mémoire.

Le référentiel `OHADA_AUDCIF` peut être enregistré dès que l’identité du texte officiel est vérifiée. En revanche, le dataset détaillé du Plan comptable général OHADA ne peut passer au statut `PUBLISHED` que lorsqu’un fichier source officiel ou légalement exploitable a été obtenu, fingerprinté et validé.

## Sources officielles vérifiées

### Page officielle OHADA — AUDCIF

URL : https://www.ohada.org/en/uniform-act-relating-to-accounting-law-and-financial-information-audcif/

La page officielle indique notamment :

- adoption de l’AUDCIF le 26 janvier 2017 ;
- publication au Journal Officiel le 15 février 2017 ;
- entrée en vigueur le 1er janvier 2018 pour les comptes personnels des entités ;
- entrée en vigueur le 1er janvier 2019 pour les comptes consolidés, les comptes combinés et les états financiers IFRS concernés ;
- annexion du SYSCOHADA révisé à l’AUDCIF ;
- composition du SYSCOHADA révisé : Plan comptable général OHADA + dispositif comptable des comptes consolidés et combinés.

### Bibliothèque numérique OHADA — notice 4847

URL : https://biblio.ohada.org/index.php?id=4847&lvl=notice_display

La notice officielle identifie :

- l’OHADA comme auteur ;
- OHADA, Yaoundé, 2017 comme éditeur/publication ;
- le support comme `Document électronique` ;
- la langue française ;
- deux documents numériques, dont une version complète signée et un document AUDCIF.

Au moment de la vérification, le contenu crawlable de la notice ne fournit pas l’URL directe de téléchargement de ces documents numériques. Aucun lien direct non vérifié ne sera reconstitué par supposition.

## États du manifeste

Le fichier canonique est :

`lib/enterprise/accounting/templates/syscohada/source-manifest.json`

### `SOURCE_FILE_REQUIRED`

La provenance institutionnelle du texte est connue mais aucun fichier source exploitable n’a encore été validé localement.

Conséquences :

- aucun template `OHADA_SYSCOHADA` ne peut être `PUBLISHED` ;
- aucun dataset de comptes n’est considéré canonique ;
- aucun numéro de compte réglementaire n’est introduit depuis un miroir non officiel.

### `SOURCE_FILE_VERIFIED`

Un fichier officiel ou légalement exploitable a été obtenu et sa preuve technique est enregistrée :

- nom du fichier ;
- SHA-256 ;
- taille ;
- date de vérification ;
- acteur de vérification.

Le passage à cet état ne signifie pas que le dataset comptable est validé.

### `DATASET_VERIFIED`

Le dataset structuré issu de la source vérifiée a été produit, contrôlé et fingerprinté :

- chemin du dataset ;
- SHA-256 ;
- date de génération ;
- nombre de comptes ;
- nombre de groupes ;
- contrôles hiérarchiques et comptables verts.

Un template SYSCOHADA ne peut être publié que si :

1. `verificationStatus = DATASET_VERIFIED` ;
2. `legalUseStatus = AUTHORIZED_FOR_DTSC_IMPLEMENTATION` ;
3. le dataset est structurellement valide ;
4. la revue comptable prévue par #149 a été réalisée selon le niveau de publication visé.

## Statut juridique d’utilisation

Le manifeste distingue la provenance de la source de l’autorisation d’utilisation du contenu dans le produit.

- `REVIEW_REQUIRED` : la source officielle est identifiée, mais DTSC ne déclare pas encore l’usage du contenu autorisé pour l’implantation produit ;
- `AUTHORIZED_FOR_DTSC_IMPLEMENTATION` : l’usage retenu a été validé selon la gouvernance DTSC.

Cette distinction évite de transformer la simple accessibilité d’un document en conclusion juridique automatique sur sa réutilisation.

## Fingerprint d’un fichier source

Le script :

`node scripts/accounting/verify-syscohada-source.mjs --source <fichier>`

produit :

- `fileName` ;
- `sha256` ;
- `sizeBytes` ;
- `verifiedAt`.

Une empreinte attendue peut être imposée avec :

`--expected-sha256 <sha256>`.

Le script ne publie ni ne copie le fichier source dans Git. Le stockage du document d’origine doit respecter le droit d’utilisation applicable et la politique documentaire DTSC.

## Gate CI/CD

`scripts/qa-syscohada-source-provenance.mjs` est exécuté par `qa:enterprise-accounting`, donc par `qa:regression`.

Il vérifie au minimum :

- l’existence du manifeste ;
- l’identité `OHADA_AUDCIF` / `OHADA_SYSCOHADA` ;
- les URLs institutionnelles OHADA ;
- les dates réglementaires structurées ;
- la présence du framework officiel dans le registre ;
- les états de vérification et d’autorisation ;
- les SHA-256 obligatoires dès qu’une source/dataset est déclaré vérifié ;
- l’interdiction de publier un template SYSCOHADA avant validation du dataset et autorisation d’utilisation ;
- l’absence de dépendance directe SYSCOHADA dans les adaptateurs sectoriels.

## Frontière de cette première tranche de #149

Cette tranche sécurise l’entrée du référentiel réglementaire dans DTSC mais ne prétend pas avoir implanté le Plan comptable général OHADA.

Il reste nécessaire pour clôturer #149 :

1. obtenir une source officielle ou légalement exploitable contenant le plan détaillé ;
2. enregistrer son fingerprint ;
3. extraire/structurer le dataset de manière reproductible ;
4. valider classes, groupes, comptes, parents, libellés et types DTSC ;
5. réaliser la revue comptable ;
6. seulement ensuite enregistrer et publier `OHADA_SYSCOHADA` dans le registre.
