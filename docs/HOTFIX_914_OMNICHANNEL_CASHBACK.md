# Hotfix #914 — Cashback relationnel omnicanal : commande, encaissement, livraison et retour

**Statut : PR #915 en brouillon, non fusionnée, non déployée.** Parent #886, autres types #785. Base réconciliée avec le `main` contenant le hotfix #912. Le propriétaire doit fournir `E2E #914 BON` seulement après sa propre recette; jamais d'auto-validation.

## Sources uniques et flux

| Étape | Autorité | Règle |
| --- | --- | --- |
| Évaluation du cashback | `resolveRetailRelationshipCashbackEffects`, `evaluateRelationshipBenefitSnapshot` | Droit, consentement, audience, quota, tarif et devise contrôlés côté serveur |
| Réservation | `EnterpriseSalesOrder` + `EnterpriseRelationshipBenefitUsage` | `AUTO_RETAIL_OMNICHANNEL_CASHBACK`, `REQUESTED`, aucun avoir monétaire à la commande |
| Preuve de livraison | `EnterpriseFulfillment` + acceptation ou document versionné | Livraison complète et commande `FULFILLED` uniquement |
| Preuve de paiement | `EnterpriseSalesInvoice` + `EnterpriseReceivable.paymentAllocations` + `EnterprisePayment` | Facture émise/comptabilisée, paiement client entrant confirmé et allocations confirmées couvrant le montant total; même tenant/tiers/devise |
| Attribution | `EnterpriseRetailStoredValueAccount/Entry` | Un compte canonique `STORE_CREDIT` par entreprise/client/devise ; entrée `EARN` unique par commande/avantage |
| Comptabilité de l'avoir | `postBusinessEventTx` et registre commun `RETAIL_RELATIONSHIP_CREDIT_GRANTED` | Charge `OPERATING_EXPENSE` au débit, dette `CUSTOMER_ADVANCES` au crédit; atomique avec l'avoir |
| Retours | `EnterpriseRetailOmnichannelReturn`, règlement de remboursement Finance | Chaque retour confirmé : `REVERSAL` proportionnelle aux lignes éligibles, comptabilisée par `RETAIL_RELATIONSHIP_CREDIT_REVERSED` |
| Clôture | `EnterpriseRelationshipBenefitUsage` | Reprise intégrale au retour complet ; réservation annulée si remboursement intervient avant attribution |

**Ordre indifférent :** livraison puis allocation Finance, ou allocation Finance puis livraison, appellent le même moteur d'attribution idempotent. Un retour non rejeté bloque toute nouvelle attribution avant règlement.

## Sécurité et intégrité

- `organizationId` obligatoire sur les références Sales, tiers, Finance, justificatifs et avoirs.
- Relation consentie `ACTIVE`, identité précise et référencement commercial `EnterprisePersonBusinessReference` de même type, client avec rôle `CUSTOMER` actif.
- Aucun statut de facture ni paiement présenté dans l'UI ne remplace les allocations réelles, le compte financier ou la livraison complète.
- Verrou de commande `FOR UPDATE`, réservation verrouillée par relation et avantage, transactions sérialisables, clés stables dans le registre d'avoir et dans la preuve d'utilisation.
- Pas de deuxième solde ni d'écriture inventée. Attribution et posting équilibré dans la même transaction; retour remboursé et reprise comptable dans la même transaction finale.
- Écriture `POSTED` jamais réécrite ; chaque reprise est une pièce indépendante. Un avoir déjà consommé peut produire un solde signé, comme le contrat POS existant.

## Matrice de preuves

| Test | État actuel |
| --- | --- |
| QA structurelle dédiée | LOCAL_EXECUTED : 53 assertions (lecture du dépôt) ; également enregistrée dans `qa:regression` |
| `pnpm type-check`, `pnpm lint`, `pnpm build`, `pnpm qa:regression` | NOT_EXECUTED localement ; attendre la preuve CI GitHub |
| PostgreSQL / Playwright | Ajout au `tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs` ; CI en attente |
| E2E manuelle propriétaire | NOT_EXECUTED |
| Publication Vercel Production | NOT_EXECUTED |

## Tests de recette attendus

1. Commande omnicanale confirmée avec avantage `CASHBACK` : usage en attente, `EARN = 0`.
2. Paiement partiel puis complet mais sans livraison : `EARN = 0`.
3. Livraison complète avec acceptation et facture réellement acquittée : exactement un `EARN` et une écriture POSTED équilibrée.
4. Livraison avant paiement, et ordre inverse : même résultat économique.
5. Deux appels concurrents ou replay de commande/livraison/paiement : pas de double attribution.
6. Autre client, autre devise, facture non postée, preuve absente, paiement non confirmé ou absence d'allocation : aucun avoir.
7. Retour partiel confirmé : réversion proportionnelle; retour complet : réversion totale sans double exécution, quota libéré.
8. Retours en attente/rejetés, encaissement refusé et contrôle multi-tenant : aucun faux mouvement.
9. Contrôles mobile FR/EN et caisse/Finance : références consultables, messages explicites.

## Compatibilité et rollback

- Aucune modification du schéma Prisma, aucune migration ni backfill, aucun secret.
- La logique existante POS `AUTO_RETAIL_CASHBACK`, CREDIT manuel et DELIVERY #912 restent séparés. L'événement Finance CREDIT existant est étendu à une source `EnterpriseRetailStoredValueEntry` vérifiable par le registre.
- Rollback avant production : revert ciblé de la PR #915, aucune donnée en production. Après une future publication, une correction de dette devra être comptabilisée par reprise/contrepassation autorisée, jamais suppression du journal.
- **La PR #915 doit rester en brouillon tant que tous les contrôles automatiques, E2E et revue ne sont pas prouvés.**
