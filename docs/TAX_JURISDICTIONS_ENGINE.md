# Gestion fiscale par juridiction — DTSC Platform

**Version du chantier :** 2026-11-12 — branche de développement
**Portée :** référentiel Taxes, Finance commune, POS Retail, facturation et paramètres Administration entreprise
**Statut :** à valider par les Quality Gates CI et le E2E final du propriétaire. **Ne pas fusionner avant validation**.

## 1. Autorité des données et sécurité

La table canonique des taxes d'une entreprise reste `EnterpriseTaxCode`, avec les taux historisés dans `EnterpriseTaxRate` et les règles de rattachement `EnterpriseTaxRule`. Les nouvelles colonnes fiscales et les instantanés de facture sont ajoutés sans suppression historique.

Les règles et les taux sont propres à `organizationId` et accessibles uniquement après l'authentification, le membership, l'entitlement Finance et le RBAC vérifiés par `authorizeFinanceRequest`. Le rôle global DTSC ne donne aucun droit implicite aux données client.

L'accès aux données est soumis aux garde-fous serveur de `app/api/enterprise/[organizationId]/taxes/route.ts` et `.../taxes/catalog/route.ts`. Le catalogue commun est proposé, jamais activé automatiquement.

## 2. Administration et référentiels

- Dans Administration entreprise > Paramètres entreprise & finances, `EnterpriseFiscalSettingsPanel` utilise `GET/PATCH /api/enterprise/{organizationId}/finance/configuration` et le `revision` existant.
- `taxPolicyJson.automaticSalesTaxEnabled` est **désactivé par défaut** et demande un consentement explicite. Sans profil Finance disponible, l'interface expose les prérequis sans prétendre avoir enregistré une modification.
- Dans Taxes, `TaxCountryField` propose les codes pays ISO contrôlés. La sélection initiale vient de `Organization.country`. Les subdivisions/exception locales et le lieu de prestation transfrontière nécessitent des règles fiscales vérifiées avant automatisation.
- `TAX_CATEGORIES` et `financeEnumLabel` exposent des catégories professionnelles bilingues ; les catégories historiques `EXEMPT` et `ZERO_RATED` restent lisibles sans être proposées comme des catégories de création. Elles sont des traitements fiscaux dans les nouveaux formulaires.
- Le détail Taxes reprend identité, taux et date d'effet, catégorie, juridiction, comptes comptables, provenance et règles. Les statuts visibles reposent sur `isActive`, et non sur un attribut SQL inexistant.

## 3. Catalogue fiscal DTSC

Endpoints :
- `GET /api/enterprise/{organizationId}/taxes/catalog` — permission `FINANCE_TAX:view`, retourne `countryCode`, modèles vérifiés pour le pays de l'entreprise et modèles déjà adoptés.
- `POST /api/enterprise/{organizationId}/taxes/catalog` — permission `FINANCE_TAX:create`; payload `{ "code":"CD-VAT-STANDARD", "version":"2026.11.12", "applyAutomatically":false }`. Refuse les pays incohérents et les doublons (409), audite l'adoption, ne crée qu'une entrée tenant-scoped.
- `POST /api/enterprise/{organizationId}/taxes` — création manuelle contrôlée par `taxCodeCreateSchema`.

Source RDC : DGI, [présentation officielle de la TVA](https://dgi.gouv.cd/taxe-sur-la-valeur-ajoutee-tva/) et [portail DGI](https://dgi.gouv.cd/teledeclaration/). Le modèle du taux normal de 16 % est **une suggestion de configuration**, limitée aux opérations effectivement imposables, après vérification du régime d'assujettissement. La date `2026-11-12` marque la baseline publiée dans DTSC ; ce n'est **pas** une affirmation sur la date d'entrée en vigueur de la loi. Les nouveaux taux nécessitent une revue juridique et une nouvelle version ; aucune mise à jour silencieuse des factures antérieures.

## 4. Conditions cumulatives d'automatisation

`lib/enterprise/accounting/tax-engine.ts` : résolution commune de taxe pour les opérations de vente.
Une taxe n'est sélectionnée automatiquement que si :
1. l'entreprise active `taxPolicyJson.automaticSalesTaxEnabled=true` ;
2. la taxe porte `autoApply=true`, `isActive=true`, `taxTreatment=STANDARD` et une catégorie autorisée (TVA, GST ou taxe sur les ventes) ;
3. la juridiction de l'entreprise (ou du site Retail actif) correspond à celle de la taxe ;
4. son taux est en vigueur à la date de vente ;
5. l'article est classé `taxable=true` et n'a pas une taxe spécifique qui prime ;
6. **une seule taxe** est éligible. Une ambiguïté renvoie 409 ; DTSC ne choisit pas une taxe au hasard.

`lib/enterprise/retail/commercial-engine.ts` emploie ce résolveur dans la tarification POS tout en respectant les prix inclus/exclus de taxe déjà enregistrés sur les prix du catalogue. Les dépôts/retraits Mobile Money ne doivent pas être requalifiés comme chiffre d'affaires taxable : le domaine Mobile Money reste distinct. Les commissions et services éligibles exigent une qualification explicite.

`lib/enterprise/accounting/receivables-service.ts` l'emploie pour les lignes de factures clients qui référencent un article de catalogue taxable. Pour une ligne libre sans fiche fiscale ou une opération spéciale/transfrontière, le calcul automatique reste volontairement refusé : une classification vérifiée est requise. Les comptes et écritures suivent toujours le moteur comptable commun et les statuts d'émission/posting existants.

**Les taux autorisés à 0 % et les exonérations ne sont pas interchangeables.** Le traitement fiscal choisi doit être conservé sur la référence d'origine. La création de déclarations légales n'est pas annoncée comme automatisée.

## 5. Instantanés historiques et migrations

Les lignes de facture `EnterpriseSalesInvoiceItem` enregistrent désormais le taux effectif `taxRateApplied`, la juridiction `taxJurisdiction` et la version de modèle `taxTemplateVersion`, sans recalculer les documents déjà émis. Ces colonnes sont facultatives pour les anciens documents.

Migrations additives et nouvelles (ne jamais modifier les migrations déjà appliquées) :
- `20261112163000_tax_jurisdiction_catalog` ;
- `20261112164000_tax_invoice_snapshots`.

En environnement cible, exécuter les migrations via le pipeline normal `prisma migrate deploy` venant uniquement de `main`, après revue et E2E positif. Ne pas utiliser `prisma db push` en production.

## 6. Factures normalisées (RDC)

Le paramétrage TVA n'est **pas** une intégration certifiée à la facture normalisée de la DGI. La DGI expose les exigences de facture normalisée et les dispositifs électroniques fiscaux (DEF/e-DEF). Une intégration future devra faire l'objet d'un contrat technique et réglementaire homologué, avec état de certification propre, erreurs explicites et piste d'audit ; ne jamais afficher une mention « conforme DGI » à partir de simples PDF.

Source : [réforme DGI](https://dgi.gouv.cd/reforme-de-la-facture-normalisee/).

## 7. QA / E2E final

Quality Gates obligatoires :
```bash
pnpm prisma generate
pnpm qa:tax-jurisdiction-engine
pnpm qa:responsive-ui
pnpm qa:standard-experience
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
git diff --check
```

Parcours authentifié à vérifier : `tests/e2e/tax-jurisdiction-catalog.spec.mjs` et scénarios utilisateur complémentaires :
- [ ] Les catégories FR/EN affichent des libellés distincts ; le formulaire mobile ne déborde pas (320 à 1024 px).
- [ ] Une taxe créée apparaît en fiche avec tous ses attributs, comptes et taux.
- [ ] La juridiction proposée dépend de l'entreprise ; une taxe étrangère ne peut être adoptée.
- [ ] Les modèles sont volontaires ; un doublon est bloqué ; vérification des permissions en API.
- [ ] L'option globale et l'option par taxe sont toutes deux obligatoires pour appliquer une TVA automatique.
- [ ] POS : ligne imposable à taxe unique = TVA calculée, prix HT/TTC respectés et total cohérent.
- [ ] POS : plusieurs taxes éligibles = erreur explicite, aucune facture fictive.
- [ ] POS : article exonéré ou non taxable = pas de TVA automatique.
- [ ] Site distinct : juridiction du site respectée, pas de transfert implicite entre territoires.
- [ ] Mobile Money : les dépôts/retraits ne deviennent pas des ventes taxées sur leur principal.
- [ ] Facture client : montants HT, taxe et TTC concordent avec POS / vente.
- [ ] Facture client : taux/juridiction/version conservés, même après changement du taux courant.
- [ ] Comptabilité : aucune double écriture, posting idempotent, période clôturée protégée.
- [ ] Créances, caisse, trésorerie et remboursements conservent leurs invariants.
- [ ] Tenant A ne lit ni ne modifie les paramètres ou taxes de Tenant B.
- [ ] E2E manuel authentifié par le propriétaire : **résultat à fournir pour validation, jamais présumé BON**.

La suite de vérifications statiques ne remplace pas les tests d'intégration, de conformité fiscale ni le E2E fonctionnel manuel.
