# Shop 2.0 — Itération 2/4 — Moteur commercial Retail

## Statut

Document d’architecture et d’exploitation de l’itération 2 du programme Shop 2.0.

- Epic : #122
- Issue : #124
- Branche : `feat/124-shop-2-pricing-tax-returns`
- PR : #129
- Statut commercial existant du Shop : `COMMERCIAL_READY`
- Ce travail ne crée pas et ne revendique pas `COMMERCIAL_READY_GLOBAL`.

## Mission

Cette itération transforme `RETAIL_POS` en moteur commercial gouverné. Le navigateur ne décide plus du prix, de la remise ou de la taxe à comptabiliser. Le serveur résout la décision commerciale à partir des sources ERP canoniques, conserve un snapshot de cette décision, exécute la vente, puis utilise Finance et Inventory communs pour les conséquences comptables et de stock.

L’itération introduit également un domaine Retail dédié pour les promotions et pour les retours partiels. Elle ne réactive pas les anciens modules génériques `PROMOTIONS` et ne crée aucune comptabilité ni balance de stock parallèle.

## Sources de vérité

| Domaine | Source de vérité |
|---|---|
| Produit | `EnterpriseCatalogItem` |
| Prix de vente | `EnterpriseCatalogPrice` |
| Condition d’application Retail d’un prix | `EnterpriseRetailPriceCondition` |
| Fiscalité | `EnterpriseTaxCode` + `EnterpriseTaxRate` |
| Promotion Retail | `EnterpriseRetailPromotion` |
| Décision commerciale historique | `EnterpriseRetailPricingDecision` |
| Utilisation d’une promotion | `EnterpriseRetailPromotionRedemption` |
| Vente POS | `EnterpriseRetailSale` |
| Retour / échange | `EnterpriseRetailReturn` + lignes |
| Remboursement | `EnterpriseRetailRefund` + compte financier commun |
| Stock | journal Inventory commun |
| Comptabilité | journaux Finance/Accounting communs |

`EnterpriseCoreRecord`, `EnterpriseSectorRecord`, l’ancien module `PROMOTIONS` et toute balance Retail parallèle sont hors du chemin de mutation.

## 1. Résolution des prix

Le POS utilise `EnterpriseCatalogPrice` de type `SALE`, actif, applicable à la date et dans la devise de la vente.

Les conditions Retail permettent de préciser l’application d’un prix selon :

- site ;
- client ;
- segment lorsque le contexte métier le permet ;
- quantité minimale et maximale ;
- canal, actuellement `POS` par défaut ;
- priorité.

Le moteur choisit la condition la plus spécifique puis la priorité la plus forte. La valeur `indicativeSalePrice` ne reste qu’un fallback de compatibilité quand aucun prix canonique n’est disponible ; elle n’est pas une deuxième source de vérité à maintenir.

Chaque ligne vendue reçoit un snapshot persistant :

- prix canonique sélectionné ;
- prix client résolu ;
- remise ;
- taxe ;
- promotions appliquées ;
- contexte de décision ;
- source de pricing ;
- indicateurs de dérogation.

## 2. Prix TTC et HT

Un prix `taxIncluded=true` est traité comme un prix client TTC.

Le moteur extrait la base HT et la taxe avant de transmettre la ligne au service POS existant. Il garantit donc :

```text
HT après remise + taxe = montant TTC client
```

La taxe n’est jamais ajoutée une seconde fois sur un prix déjà TTC.

Une dérogation manuelle de taxe sur une ligne TTC est refusée : il faut corriger la configuration fiscale ou la règle de prix, pas bricoler le ticket.

## 3. Fiscalité Retail

Les articles taxables doivent être reliés à un `taxCode` commun actif. Le taux applicable est lu dans `EnterpriseTaxRate` selon la date de l’opération.

Le POS refuse la vente lorsque :

- l’article est taxable mais sans code fiscal ;
- le code fiscal n’existe pas dans le tenant ;
- aucun taux actif n’est applicable à la date.

Aucune logique fiscale pays n’est codée en dur dans Retail Core. Les country packs restent un sujet de l’itération 4.

## 4. Promotions Retail dédiées

Types pris en charge dans l’itération 2 :

- pourcentage ;
- montant fixe ;
- palier de quantité ;
- Buy X Get Y ;
- bundle.

Une promotion peut utiliser :

- période d’effet ;
- site ;
- devise ;
- coupon ;
- produit ou catégorie ;
- quantité ;
- montant minimal ;
- segment ;
- priorité ;
- mode `EXCLUSIVE` ou `STACKABLE` ;
- limite globale ;
- limite par client.

Chaque utilisation est persistée avec une clé d’idempotence stable. Le même retry de vente ne consomme pas deux fois la promotion.

## 5. Dérogations commerciales

Le moteur distingue les capacités suivantes :

- administration du pricing ;
- dérogation de prix ;
- dérogation de remise ;
- dérogation de taxe ;
- administration des promotions ;
- demande de retour ;
- validation de remboursement.

Ces permissions exactes sont vérifiées côté serveur après le gate général du module.

Sans motif explicite de dérogation, les valeurs prix/remise/taxe envoyées par une ancienne interface sont considérées comme des valeurs de présentation obsolètes et sont remplacées par la décision serveur.

Avec motif explicite, la modification devient une dérogation métier et exige la permission spécifique correspondante.

## 6. Retours partiels et échanges

Le retour complet par annulation existant reste un workflow distinct.

L’itération 2 ajoute un vrai workflow de retour partiel :

```text
Vente COMPLETED
→ demande de retour PENDING_APPROVAL
→ validation indépendante
→ mouvement stock éventuel
→ remboursement
→ COMPLETED
→ posting Finance + Inventory
```

Le demandeur ne peut pas approuver son propre remboursement.

Les quantités d’une ligne déjà retournées ou déjà réservées par une demande `PENDING_APPROVAL` sont retranchées de la quantité encore retournable. Deux demandes concurrentes ne peuvent donc pas retourner deux fois la même unité.

### État produit

La demande collecte :

- vendable ;
- ouvert ;
- endommagé ;
- défectueux ;
- expiré ;
- autre.

### Disposition stock

- `RESTOCK` : réintégration dans le journal Inventory ;
- `SCRAP` : pas de remise en stock disponible ;
- `NO_STOCK` : aucun effet stock, notamment pour services ou cas contrôlés.

### Échange

Un échange exige une vente de remplacement réelle, dans la même organisation et la même devise. Il ne transforme pas le retour en un second moteur de commande.

## 7. Remboursements

Modes opérationnels de l’itération 2 :

- moyen(x) du ticket d’origine ;
- cash ;
- Mobile Money ;
- virement bancaire ;
- carte via un compte bancaire/clearing autorisé.

Le compte de remboursement est revalidé par :

- `organizationId` ;
- statut ;
- type ;
- devise ;
- solde disponible selon les règles existantes.

Un remboursement cash exige une session de caisse ouverte pour l’acteur qui exécute le remboursement.

`STORE_CREDIT` est volontairement absent. Il sera introduit dans l’itération 3 avec un vrai domaine d’avoir/solde dépensable, expiration, anti-double-spend et audit. Une simple étiquette `STORE_CREDIT` dans l’itération 2 aurait créé une dette financière fictive.

## 8. Comptabilité

### Vente

Le posting existant reste :

- débit encaissement ;
- crédit chiffre d’affaires ;
- crédit taxe ;
- débit COGS ;
- crédit Inventory.

### Retour partiel

Nouveau posting `RETAIL_POS_RETURN_POSTED` :

- débit chiffre d’affaires retourné ;
- débit taxe retournée ;
- crédit du ou des comptes réellement remboursés.

Si la marchandise est réintégrée :

- débit Inventory ;
- crédit COGS.

Les écritures passent exclusivement par le registre de posting Finance commun. Elles sont idempotentes et équilibrées.

## 9. UX

L’espace :

```text
/enterprise-modules/RETAIL_POS/commercial
```

regroupe :

- Tarification ;
- Promotions ;
- Retours & échanges.

La caisse principale reste centrée sur la vitesse de vente. Le paramétrage et les validations sensibles ne sont pas mélangés au panier du vendeur.

L’interface :

- est responsive ;
- garde les formulaires utilisables sur mobile ;
- masque les mutations non autorisées ;
- conserve le contrôle serveur comme autorité ;
- affiche des erreurs métier humaines ;
- évite les `window.prompt()` dans les workflows actifs.

## 10. API

Principales routes :

- `POST /api/enterprise/:organizationId/retail/pricing/preview`
- `GET /api/enterprise/:organizationId/retail/pricing/catalog`
- `GET|POST /api/enterprise/:organizationId/retail/pricing/conditions`
- `GET|POST /api/enterprise/:organizationId/retail/promotions`
- `GET /api/enterprise/:organizationId/retail/commercial-permissions`
- `GET /api/enterprise/:organizationId/retail/refund-accounts`
- `GET /api/enterprise/:organizationId/retail/returns`
- `GET|POST /api/enterprise/:organizationId/retail/sales/:saleId/returns`
- `POST /api/enterprise/:organizationId/retail/returns/:returnId/decision`

Les mutations appliquent session, organisation active, membership, module, entitlement, permission, same-origin, Zod, rate limit, transactions et audit selon leur niveau de risque.

## 11. QA

Contrat statique :

`node scripts/qa-shop2-commercial-engine.mjs`

Le workflow comportemental Shop 2 reconstruit PostgreSQL depuis zéro, applique les migrations, seed un tenant canonique et exécute Playwright sur l’application buildée.

Le scénario commercial prouve notamment :

- prix canonique TTC 116 USD ;
- TVA 16 % ;
- promotion 10 % ;
- calcul serveur de deux unités à 208,8 USD ;
- snapshot pricing et redemption promotion ;
- journaux vente et COGS équilibrés ;
- retour d’une unité sur deux ;
- refus de l’auto-validation ;
- validation par un deuxième utilisateur ;
- remboursement 104,4 USD ;
- réintégration d’une seule unité ;
- journal retour et journal Inventory équilibrés ;
- blocage d’un retour dépassant la quantité restante.

## 12. Hors scope assumé

L’itération 2 ne prétend pas fournir :

- fidélité ;
- points ;
- gift cards ;
- store credit ;
- PSP asynchrones et webhooks ;
- périphériques POS ;
- providers Mobile Money/Telco connectés en temps réel ;
- offline ;
- omnicanal ;
- multi-store avancé ;
- country packs fiscaux.

Ces sujets restent répartis entre les itérations 3 et 4 du programme #122.
