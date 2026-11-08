# Hotfix RETAIL — Parcours guidé multiboutique et accès personnel

## Objectif et périmètre

Une organisation cliente `COMMERCE_RETAIL` peut gérer plusieurs boutiques sans créer plusieurs entreprises ni dupliquer les données ERP. Deux entrées sont ajoutées au répertoire **Point de vente / POS** :

- **Configurer mes boutiques** (OWNER/ADMIN_ENTREPRISE uniquement) : liste des sites actifs, suivi par boutique et checklist directement reliée aux modules ERP de référence.
- **Mes boutiques** (collaborateurs et propriétaire) : boutiques affectées, rôles autorisés et accès direct à la vente au comptoir et à la facturation. Les administrateurs voient tous les sites actifs.

Chaque boutique possède les prérequis visibles suivants :

1. au moins un **entrepôt actif** rattaché au site ;
2. au moins un **compte de caisse actif** du site dans la devise Retail principale, avec compte du grand livre actif ;
3. au moins un droit actif pour `VIEW_SALES`, `PREPARE_INVOICE` et `COLLECT_PAYMENT` (la même personne peut exercer plusieurs fonctions) ;
4. **isolation par boutique** activée par le workflow de validation existant.

La checklist est un **indicateur orienté onboarding**, pas une autorisation de mettre en production ou un substitut au préflight Finance. La véritable activation reste dans `RETAIL_POS?section=activation` avec vérification serveur, étape MFA et contrôles Finance. La disponibilité du catalogue et la préparation comptable globale restent vérifiées dans `RETAIL_POS?section=readiness`.

## Navigation et données

- Accès : `/enterprise-modules/RETAIL_POS?section=store-setup` → `&siteId=<id>` pour le détail.
- Accès : `/enterprise-modules/RETAIL_POS?section=my-stores` → `?section=checkout&siteId=<id>` ou `?section=invoices&siteId=<id>`.
- Liens canoniques : `SITES_WAREHOUSES#sites`, `#warehouses`, `FINANCE_TREASURY#cash-accounts`, `RETAIL_POS?section=staff`, `?section=activation`.
- Le code de la projection est `lib/enterprise/retail/multi-store-onboarding.ts`; il lit les tables `EnterpriseSite`, `EnterpriseWarehouse`, `EnterpriseFinancialAccount`, `EnterpriseRetailSiteAssignment` sans nouvelle entité ni migration.
- Le `siteId` URL est **indicatif**. La page personnelle obtient la liste des boutiques par l'utilisateur authentifié et les affectations actives. L'opérateur POS n'utilise ce paramètre que pour sélectionner un dépôt déjà présent dans le tableau de bord filtré côté serveur par le hotfix P0. La facturation conserve son ACL serveur, y compris si le `siteId` est forgé.
- La désactivation d'une affectation la retire immédiatement de **Mes boutiques**. L'isolation non activée est signalée, elle n'est **jamais** annoncée comme acquise.

## Owner E2E final — à valider avant fusion

1. Créer deux sites `STORE` (ex. Boutique A et B) dans la même entreprise ; vérifier leurs cartes et checklist.
2. Configurer le dépôt A puis la caisse A en devise Retail et constater l'actualisation du compteur ; tester une caisse dans une devise incompatible.
3. Inviter deux membres dans l'administration d'entreprise ; affecter le premier à A comme caissier et le second à B comme facturier, puis les autorisations complémentaires nécessaires.
4. Activer le cloisonnement après préflight et validation MFA. Vérifier que chaque collaborateur ne voit que **sa** boutique dans **Mes boutiques**.
5. Depuis A, ouvrir la vente comptoir et vérifier l'entrepôt de A ; depuis B, ouvrir la facturation avec la sélection B. Forger une URL vers un site interdit : aucune donnée ni capacité supplémentaire ne doit apparaître.
6. Révoquer l'affectation A et recharger : la boutique disparaît du compte concerné et les endpoints opérationnels refusent l'accès.
7. Vérifier qu'un propriétaire voit toutes les boutiques ; les collaborateurs ne voient jamais **Configurer mes boutiques** et la route renvoie 404 si forcée.
8. Tester FR/EN, thème sombre/clair et écrans 320–1440 px ; retour arrière, défilement vertical, safe area sur Chrome mobile.

Commandes de contrôle : `node scripts/qa-retail-multistore-onboarding.mjs`, `node scripts/qa-retail-pos-dashboard-site-isolation.mjs`, `node scripts/qa-hotfix-1042-site-staff.mjs`, `tsc --noEmit`, QA régression, lint et GitHub CI sur les SHA proposés.

## Déploiement

Deux PR distinctes et empilées sont prévues : P0 isolement du tableau de bord POS ; P1 onboarding multiboutique basé sur P0. **Aucun merge avant OWNER E2E final BON**. Pas de Preview Vercel ni de déploiement d'une branche ; production uniquement depuis `main` après approbation et CI verte.
