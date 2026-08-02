# Modèle comptable ERP commun

## Autorité

`EnterpriseJournalEntry` et `EnterpriseJournalLine` constituent l’unique source de vérité du grand livre commun. Les états financiers utilisent uniquement les écritures `POSTED`, filtrées par `organizationId`, période et devise fonctionnelle.

Les opérations métier ne deviennent pas automatiquement des vérités comptables par leur simple statut métier. Elles passent par le moteur de comptabilisation commun et ses contrôles.

## Partie double

Chaque écriture comporte au moins deux lignes. Le serveur calcule les montants fonctionnels avec `Prisma.Decimal` et impose `Σ débits = Σ crédits`. Une ligne ne porte jamais simultanément un débit et un crédit positifs.

Les différences d’arrondi ne sont pas tolérées silencieusement. Elles exigent une règle et un compte explicitement configurés.

## Cycle

`DRAFT → PENDING_APPROVAL → APPROVED → POSTED`.

Les rejets et annulations restent historiques. Une écriture `POSTED` est immuable ; une correction crée une contrepassation liée, puis, lorsque nécessaire, une nouvelle écriture corrective.

La contrepassation :

- conserve l’écriture d’origine ;
- inverse les débits et crédits ;
- utilise une date appartenant à une période autorisée ;
- exige un motif ;
- est liée structurellement à l’original ;
- est idempotente ;
- respecte la séparation des responsabilités.

## Plan comptable

Un plan regroupe des comptes hiérarchisés. Le code est unique par entreprise. Le parent doit appartenir au même tenant et avoir une nature compatible. Un compte utilisé n’est jamais supprimé physiquement ; il est désactivé et son historique reste consultable.

## Exercices, périodes et journaux

Un exercice contient des périodes non chevauchantes. Une période doit rester dans les dates de l’exercice.

- `OPEN` autorise les opérations normales ;
- `SOFT_CLOSED` réserve les ajustements aux permissions renforcées ;
- `CLOSED` interdit la comptabilisation normale ;
- `LOCKED` interdit la réouverture standard.

Les journaux définissent le type d’opération, la séquence, le préfixe et la politique d’approbation. Une séquence utilisée n’est jamais réemployée.

## Idempotence et source

Chaque événement comptabilisé conserve : entreprise, module source, type d’objet source, identifiant source, événement de posting, version et clé d’idempotence.

Un retry réseau, un double clic ou une reprise de worker réutilise le lot existant et ne crée pas une deuxième écriture.

## Dimensions

Les lignes peuvent référencer tiers, projet, département, site, actif et article de stock. Chaque référence est validée dans la même organisation. Un JSON libre n’est jamais la seule autorité analytique.

## Devises

La devise fonctionnelle appartient à la configuration financière. Toute opération multidevise conserve un snapshot du taux utilisé. Les rapports n’additionnent jamais des devises différentes comme s’il s’agissait d’un même montant.

La devise de transaction, la devise fonctionnelle et la devise de présentation restent distinctes.

## États financiers

Le grand livre et la balance sont calculés à partir des lignes `POSTED`. Un aperçu dynamique peut évoluer avec de nouvelles écritures autorisées. Une version publiée est horodatée, identifiable, liée à ses paramètres et non modifiable.

## Frontières métier

```text
facture ≠ écriture comptable
paiement ≠ allocation ≠ écriture
paie approuvée ≠ paiement ≠ écriture de paie
actif opérationnel ≠ immobilisation comptable
stock physique ≠ valorisation comptable
aperçu dynamique ≠ version publiée
```

## Séparation

Ce modèle ne remplace pas les modèles financiers Pharmacy, Health, la paie interne DTSC ou `FinancialAccount` interne. Les événements sectoriels autorisés convergent vers ce moteur commun sans recréer de second grand livre.

Une relation active avec une entreprise, un rôle global DTSC ou un rôle manager non qualifié ne donne aucun accès automatique à la comptabilité.
