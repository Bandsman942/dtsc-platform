# Shop — contrat d’accès comptable par abonnement

Issue de référence : #249  
Secteur : `COMMERCE_RETAIL`  
Template comptable OHADA courant : `OHADA_SYSCOHADA`

## Objectif

Ce document fixe la frontière produit entre la comptabilité opérationnelle nécessaire au Shop et l’administration comptable complète. Il complète `docs/SHOP_ONBOARDING.md` et doit rester cohérent avec le registre canonique des modules.

## STARTER — Shop Essentials

STARTER prépare les référentiels commerciaux mais n’expose pas de comptabilité opérationnelle.

- pas de `FINANCE_OVERVIEW` ;
- pas de Trésorerie/Caisse Retail opérationnelle ;
- pas de `FINANCE_ACCOUNTING` ;
- pas de sélecteur SYSCOHADA ;
- aucune donnée comptable ou aucun solde ne doit être inventé pour préparer une future montée de plan.

## BUSINESS — Shop Operations

BUSINESS fournit la **Comptabilité Shop assistée** nécessaire à l’exploitation quotidienne sans ouvrir le workspace comptable complet.

Capacités attendues :

- `FINANCE_OVERVIEW` ;
- `FINANCE_RECEIVABLES` ;
- `FINANCE_PAYABLES` ;
- `FINANCE_PAYMENTS` ;
- `FINANCE_TREASURY` ;
- `FINANCE_CASH` ;
- `RETAIL_POS` ;
- `RETAIL_DAILY_CLOSE`.

`FINANCE_ACCOUNTING` n’est pas un entitlement BUSINESS.

La configuration financière BUSINESS reste portée par le service canonique Finance et peut enregistrer les mappings sémantiques nécessaires au Shop. Les flux Retail doivent utiliser les clés métier suivantes plutôt que des numéros réglementaires codés en dur :

- `SALES_REVENUE` ;
- `TAX_PAYABLE` ;
- `COST_OF_SALES` ;
- `INVENTORY`.

Les comptes concrets sont résolus depuis le plan comptable réellement appliqué au tenant. Pour les entreprises OHADA, le template publié courant est `OHADA_SYSCOHADA`.

## ENTERPRISE — Shop Scale

ENTERPRISE ajoute l’administration comptable complète et les fonctions avancées éligibles :

- `FINANCE_ACCOUNTING` ;
- `FINANCE_BANK` ;
- `FINANCE_RECONCILIATION` ;
- `FINANCE_TAX` ;
- `FINANCE_CLOSE` ;
- `FINANCE_STATEMENTS` ;
- `FINANCE_ASSETS` ;
- `FINANCE_INVENTORY`.

Chaque module reste soumis à son entitlement effectif, au statut d’abonnement, au contexte organisationnel, aux permissions et au RBAC backend.

## Règles invariantes

1. Retail ne connaît jamais les numéros SYSCOHADA en dur.
2. Le moteur Finance et ses templates publiés sont la source de vérité comptable.
3. Une référence de compte, un mapping, un journal ou un solde appartient toujours à son `organizationId`.
4. L’UI ne peut jamais élargir un droit que le backend refuse.
5. La désactivation ou le downgrade d’un module ne supprime pas les historiques comptables.
6. Une future version SYSCOHADA est migrée via le mécanisme de version/diff prévu ; elle ne réécrit pas silencieusement les écritures historiques.

## QA opposable

`scripts/qa-enterprise-module-registry-checks.mjs` doit vérifier au minimum :

- `FINANCE_OVERVIEW`, `FINANCE_TREASURY`, `FINANCE_CASH`, `RETAIL_POS` et `RETAIL_DAILY_CLOSE` restent BUSINESS ;
- `FINANCE_ACCOUNTING` reste ENTERPRISE ;
- Trésorerie BUSINESS ne dépend pas du workspace `FINANCE_ACCOUNTING` ;
- aucun override commercial ne rabaisse `FINANCE_ACCOUNTING` ;
- la configuration financière BUSINESS reste protégée par `FINANCE_OVERVIEW` ;
- le template `OHADA_SYSCOHADA` courant reste publié pour le contrat Shop OHADA.
