# Modèle comptable ERP commun

## Autorité

`EnterpriseJournalEntry` et `EnterpriseJournalLine` constituent l’unique source de vérité du grand livre commun. Les états financiers utilisent uniquement les écritures `POSTED`, filtrées par `organizationId`, période et devise fonctionnelle.

## Partie double

Chaque écriture comporte au moins deux lignes. Le serveur calcule les montants fonctionnels avec `Prisma.Decimal` et impose `Σ débits = Σ crédits`. Une ligne ne porte jamais simultanément un débit et un crédit positifs.

## Cycle

`DRAFT → PENDING_APPROVAL → APPROVED → POSTED`. Les rejets et annulations restent historiques. Une écriture `POSTED` est immuable ; une correction crée une contrepassation liée, puis une nouvelle écriture.

## Périodes

`OPEN` autorise les opérations normales. `SOFT_CLOSED` réserve les opérations aux permissions renforcées. `CLOSED` interdit la comptabilisation normale. `LOCKED` interdit la réouverture standard.

## Dimensions

Les lignes peuvent référencer tiers, projet, département, site, actif et article de stock. Chaque référence est validée dans la même organisation. Un JSON libre n’est jamais la seule autorité analytique.

## Devises

La devise fonctionnelle appartient à la configuration financière. Toute opération multidevise conserve un snapshot du taux utilisé. Les rapports officiels internes utilisent la devise fonctionnelle et n’additionnent jamais des devises différentes.

## Séparation

Ce modèle ne remplace pas les modèles financiers Pharmacy, Health, la paie interne DTSC ou `FinancialAccount` interne. Leur convergence appartient à l’itération 4.
