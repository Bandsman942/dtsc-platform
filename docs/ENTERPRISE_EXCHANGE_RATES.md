# DTSC Platform — Gouvernance des taux de change

## 1. Objectif

Les taux de change sont une capacité Finance transverse. Aucun secteur, y compris Shop, ne doit maintenir sa propre table ou sa propre logique de conversion.

La source canonique est `EnterpriseExchangeRate`. Les écritures financières qui utilisent une conversion conservent le taux utilisé dans `EnterpriseExchangeRateSnapshot` et/ou dans les lignes comptables concernées.

## 2. Règle fondamentale

DTSC ne doit jamais additionner directement des montants exprimés dans des devises différentes.

Pour produire une consolidation :

1. conserver la devise et le montant d’origine ;
2. déterminer la devise cible : `presentationCurrencyCode` si elle est configurée, sinon `functionalCurrencyCode` ;
3. résoudre le taux applicable à la date de l’opération ;
4. convertir chaque opération individuellement ;
5. additionner seulement les montants convertis dans la même devise cible.

Si un seul taux obligatoire manque, le rapport consolidé est marqué `INCOMPLETE` et DTSC ne présente pas un total partiel comme s’il était complet.

## 3. Convention de taux

Un taux est enregistré sous la forme :

`1 SOURCE = RATE TARGET`

Exemple :

`1 USD = 2 850 CDF`

La paire inverse ne doit pas nécessairement être saisie. Si aucun taux direct n’existe mais que la paire inverse est disponible, DTSC peut calculer `1 / rate` et marque la résolution comme `INVERSE`.

## 4. Date d’effet et historique

`rateDate` est la date de début d’applicabilité du taux.

Pour une opération datée `T`, DTSC sélectionne le taux actif le plus récent dont `rateDate <= T`.

Un taux publié n’est pas modifié. Une correction suit ce parcours :

1. désactiver le taux erroné avec un motif audité ;
2. créer une nouvelle version avec sa date d’effet ;
3. conserver l’ancien enregistrement pour l’historique et l’audit.

## 5. Sources supportées

- `MANUAL` — taux saisi manuellement par un responsable autorisé ;
- `CENTRAL_BANK` — taux provenant d’une banque centrale, saisi/importé ;
- `COMMERCIAL_BANK` — taux d’une banque commerciale ;
- `PROVIDER` — taux communiqué par un fournisseur ou opérateur ;
- `CONTRACTUAL` — taux défini par un contrat ;
- `IMPORTED` — taux chargé depuis une source externe contrôlée.

Ces codes décrivent la provenance. La présente version n’effectue pas automatiquement d’appel à une API de banque centrale ou de marché.

## 6. Sécurité

L’administration des taux utilise le module `FINANCE_TREASURY` et exige :

- session active ;
- organisation active et membership valide ;
- entitlement/module Finance ;
- permission `manage` ;
- requête same-origin pour les mutations ;
- validation Zod ;
- rate limit ;
- transaction sérialisable lors de la création/désactivation ;
- audit de la création et de la désactivation.

## 7. Interface

Chemin :

`Finance > Trésorerie > Taux de change et consolidation multi-devise`

Route :

`/enterprise-modules/FINANCE_TREASURY/exchange-rates`

L’écran affiche :

- devise fonctionnelle ;
- devise de présentation ;
- historique complet des taux ;
- taux actifs ;
- paire source/cible ;
- date d’effet ;
- source ;
- précision ;
- action de désactivation auditée.

## 8. Shop

Le Shop utilise la même source Finance.

Le rapport Shop consolidé est disponible sur :

`/enterprise-modules/RETAIL_POS/consolidated-report`

Il présente :

- les agrégats natifs par devise ;
- l’état `COMPLETE` ou `INCOMPLETE` de la consolidation ;
- les paires/date manquantes ;
- les ventes POS converties ;
- dépôts, retraits et commissions Mobile Money convertis ;
- ventes et marges Télécom converties ;
- les taux effectivement utilisés, avec sens `DIRECT` ou `INVERSE`.

La conversion se fait opération par opération à la date historique, et non en appliquant un taux courant à un total mensuel déjà agrégé.
