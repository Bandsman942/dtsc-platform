# DTSC Platform

**Plateforme SaaS multi-entreprises de Data and Tech Solutions Consulting (DTSC)**

*Le numérique au service de votre performance.*

DTSC Platform réunit, dans une application web Next.js, le site public de DTSC, les comptes utilisateurs, les abonnements, les espaces de travail des entreprises clientes, les modules ERP, les assistants IA, la collaboration et la Console interne DTSC.

Ce README est le **point d'entrée du dépôt**, pas le journal chronologique des hotfixes. Il décrit les capacités représentées dans le code de `main` après la PR [#1020](https://github.com/Bandsman942/dtsc-platform/pull/1020), le 3 novembre 2026. Pour le détail métier, les règles opérationnelles et les preuves de recette, consulter les documents spécialisés dans [`docs/`](docs/TECHNICAL_DOCUMENTATION.md).

> **Périmètre de la documentation :** un module présent dans le code ou déclaré `ACTIVE` dans un registre n'est pas automatiquement disponible pour toute entreprise, inclus dans tout abonnement, configuré en production ou certifié commercialement. Son accès dépend du contexte, du secteur, du plan, des dépendances, des permissions et de sa maturité réelle.

## 1. Produits et parcours

Les cinq surfaces sont hébergées par **un seul projet Next.js/Vercel**, avec routage selon le nom de domaine et session partagée lorsque la configuration l'autorise.

| Produit | Domaine | Capacités principales |
| --- | --- | --- |
| Site public | [dtsc-platform.com](https://dtsc-platform.com) | Présentation DTSC, services, solutions, secteurs, projets, ressources éditoriales, contact, newsletter et assistant public |
| Compte | [account.dtsc-platform.com](https://account.dtsc-platform.com) | Inscription, connexion, récupération de compte, MFA et redirection vers l'espace autorisé |
| Application | [app.dtsc-platform.com](https://app.dtsc-platform.com) | Tableau de bord, abonnement, profil, paramètres, IA, collaboration, espaces entreprise et ERP |
| Console DTSC | [console.dtsc-platform.com](https://console.dtsc-platform.com) | Pilotage interne, entreprises clientes, abonnements, contenus, support, sécurité et activités des directions habilitées |
| Support | [support.dtsc-platform.com](https://support.dtsc-platform.com) | Tickets, échanges et suivi des demandes dans le périmètre autorisé |

Les routes réelles restent dans `app/` et `app/api/`. Le routage et les URL sont centralisés dans `lib/domains.ts` et `middleware.ts` ; voir [Routage et sous-domaines](docs/ROUTING_AND_SUBDOMAINS.md).

## 2. Capacités effectivement codées

### Compte, SaaS et collaboration

- Gestion des comptes, profils, préférences, notifications, invitations, organisations et contexte actif (`GLOBAL_CLIENT`, `ORGANIZATION`, `DTSC_INTERNAL`).
- Abonnements personnels et organisationnels, catalogue commercial, limites de consommation, facturation SaaS, demande de renouvellement manuel et traitements internes des demandes de paiement.
- Chatbot général, IA Assistant Entreprise, bases de connaissance et conversations persistées, avec outils conditionnés par les autorisations.
- Messagerie et groupes de collaborateurs, annonces, commentaires, calendriers, réunions, appels audio/vidéo et partage de contenu selon les fonctionnalités et intégrations configurées.
- Coordination : tâches, demandes, validations, réunions, workflows, documents et activités des collaborateurs.
- PWA installable, notifications navigateur et interface responsive avec garde-fous de cache pour les données privées.

### ERP commun des entreprises clientes

Le registre ERP déclare notamment les domaines suivants. Les services métier possèdent leurs propres modèles, routes, contrôles d'accès et tests ; les anciens objets génériques ne doivent pas redevenir une seconde source d'écriture.

| Domaine | Modules et opérations présents dans le code |
| --- | --- |
| Administration | Entreprise, collaborateurs, postes, départements, rôles, permissions, audit, identités et consentements, relations et avantages |
| Référentiels et commerce | Tiers/prospects/clients, catalogue, sites et entrepôts, CRM/pipeline, devis, commandes, ventes et contrats |
| Achats et logistique | Fournisseurs, achats, réceptions, stocks, inventaires, transferts et mouvements |
| RH, temps et projets | RH, présences et congés, paie opérationnelle, projets, prestations, temps/livrables, actifs et maintenance |
| Pilotage et processus | Tâches, demandes, validations, réunions, workflows versionnés, documents, rapports et IA d'entreprise |
| Finance opérationnelle | Créances, dettes, paiements et allocations, trésorerie, caisse, banque, transferts et rapprochement |
| Comptabilité et finance avancée | Plan comptable, journaux et écritures, fiscalité, clôture, états financiers, immobilisations et valorisation des stocks |

La comptabilité ERP s'appuie sur des écritures en partie double, des opérations idempotentes et une correction des écritures comptabilisées par contrepassation. Les factures et paiements sectoriels convergent vers les objets financiers communs, sans dupliquer le grand livre.

### Extensions sectorielles

| Secteur / profil | Composants codés |
| --- | --- |
| Santé (`HEALTH_CARE`) | Patients, rendez-vous, consultations, dossiers médicaux, équipe soignante, laboratoire, prescriptions, facturation et documents médicaux |
| Pharmacie (`PHARMACY`) | Médicaments et produits, lots/péremptions, stock, ordonnances, dispensation, achats, caisse, qualité, pharmacovigilance et rapports |
| Commerce / Shop | Point de vente `RETAIL_POS`, agence Mobile Money, recharges télécoms, clôture journalière, tarifs, avantages et parcours de vente |
| Gaming | Postes, sessions, réservations, tarification, encaissement, clôture, tournois et rapports |
| Production et couture | Nomenclatures, ordres de production, exécution, qualité, rebuts ; mensurations, patrons, coupe, essayages, retouches et suivi des vêtements |
| Éducation | Paramètres, structure et calendrier académiques, admissions, étudiants, parents et tuteurs |

Les capacités sectorielles ne sont ni universelles ni activées par défaut. Par exemple, les modules génériques historiques d'assurance, de missions ou de classes peuvent être `PLANNED` ; plusieurs écrans administratifs historiques Santé sont `HIDDEN` dans le registre effectif.

### Directions internes DTSC

La Console et les activités internes couvrent des espaces autorisés pour **CEO, COO, CTO, HR & CFO, MPO, SCO et LA** : supervision, opérations, projets techniques, ressources humaines, finance interne, approvisionnements, coordination et dossiers métier. Ces accès dépendent d'un **membership DTSC actif et des postes/permissions officiels**, pas d'un simple rôle global.

Voir [Tableaux de bord des directions](docs/STANDARD_DTSC_INTERNAL_ROLE_DASHBOARDS.md) et [Architecture des modules standards](docs/STANDARD_MODULE_DOMAIN_ARCHITECTURE.md).

## 3. Statut des modules : ce que signifie « disponible »

Deux registres servent de sources de vérité :

- **Modules standards** : [`lib/modules/standard-module-registry.ts`](lib/modules/standard-module-registry.ts) et [`standard-module-registry-data.json`](lib/modules/standard-module-registry-data.json) pour les surfaces personnelles, publiques, Console, Support et collaboratives.
- **Modules ERP** : [`lib/enterprise/module-registry.ts`](lib/enterprise/module-registry.ts) et les fichiers `module-registry-*.json` pour les domaines communs et sectoriels.

Les statuts d'implémentation distinguent `ACTIVE`, `BETA`, `PLANNED`, `HIDDEN`, `DEPRECATED` et `RETIRED`. Les modules `PLANNED` et `HIDDEN` ne constituent pas des fonctionnalités ouvrables. Le registre standard distingue en plus la **maturité commerciale** (`BACKEND_READY`, `READ_ONLY_UI`, `OPERATIONAL_UI`, `PROFESSIONAL_READY`, `COMMERCIAL_READY`).

En pratique, l'ouverture d'un module exige aussi : organisation et membership actifs, secteur ou sous-profil compatible, abonnement/entitlement, dépendances, permissions serveur et configuration métier. **`ACTIVE` est un statut technique, pas une preuve de validation E2E ou de disponibilité commerciale.**

Références : [Architecture ERP](docs/ERP_FINAL_ARCHITECTURE.md), [navigation et accès](docs/ERP_NAVIGATION_AND_ACCESS_CONTRACT.md), [maturité commerciale](docs/STANDARD_MODULE_COMMERCIAL_READINESS.md) et [offres SaaS](docs/SAAS_PLANS_AND_ENTITLEMENTS.md).

## 4. Identité, sécurité et isolation

- Authentification côté serveur avec session révocable et cookie signé `HTTP-only`, adaptée aux sous-domaines officiels.
- MFA par application TOTP : enrôlement local par QR code, validation au login, codes de récupération à usage unique, politiques globales et par entreprise, appareils/sessions révocables et navigateurs reconnus.
- Alertes de nouvelle connexion et réauthentification récente (*step-up*) pour les opérations sensibles identifiées par le serveur.
- Paramètres personnels de sécurité regroupés dans une section compacte Design 2.0 : session actuelle, MFA, appareils connectés, navigateurs reconnus, sessions et notifications.
- Autorisations tenant-scoped : session, contexte actif, membership, module, entitlement, permission, visibilité de l'objet, validation des entrées, limitation de débit, transaction et audit selon l'opération.
- Séparation stricte entre données internes DTSC, données des entreprises clientes, dossiers médicaux et données financières. Un rôle global n'accorde pas un accès universel.

Le chiffrement des secrets TOTP requiert une configuration serveur dédiée. **Ne jamais placer de secret, de code de secours ou de véritable QR d'enrôlement dans le dépôt, les logs ou une capture publique.**

Voir [TOTP](docs/AUTH_TOTP_SECURITY_RUNBOOK.md), [parcours MFA](docs/AUTH_MFA_LOGIN_RUNBOOK.md), [sessions](docs/AUTH_SESSION_REGISTRY_RUNBOOK.md), [politiques MFA](docs/AUTH_MFA_POLICY_RUNBOOK.md) et [sécurité avancée](docs/AUTH_ADVANCED_SECURITY_RUNBOOK.md).

## 5. IA et connaissance

L'IA est orchestrée côté serveur entre le chatbot général, l'assistant d'entreprise et les surfaces autorisées. Le code comprend un catalogue de fournisseurs/modèles (dont les intégrations compatibles OpenAI et OpenRouter), le routage de requêtes, des limites de plan, la journalisation des coûts et des outils métier gouvernés.

Le RAG documentaire filtre les sources et fragments selon l'organisation, la confidentialité et les permissions. Les opérations de l'IA sur l'ERP réutilisent les services canoniques, avec confirmation et audit lorsqu'une action sensible est autorisée. Un modèle présent au catalogue ne garantit ni son activation dans les variables Production, ni la disponibilité de son fournisseur.

Références : [Orchestration IA](docs/STANDARD_AI_ORCHESTRATION_ARCHITECTURE.md), [runtime Agent](docs/STANDARD_AI_AGENT_RUNTIME.md) et [gouvernance MCP](docs/STANDARD_DTSC_AI_MCP_GOVERNANCE.md).

## 6. Abonnements et paiements DTSC

L'application distingue trois périmètres **à ne pas fusionner dans une même source de vérité** :

1. **Facturation SaaS DTSC** : offres personnelles et entreprises, factures, abonnements, `Payment`, checkout MaishaPay lorsqu'il est configuré et dossiers de paiement/renouvellement manuel.
2. **Trésorerie interne DTSC** : comptes et opérations HR & CFO, distincts de l'ERP de ses clients.
3. **Paiements ERP clients** : `EnterprisePayment`, allocations, sessions de caisse, trésorerie et comptabilité de chaque entreprise cliente.

Le programme **DTSC Payments** possède une architecture documentée en **PAY-0**, mais les étapes PAY-1 à PAY-9 ne doivent pas être considérées comme livrées sur la seule base de cette documentation. En particulier, certification complète des providers, paiements récurrents et nouveaux parcours de rapprochement restent soumis à leurs livraisons et recettes propres.

Voir [DTSC Payments — état réel et cible](docs/DTSC_PAYMENTS_ARCHITECTURE.md) et [catalogue/entitlements](docs/SAAS_PLANS_AND_ENTITLEMENTS.md). Les tarifs effectifs proviennent du catalogue administré en base : ne pas reproduire une grille chiffrée statique dans ce README.

## 7. Stack et architecture du dépôt

| Couche | Implémentation |
| --- | --- |
| Application | Next.js App Router 15, React 19, TypeScript 5, Tailwind CSS 4 |
| Validation et données | Zod 4, Prisma 6 (schéma multi-fichiers), PostgreSQL/Neon |
| IA et fichiers | APIs de modèles côté serveur, recherche vectorielle/RAG, Supabase Storage selon configuration |
| Temps réel et communication | LiveKit pour les appels, Zoho Mail pour les parcours email selon configuration |
| Cache et limitation de débit | Redis/Upstash lorsque configuré, protections applicatives en repli selon les parcours |
| Paiement SaaS | Adaptateur MaishaPay côté serveur, callbacks et flux de validation métier |
| Exploitation | Vercel, GitHub Actions, scripts QA Node, PWA/service worker |

Répertoires structurants :

- `app/` : pages App Router, produits, workspaces et `app/api/` ;
- `components/` : UI, design système, modules métier et composants `workspace/` ;
- `lib/` : authentification, services métier, registres, résolveurs d'accès, IA et intégrations ;
- `prisma/` : modèles Prisma, migrations et schémas sectoriels ;
- `scripts/` : QA, audits, migration et outils de maintenance ;
- `docs/` : contrats normatifs, architecture, guides, runbooks et E2E ;
- `.github/workflows/` : Quality Gates, migrations, QA spécialisées et livraison ;
- `public/` : assets, manifeste/PWA et service worker.

Le Design 2.0 réutilise notamment `ModuleWorkspace`, `ModuleHeader`, `ModuleSection`, `BusinessList`, `BusinessDetail` et les actions contextuelles ; l'affichage est responsive, avec interface FR/EN et contraintes mobile/PWA.

## 8. Démarrage local

### Prérequis

- **Node.js 22.x** (contrat `engines` de `package.json`) et **pnpm** ;
- une base PostgreSQL de développement compatible Prisma ;
- les accès et variables nécessaires aux intégrations que vous souhaitez réellement tester.

Depuis la racine du dépôt :

```bash
cp env.example .env.local
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Configurer les variables de `.env.local` **avant** la génération/migration et le démarrage. `pnpm prisma:deploy` applique les migrations à la base pointée par `DATABASE_URL` : utiliser exclusivement une **base de développement**. Ne pas exécuter cette commande contre la Production pour un simple démarrage local.

Ouvrir [http://localhost:3000](http://localhost:3000). Sur localhost, ne pas imposer le domaine de cookie réservé à `*.dtsc-platform.com`.

### Configuration par domaine

Le fichier [`env.example`](env.example) décrit les variables prises en charge. Les principales familles sont :

| Besoin | Variables indicatives |
| --- | --- |
| Base et session | `DATABASE_URL`, `AUTH_SECRET`, paramètres de cookie et URLs des produits |
| MFA | clé de chiffrement TOTP documentée dans le runbook d'authentification |
| IA | clés des providers, catalogues de modèles, limites et configuration RAG |
| Paiements SaaS | `MAISHAPAY_*` et callback vérifié, uniquement si le provider est activé |
| Email | `ZOHO_*` et paramètres d'expédition |
| Fichiers, temps réel, rate limiting | `SUPABASE_*`, `LIVEKIT_*`, `UPSTASH_REDIS_*` |

Les intégrations absentes peuvent limiter des fonctions ou activer leurs états de repli. **N'ajoutez jamais de clé réelle dans un commit, une issue, un README ou un log.** Aucun compte administrateur ni mot de passe par défaut n'est publié ici : le bootstrap d'administration doit être géré comme une procédure sécurisée et désactivé ensuite.

## 9. Qualité, contribution et déploiement

Principales commandes déclarées dans `package.json` :

```bash
pnpm prisma:generate
pnpm type-check
pnpm qa:regression
pnpm lint
pnpm build
```

Le dépôt possède également des QA ciblées par domaine, par exemple `pnpm qa:dtsc-payments-contract`. Une QA documentaire ne remplace ni un test transactionnel ni un E2E navigateur. La source des commandes et de leur composition reste `package.json`.

**Circuit obligatoire :** Issue → branche numérotée depuis le dernier `main` → commits → Pull Request → Quality Gates/migrations/QA applicables → revue → `OWNER_E2E` lorsque requis → squash/merge → déploiement automatique Vercel **Production depuis `main` uniquement** → vérification du **même SHA** et de l'état `READY`.

Les **Preview Vercel sont désactivées** par la politique du projet. Aucune branche feature ne doit être déployée manuellement en Production. Les migrations historiquement appliquées ne sont pas réécrites ; les changements de schéma exigent leurs migrations et plans de rollback.

Avant toute contribution, lire [`AGENTS.md`](AGENTS.md), [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md), le [contrat de livraison](docs/DELIVERY_GOVERNANCE.md) et les éventuels `AGENTS.md` locaux au domaine modifié.

## 10. Guide de la documentation

| Besoin | Référence |
| --- | --- |
| Architecture générale, couches et décisions | [Documentation technique](docs/TECHNICAL_DOCUMENTATION.md) |
| Modules ERP, sources de vérité et legacy | [Architecture ERP finale](docs/ERP_FINAL_ARCHITECTURE.md) · [Runbook ERP](docs/ERP_FINAL_OPERATIONAL_RUNBOOK.md) |
| Sécurité, sessions et MFA | [Runbook sécurité TOTP](docs/AUTH_TOTP_SECURITY_RUNBOOK.md) · [matrice E2E Auth](docs/AUTH_OWNER_E2E_MATRIX.md) |
| Abonnements et droits | [SaaS, plans et entitlements](docs/SAAS_PLANS_AND_ENTITLEMENTS.md) |
| Finance et comptabilité | [Architecture Finance](docs/ERP_FINANCE_ARCHITECTURE.md) · [Intégrité financière](docs/ERP_FINANCIAL_INTEGRITY_CONTROLS.md) |
| Health / Pharmacy | [Modules sectoriels](docs/enterprise-sector-modules.md) · [Convergence Finance sectorielle](docs/ERP_FINAL_ARCHITECTURE.md) |
| Commerce Shop / Mobile Money | [Programme Shop 2.0](docs/SHOP_2_0_PROFESSIONALIZATION_PROGRAM.md) · [Guide Shop FR](docs/SHOP_2_0_COMMERCIAL_USER_GUIDE_FR.md) |
| Gaming et autres secteurs | [Architecture sectorielle](docs/ERP_SECTOR_COMMERCIAL_PACKAGING.md) |
| IA et assistants | [Orchestration IA](docs/STANDARD_AI_ORCHESTRATION_ARCHITECTURE.md) |
| UX, responsive et formulaires | [Design système](docs/DTSC_FRONTEND_DESIGN_SYSTEM.md) · [Contrat responsive](docs/RESPONSIVE_UI_CONTRACT.md) · [Formulaires](docs/FORM_UX_CONTRACT.md) |
| CI, recette et livraison | [QA de régression](docs/QA_REGRESSION_CHECKLIST.md) · [Politique Vercel](docs/VERCEL_PRODUCTION_ONLY_POLICY.md) · [Gouvernance](docs/DELIVERY_GOVERNANCE.md) |

## 11. Limites de lecture et responsabilité

- Ce README ne constitue ni une certification de Production ni une promesse que tous les modules soient disponibles pour tous les clients.
- Les routes, schémas, registres, services métier et QA du dépôt font foi sur les fonctionnalités réellement codées. La configuration Production, les paiements réels, les migrations appliquées et les validations E2E doivent être vérifiés séparément.
- Toute évolution fonctionnelle exige une mise à jour de la documentation du domaine et des tests associés ; le README reste volontairement stable, synthétique et orienté navigation.

**DTSC — Data and Tech Solutions Consulting** · [dtsc-platform.com](https://dtsc-platform.com)
