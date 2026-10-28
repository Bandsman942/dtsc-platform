# Hotfix #916 — Contrat canonique 23 relations × 15 avantages

**Issue : #916 · Parents #886/#785 · branche `fix/916-relationship-referential-23-types` · état : non fusionné / OWNER_E2E NOT_EXECUTED.**

## Source de vérité et écart corrigé

Le code `lib/enterprise/identity-links/contracts.ts` déclare **23** types de relation : PROSPECT, CUSTOMER, CUSTOMER_CONTACT, SUPPLIER, SUPPLIER_REPRESENTATIVE, EMPLOYEE, COLLABORATOR, CONTRACTOR, PARTNER, PATIENT, STUDENT, PARENT_GUARDIAN, POLICYHOLDER, BENEFICIARY, DONOR, VOLUNTEER, TENANT, OWNER_CLIENT, DISTRIBUTOR, RESELLER, ALUMNI, VIP, OTHER.

L'ancienne QA #786 hardcodait une liste de **22** relations et omettait SUPPLIER. Le test ne doit plus être un second référentiel : ses données sont extraites à chaque exécution de la déclaration canonique.

## Défense en profondeur

- `RELATION_CAPABILITIES` est typé `Record<EnterpriseIdentityRelationType, EnterpriseRelationshipCapability[]>` : TypeScript doit refuser tout oubli après ajout d'une nouvelle relation.
- `resolveEnterpriseIdentityRelationshipAccess` refuse une valeur legacy inconnue : elle n'hérite jamais implicitement des capacités de `OTHER`.
- Le résolveur continue de retirer `ENTERPRISE_BENEFITS` si le module n'est pas activé et entitled et de ne jamais attribuer de membership implicite.
- Les deux contraintes SQL CHECK existantes autorisent exactement les 23 codes. Aucun changement d'historique ni migration n'est nécessaire.

## Matrice transversale

Les **15** types du catalogue sont : DISCOUNT, FIXED_PRICE, FREE_SERVICE, DELIVERY, PRIORITY, LOYALTY, CASHBACK, CREDIT, ACCESS, SUPPORT, BOOKING, DOCUMENT, EVENT, REFERRAL, OTHER.

`qa:hotfix-916` vérifie **23 × 15 = 345 combinaisons contractuelles**, sans prétendre exécuter 345 ventes ou workflows :

| Famille | Contrat opérationnel vérifié |
| --- | --- |
| DISCOUNT, FIXED_PRICE | Pricing serveur Retail POS / Gaming seulement sur configurations autorisées |
| CASHBACK | Ledger d'avoir Retail canonique; POS et #914 omnicanal soumis aux preuves |
| LOYALTY | Ledger de fidélité Retail uniquement sur programme approuvé |
| CREDIT | Attribution manuelle approuvée vers avoir magasin canonique |
| DELIVERY | Demande puis livraison Sales réellement prouvée (#912) |
| FREE_SERVICE, PRIORITY, ACCESS, SUPPORT, BOOKING, DOCUMENT, EVENT, REFERRAL, OTHER | Demande ou refus explicite; aucune application métier automatique simplement parce que le type existe |

Un type de relation autorisé ne signifie **ni entitlement automatique, ni accès ERP, ni avantage réellement exécuté**. Un effet non couvert est refusé par l'allow-list serveur.

## Recette et fermeture

- QA structurelle : `pnpm qa:hotfix-916`, `qa:hotfix-786-relationship-benefits-enforcement`, `qa:hotfix-872-identity-relations`.
- E2E PostgreSQL/Playwright : `tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs` parcourt les **23 types** via l'API authentifiée et refuse le cross-tenant. Ce parcours teste **l'accès au catalogue**, pas l'application économique de chaque avantage.
- Tests métier et financiers exhaustifs : tickets #917–#921, qui restent bloquants pour la clôture des parents.
- OWNER_E2E #916 : **NOT_EXECUTED**.
- CI Quality/Migration et Vercel : **NOT_EXECUTED** pour ce hotfix avant fusion.

## Risques et rollback

Pas de schéma Prisma, migration, backfill ni secret. Risque de refus d'une valeur legacy réellement invalide : comportement sûr et attendu; vérifier l'historique si une valeur non canonique est observée, sans corriger un consentement à l'aveugle. Rollback applicatif via PR et nouvelle Production `main`, sans supprimer de relation ni preuve d'identité.
