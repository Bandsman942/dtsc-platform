# ERP Commercial Design 2.0 — Issue #1198 — v1.21.0 candidate
Date : 16 novembre 2026. **Ne pas fusionner avant CI finale verte et OWNER_E2E explicite.**

## Pourquoi ce lot
Un devis saisi dans SHOP BCN MULTI TEST (client test DIMER, devise CDF, deux lignes 10 × 45 000 et 9 × 19 900) déclenchait une erreur serveur générique en production. Les logs Vercel confirment une **PrismaClientValidationError : Unknown argument organizationId** dans la création imbriquée de EnterpriseQuoteItem. Le même bug existait pour EnterpriseSalesOrderItem lors de la conversion de devis.

Le moteur ORM exige le rattachement par la relation parent composite : il est incorrect de fournir une deuxième clé `organizationId` dans ce `items.create`. Le correctif retire uniquement ces arguments dans `lib/enterprise/crm-sales/quotes.ts`. Les deux créations parent gardent `organizationId` et les validations canoniques de client, opportunité, article et entitlements. Aucune migration n'est nécessaire.

**Preuve ajoutée :** test PostgreSQL transactionnel `pnpm qa:erp-quote-prisma-postgres-1198` : deux articles, total CDF calculé, 2 lignes de devis puis 2 de commande, même tenant, lien de conversion, retour arrière volontaire, sans fixture persistante. QA statique : `pnpm qa:erp-commercial-design2-1198`.

## Cadre Design 2.0 partagé
Composant `components/enterprise/professional/commercial-design2-controls.tsx` :
- **Rail horizontal de filtres statuts** cliquables, accessible au clavier avec état `aria-pressed`, scroll local sans scroll global mobile ;
- **calendrier intelligent** : toutes dates / aujourd'hui / semaine / mois / date précise / intervalle ; validation serveur au format civil et rejet des périodes invalides ;
- **exports professionnels CSV, Excel et PDF** via `FinanceExportControls`, identité entreprise, en-tête, colonnes et filtres, **données réellement filtrées côté serveur avant pagination**, jusqu'à 1 000 lignes (erreur de limite explicite, jamais d'export de la seule page courante) ;
- navigation contextualisée vers les **modules ERP canoniques**, avec droits vérifiés par le module destinataire ;
- densité compacte DTSC, KPI colorés, styles clair/sombre, gestion responsive 320px–desktop, FR/EN, états de focus.

## Les cinq workspaces

### 1. Tiers, prospects et clients — CRM_CUSTOMERS
- Onglets de rôle/nature, rail ACTIVE/INACTIVE, recherche nom/code/email, filtre date de création, pages et exports.
- Fiches 360°, contacts/adresses/liaison DTSC par consentement sont inchangés ; pas de compte global obligatoire pour une fiche métier.
- Liens vers CRM, devis/commandes, contrats. Identité CRM unique `EnterpriseBusinessParty`.

### 2. Produits et services — CATALOG
- Onglets Produit/Service/Catégorie/Unité, rail de statut et date appliqués **aux articles seulement**, exports des articles avec SKU, catégorie, prix, coût, devise, suivi de stock.
- Catégories et unités restent des référentiels séparés (onglets sans export daté trompeur). Import CSV/XLSX avec templates inchangé.
- **Stock, lots et péremptions restent dans INVENTORY_LOGISTICS** ; pas de mouvements physiques lors d'un simple import ou export de fiche.

### 3. Prospects et opportunités — CRM_PIPELINE
- Pipeline par étapes, vues Leads/Opportunities, rail dynamique selon la vue, filtres date et statut, export de prospects et opportunités distincts.
- Recherche d'opportunités par titre/référence et **nom/code du tiers canonique**. Liaison BusinessParty et conversion contrôlée inchangées.
- Valeurs indicatives restituées avec leur devise propre, probabilité et prochain suivi. Aucune création de facture implicite.

### 4. Contrats commerciaux — CONTRACTS
- Rail pour DRAFT, PENDING_APPROVAL, APPROVED, ACTIVE, SUSPENDED, EXPIRED, TERMINATED et CANCELLED ; recherche par nom/référence/contrepartie, date **de création**.
- KPI par état, exports statut/montants/devise/échéance/version, liens tiers/pipeline/devis/documents.
- Workflow d'approbation indépendant, avis de renouvellement, documents privés, commentaires, RBAC et audit conservés.

### 5. Télécom & forfaits — TELCO_TOPUPS
- Interface compacte et KPI colorés par devise. L'onglet **Historique** passe d'un simple échantillon `dashboard.recent.topups` à l'API paginée tenant-scoped `retail/telco-topups`.
- Filtres status SUCCESS/FAILED/REVERSED, recherche numéro/offre/référence/téléphone, dates métier `occurredAt`, exports complets bornés.
- Destination téléphone **masquée** dans la liste **et l'export**, identités opérateurs et comptes Finance inchangés ; liens POS, catalogue, caisse, trésorerie.
- Les services existants d'idempotence, de rapprochement et d'écritures comptables restent seuls maîtres des flux.

## API et confidentialité
Routes `business-parties`, `catalog`, `leads`, `opportunities`, `contracts` : dateFrom/dateTo validés avec `financeBusinessDateRange`, recherche bornée (120 caractères), filtre `createdAt`, champ organizationId à chaque requête, permission et abonnement vérifiés avant accès. Les recherches par nom du tiers sur contrats/opportunités n'utilisent que les identifiants d'un même tenant et refusent les correspondances trop larges (plus de 1 000) au lieu d'en perdre silencieusement.

TELCO : même filtre civil dateFrom/dateTo, compatible avec les anciens paramètres from/to, sur `occurredAt`. Status allow-list, conservation de l'affichage du téléphone masqué, autorisation RETAIL. Aucune mutation des données déclenchée par les filtres ou exports.

## Limites et sécurité
- Les listes exportées reflètent les données accessibles au module. Les documents PDF sont des rapports professionnels, **pas** des factures fiscales, reçus ou signatures électroniques.
- Les devis/commandes ne comptabilisent pas directement les ventes ; Finance seul émet les factures et les créances.
- L'Issue **#1196** (certaines livraisons stockées non Retail sans mouvement physique associé) est **hors scope** et reste ouverte.
- L'interface ne donne jamais de droit métier ; session/tenant/entitlement/RBAC, vérification du stock et workflows restent appliqués par les API.
- Rollback : revert du code par PR après CI ; aucune migration ni écriture rétroactive, aucune nouvelle variable Vercel.

## Validation et livraison
Quality Gates obligatoires : test PostgreSQL #1198, test contrat #1198, tests ERP, Telco, Finance, migration, typage, lint, régression, build. Matrice réelle de recette : `docs/OWNER_E2E_1198_COMMERCIAL_DESIGN2.md`.

**Aucun E2E navigateur n'est réputé réussi uniquement par la QA statique.** OWNER_E2E final BON du propriétaire attendu sur SHA final avant toute fusion. Après fusion main seulement, production Vercel automatique sans preview ou `--prod` manuel.
