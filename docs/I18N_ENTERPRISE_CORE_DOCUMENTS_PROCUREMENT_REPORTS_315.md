# Issue #315 — i18n Enterprise Core Documents, Fournisseurs, Achats et Rapports

## Contexte

Ce lot poursuit la vague i18n 2/4 de #267 après le lot de coordination #313/#314. Il converge les quatre surfaces Enterprise Core suivantes vers la source de traduction canonique appelée par les workspaces :

- Documents ;
- Fournisseurs ;
- Achats ;
- Rapports.

La baseline de travail est `main@8d4da6216f46bee4cd40ff502c204b5d047c26c1`, correspondant au merge Production de #314.

## Architecture i18n

`enterpriseCoreT(...)` reste l’unique traducteur appelé par les workspaces concernés. Le catalogue historique `enterprise-procurement.fr/en.json` est conservé pour compatibilité avec les consommateurs existants mais devient un fragment explicitement composé par `lib/enterprise-core-i18n.ts`.

Ce choix évite :

- une deuxième fonction de traduction dans les nouveaux workspaces ;
- la duplication des chaînes Procurement dans plusieurs JSON ;
- une rupture des consommateurs historiques de `translateEnterpriseProcurement` ;
- des ternaires locaux FR/EN.

Les fragments FR et EN conservent une parité stricte de clés, gardée par la QA #315.

## Documents

La présentation localise désormais :

- types de documents ;
- visibilités ;
- types de cibles liées ;
- métriques, filtres, actions et dialogues ;
- messages de création, liaison, version et archivage ;
- états historiques et détail.

Les contrats privés restent inchangés : création de métadonnées, upload de version, lien serveur, téléchargement signé, archivage et contexte `sourceEntityType/sourceEntityId`.

Aucun nom/titre/description saisi par l’utilisateur n’est traduit.

## Fournisseurs

La présentation localise désormais :

- statuts fournisseur via le helper commun `statusLabel` ;
- types organisation/personne physique ;
- états des relations d’identité DTSC ;
- formulaires, contacts, actions et aides ;
- messages et vues historiques.

Les contrats d’identité restent inchangés : `SUPPLIER_REPRESENTATIVE`, invitations privées, `supplierId`, `supplierContactId`, choix de consentement et séparation organisation/représentant.

## Achats

Le workspace utilise désormais :

- `priorityChoices(locale)` au lieu des tableaux FR/EN ;
- `formatEnterpriseAmount(...)` pour les montants ;
- `formatEnterpriseDate(...)` pour les dates ;
- `enterpriseCoreT(...)` pour toute copie système de la surface.

Les actions métier restent inchangées : `SUBMIT`, `ORDER`, `CLOSE`, `CANCEL`, réception, approbateur désigné, engagement budgétaire et deep-link Achat → Finance pour la création de dépense.

## Rapports

La présentation localise désormais :

- types et statuts de rapports ;
- familles ;
- sources de données ;
- politiques de fraîcheur ;
- métriques du catalogue ;
- visibilité des vues enregistrées ;
- libellés du snapshot budgétaire ;
- formulaires, actions et détail.

Les codes techniques restent les valeurs persistées et les contrats serveur ; ils ne servent plus de libellés client dans les projections gardées par #315.

La génération, les vues enregistrées, l’export, la publication et l’archivage restent inchangés.

## QA opposable

`scripts/qa-enterprise-documents-procurement-reports-i18n-315.mjs` est intégré à `scripts/run-regression-qa-ci.mjs`.

La gate vérifie notamment :

- parité exacte FR/EN du fragment Procurement/Enterprise Core ;
- présence de `enterpriseCoreT(...)` dans les quatre workspaces ;
- absence de switch local `en`, de ternaires de copie FR/EN et de locales Intl visibles codées en dur ;
- disparition des dictionnaires locaux de visibilité, identité, statuts et rapports ;
- projection des types/statuts/visibilités/sources/métriques par des libellés utilisateur ;
- usage des helpers de priorité, date et montant canoniques ;
- conservation des endpoints et deep-links métier critiques.

## Données, Prisma et rollback

- schéma Prisma : inchangé ;
- migration : aucune ;
- backfill : aucun ;
- valeurs métier persistées : inchangées ;
- rollback : revert applicatif de la PR.

Les valeurs techniques des enums/actions restent identiques. Seule leur projection utilisateur est localisée.

## Sécurité et multi-tenant

Aucun changement n’est apporté à :

- session/membership ;
- `organizationId` ;
- RBAC/capabilities ;
- validation serveur des cibles liées ;
- stockage ou téléchargement privé ;
- consentement des identity links ;
- périmètre Procurement/Finance.

## Livraison

La politique Production-only reste opposable : aucun commit de branche ou PR #315 ne doit provisionner de Preview Vercel. Seul le commit final fusionné sur `main`, après CI et OWNER_E2E requis, peut déclencher Vercel Production.

## État des preuves avant PR

| Contrôle | Statut | Preuve |
|---|---|---|
| baseline exacte | CI_PROVEN | branche créée depuis `main@8d4da6216f46bee4cd40ff502c204b5d047c26c1` |
| diff final | NOT_EXECUTED | à comparer avant PR |
| QA #315 | NOT_EXECUTED | CI requise |
| régression | NOT_EXECUTED | CI requise |
| type-check | NOT_EXECUTED | CI requise |
| lint | NOT_EXECUTED | CI requise |
| build | NOT_EXECUTED | CI requise |
| Preview Vercel | NOT_EXECUTED | doit rester absent |
| OWNER_E2E FR/EN mobile/desktop | NOT_EXECUTED | requis avant merge |
