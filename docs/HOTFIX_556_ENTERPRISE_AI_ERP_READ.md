# Hotfix #556 — Assistant IA Entreprise : détails métier et lecture ERP autorisée

## Français

### Objectif utilisateur

L’Assistant IA Entreprise doit pouvoir répondre avec les données métier réellement lisibles par l’utilisateur dans DTSC Platform. Lorsqu’un outil autorisé renvoie un montant, une devise, une quantité, un prix, une date, une référence ou un statut, l’assistant peut restituer fidèlement cette valeur dans une réponse humaine. La protection contre les données backend brutes ne doit jamais être interprétée comme une interdiction de citer les chiffres métier autorisés.

### Ce que l’assistant peut désormais lire

Les 15 outils Finance existants et les lectures spécialisées Pharmacie sont conservés. Le Tool Gateway ajoute 25 lectures ERP certifiées :

- Tâches & opérations ;
- Demandes internes ;
- Validations ;
- Réunions ;
- Workflows ;
- Fournisseurs & achats ;
- Documents ;
- Rapports ;
- Tiers & clients ;
- Catalogue ;
- Sites & entrepôts ;
- CRM & pipeline ;
- Devis & commandes ;
- Contrats ;
- Stock & logistique ;
- Ressources humaines ;
- Temps, présences & congés ;
- Paie opérationnelle ;
- Projets & services ;
- Temps & livrables ;
- Actifs & maintenance ;
- Point de vente ;
- Agence Mobile Money ;
- Télécom & forfaits ;
- Clôture magasin.

### Règle d’accès

Un outil READ est proposé au modèle uniquement si toutes les conditions serveur sont réunies :

1. le contexte actif est l’entreprise concernée ;
2. l’Assistant IA Entreprise est autorisé pour l’utilisateur et l’abonnement ;
3. le secteur et les dépendances du module sont compatibles ;
4. le module est actif et compris dans les entitlements ;
5. `resolveEnterpriseModuleAccess(..., "read")` autorise l’utilisateur ;
6. le Tool Gateway réexécute cette autorisation au moment de l’invocation.

Un rôle global DTSC n’est pas un raccourci vers les données privées d’une entreprise cliente.

### Détails monétaires

Les projections métier conservent les valeurs nécessaires à une réponse de gestion, notamment :

- Finance : montants, devises, comptes, références, dates, statuts et mouvements autorisés ;
- achats : sous-total, taxes, total, prix unitaires et lignes ;
- CRM : valeur estimée et devise ;
- devis/commandes : sous-total, remises, taxes et total ;
- contrats/projets/actifs : montants ou budgets indicatifs et devise ;
- paie : brut, primes, retenues et net ;
- Retail POS : sous-total, remise, taxe, total et règlements ;
- Mobile Money : principal, frais client, commission opérateur, effet caisse, effet float et devise ;
- Télécom : vente, coût opérateur, marge et devise ;
- clôture magasin : solde système, solde déclaré et écart.

Le runtime indique explicitement au modèle de ne pas reproduire la structure JSON ou les champs techniques, tout en lui demandant de restituer fidèlement les valeurs métier autorisées lorsqu’elles sont pertinentes. Une valeur absente ne doit jamais être inventée.

### Minimisation et confidentialité

Les adaptateurs sont statiques et bornés. Ils n’utilisent jamais `moduleCode -> prisma[model]`. Les réponses excluent les identifiants backend inutiles, secrets, tokens, métadonnées internes, payloads bruts et chaînes de pensée.

Les projections Mobile Money et Télécom ne transmettent pas les numéros de téléphone bruts. Les lectures clients, fournisseurs et RH n’envoient pas par défaut les e-mails et numéros de téléphone au modèle. Les documents ne transmettent pas les chemins de stockage.

### Utilisation

Exemples de demandes supportées, sous réserve des permissions de l’utilisateur :

- « Donne-moi les montants et devises des mouvements non rapprochés. »
- « Détaille les transactions Mobile Money de cette semaine avec frais et commissions. »
- « Quelles commandes clients restent ouvertes et pour quels montants ? »
- « Quels achats sont en attente et quel est leur total ? »
- « Quels articles sont en stock bas ? »
- « Résume les projets actifs, leur progression et leurs budgets indicatifs. »
- « Donne-moi les runs de paie en attente et leurs montants nets. »

Si l’utilisateur n’a pas accès au module concerné, l’outil n’est pas exposé ou son invocation est refusée par le serveur.

## English

### User goal

Enterprise AI must be able to answer with business data the signed-in user is actually allowed to read in DTSC Platform. When an authorized tool returns an amount, currency, quantity, price, date, reference or status, the assistant may faithfully include that value in a human-readable answer. Protection against raw backend data must never be interpreted as a ban on authorized business figures.

### ERP READ coverage

The existing 15 Finance READ tools and specialized Pharmacy reads remain available. The Tool Gateway adds 25 certified ERP READ adapters covering tasks, internal requests, approvals, meetings, workflows, procurement, documents, reports, customers, catalog, sites, CRM pipeline, quotes/orders, contracts, inventory, HR, time/attendance, payroll, projects, deliverables, assets, Retail POS, Mobile Money, Telco and retail daily close.

### Authorization contract

A READ tool is exposed only when the active organization context, Enterprise AI access, plan, sector, dependencies, entitlements and the user’s module permissions all allow it. Every required module is checked through `resolveEnterpriseModuleAccess(..., "read")`, and the Tool Gateway re-authorizes the invocation at execution time. A global DTSC role never bypasses private client-organization access.

### Business-value fidelity

The runtime tells the model not to reproduce raw JSON structures or technical fields, while explicitly allowing and requiring faithful use of authorized business values such as amounts, currencies, quantities, prices, costs, margins, dates, references, statuses, names and labels when relevant to the user’s request. Missing values must never be invented.

### Data minimization

All adapters are explicit, bounded and read-only. There is no dynamic Prisma model lookup. Backend IDs, secrets, tokens, raw payloads, internal metadata and chain-of-thought remain excluded. Mobile Money and Telco projections do not expose raw phone numbers, and customer/HR reads do not expose contact details by default.

## QA permanente / Permanent QA

`scripts/qa-hotfix-556-enterprise-ai-erp-read.mjs` verifies:

- all 25 ERP READ mappings;
- registry/schema/executor integration;
- module-level re-authorization;
- Finance and Retail monetary fields;
- Mobile Money monetary detail;
- absence of raw phone/contact projections;
- bounded reads;
- absence of mutations and dynamic Prisma access;
- canonical stock-movement fields;
- post-tool instructions that preserve authorized business values without exposing raw backend data.

The gate is included in `scripts/qa-standard-modules-iteration-05.mjs` so future regressions fail the standard AI quality suite.

## Migration et déploiement

Aucune migration Prisma et aucune nouvelle variable d’environnement. Production uniquement après merge sur `main`, conformément à la politique DTSC sans Preview Vercel intermédiaire.
