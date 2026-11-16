# ERP professionnel — Ventes

## Périmètre

Module canonique : `SALES_QUOTES_ORDERS`.

Chaîne : client/prospect → devis → acceptation/refus → commande → livraison partielle ou complète.

## Référentiels

- Tiers et rôles client/prospect.
- Catalogue canonique de produits et services.
- Sites, entrepôts et emplacements pour les produits physiques.
- Utilisateurs responsables et permissions serveur.

## Règles

- Le formulaire n’accepte aucun identifiant technique saisi librement.
- Le frontend prévisualise ; le serveur recalcule sous-total, remises, taxes, total et arrondis.
- Un devis accepté peut être converti en commande de manière contrôlée.
- Une livraison ne dépasse jamais le reliquat.
- Chaque livraison possède une clé d’idempotence.
- Commande, facture, créance et paiement restent distincts.

## États principaux

- Devis : Brouillon, Envoyé, Accepté, Refusé, Expiré, Converti en commande, Annulé.
- Commande : Brouillon, En attente de validation, À préparer, Partiellement livré, Livré, Clôturé, Annulé.

## UX

- KPI horizontaux sur mobile.
- Recherche par référence, titre ou tiers.
- Filtres de statut.
- Formulaire long en dialogue plein écran mobile.
- Détail des lignes et reliquats.
- Actions contextuelles dépendantes du statut.

## Sécurité

Toutes les opérations vérifient session, contexte, organisation, membership, activation du module, abonnement, permission, visibilité, same-origin, Zod, rate limit, transaction, journal API et audit.

## Maturité

`PROFESSIONAL_READY` après Quality Gates, migrations et déploiement. Promotion `COMMERCIAL_READY` uniquement après validation manuelle du propriétaire, packaging, onboarding et support.


## Design 2.0 — Registre commercial et documents premium (Issue #1195)

### Registre et export
- En-tête compact, 5 KPI colorés, onglets devis/commandes, rail tactile de statuts pour tous les états du référentiel, recherche, pagination et filtres de dates par calendrier (aujourd'hui, semaine, mois, date précise ou intervalle).
- Les API canonisées `/quotes` et `/sales-orders` appliquent les filtres `search`, `status`, `dateFrom` et `dateTo` **avant la pagination**. La recherche inclut la référence, le titre et le nom/code du client via le référentiel de tiers de la même entreprise. En cas de résultat client trop large, le serveur demande de préciser la recherche au lieu d'omettre silencieusement des lignes.
- CSV, Excel et PDF professionnels reprennent **toutes les lignes autorisées** correspondant aux filtres (pas uniquement la page affichée), dans la limite explicite de 1 000 lignes de l'export partagé. La date utilise le calendrier métier commun; les valeurs restent celles stockées dans l'ERP.

### Aperçu A4 pour chaque statut
- Dans le menu « … » de chaque devis ou commande et dans sa fiche : **Aperçu A4 / Imprimer**. L'utilisateur ouvre un document professionnel dans un nouvel onglet, l'imprime ou choisit **Enregistrer en PDF** dans la boîte de dialogue du navigateur.
- Endpoints de lecture privés : `GET /api/enterprise/[organizationId]/quotes/[quoteId]/print?lang=fr|en` et `GET /api/enterprise/[organizationId]/sales-orders/[salesOrderId]/print?lang=fr|en`.
- Les copies affichent l'identité réelle de l'entreprise, son logo privé autorisé, le tiers client, la référence, le statut exact, les lignes, quantités/prix, remises, taxes et totaux **persistés** côté serveur. Les bons de commande indiquent les quantités livrées et les livraisons. Les devis convertis et commandes issues de devis présentent leur référence croisée, sans inventer une facture.
- Brouillon / validation en attente : bandeau provisoire. Refusé / expiré / annulé : bandeau non valable. Accepté, converti, confirmé, partiellement livré, livré ou clôturé : statut réel sur la copie, sans faux cachet ni signature inventée. Tous les statuts conservent un **avertissement explicite que le document commercial n'est ni une facture, ni un paiement, ni une écriture comptable**.
- Sécurité : lecture sous session + activation/entitlement/permission SALES_QUOTES_ORDERS, `organizationId` vérifié sur chaque source, données HTML échappées, logo en chemin authentifié, CSP stricte, cache privé no-store, journalisation API ; aucune mutation à l'impression.

### Communication avec l'ERP existant (une source de vérité par domaine)
1. **CRM/tiers et catalogue** : les devis utilisent `EnterpriseBusinessParty` et `EnterpriseCatalogItem` canoniques ; les références clients de l'aperçu proviennent du référentiel commun, pas d'une copie.
2. **Devis → commande** : `EnterpriseQuote` accepté est converti en `EnterpriseSalesOrder` de façon idempotente avec `quoteId`, lignes/totaux historiques et événement métier ; aucune vente comptabilisée à cette étape.
3. **Commande → livraison / stock** : `EnterpriseFulfillment` suit les quantités restantes, le type PRODUIT/SERVICE et la clé d'idempotence. En Retail omnicanal, les réservations et sorties physiques/valorisation sont prises en charge par le service canonique de stock. **Limitation identifiée :** pour les commandes commerciales non Retail, l'enregistrement de la livraison de produits stockés peut modifier la quantité livrée sans mouvement physique. Ce risque est suivi par l'Issue #1196 et n'est PAS prétendu corrigé par #1195. Un service ne génère aucun mouvement physique. La copie montre les livraisons effectivement persistées.
4. **Commande → Factures clients / créances** : le module Finance existant accepte une source `salesOrderId` (et `fulfillmentId` pour le justificatif de livraison). La fiche commande ouvre les **Factures clients** ; un utilisateur autorisé y sélectionne la commande source. Les contrôles Finance garantissent facturation, approbation, émission, créance, paiement et grand livre canoniques. Ce lot **ne crée pas de facture automatique** et ne modifie pas le journal comptable lors d'une prévisualisation.
5. **Audit/RBAC** : permissions et abonnements réévalués par API ; aucune exposition d'un document d'une autre organisation ; impression et mutations séparées.

### QA et acceptance propriétaire
- QA ciblée `pnpm qa:sales-design2-1195` + régressions devis/commandes, tests de sécurité, type-check, lint, build.
- Matrice détaillée `docs/OWNER_E2E_SALES_DESIGN2_1195.md` : 14 états de documents, deux entreprises, quatre rôles, 320–1024 px, FR/EN, mode clair/sombre, CSV/XLSX/PDF, Factures clients et stocks.
- Ne pas fusionner avant Quality Gates vertes sur SHA final **et** validation explicite `E2E final #<PR> BON`. Production uniquement après merge sur main, via Vercel automatique, sans preview ni déploiement manuel.
- Pas de migration Prisma, de nouvelle variable Vercel ni de backfill.
