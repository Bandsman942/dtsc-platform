# Hotfix #549 — ERP commercial guidé

## Périmètre

Ce hotfix aligne les modules suivants sur les contrats UX déjà appliqués à Point de vente et Agence Mobile Money :

- `CRM_CUSTOMERS` — Tiers et clients ;
- `CATALOG` — Catalogue produits et services ;
- `CRM_PIPELINE` — CRM et pipeline ;
- `SALES_QUOTES_ORDERS` — Devis et commandes ;
- `CONTRACTS` — Contrats.

Le travail respecte `docs/CONTRIBUTING.md`, `AGENTS.md`, `docs/FORM_UX_CONTRACT.md` et le contrat des références de formulaires documenté par l’Issue #467.

## Diagnostic confirmé

### Devis et commandes

Deux pannes bloquantes coexistaient :

1. le workspace demandait `professional-lookups?module=SALES_QUOTES_ORDERS` alors que cette valeur n’était pas autorisée par la route de lookups ;
2. le workspace appelait `/catalog-items`, route inexistante, au lieu de la source canonique `/catalog`.

Le frontend transformait ensuite certaines erreurs HTTP en tableaux vides, donnant l’impression que l’entreprise n’avait ni clients, ni dépôts, ni catalogue.

### Tiers et clients

La création d’une fiche puis l’envoi d’une invitation DTSC étaient deux mutations successives. Un échec de l’invitation pouvait laisser la fiche créée tout en affichant un échec global, puis un retry pouvait recréer une fiche similaire.

### CRM

Le parcours « nouveau prospect » créait prématurément un Tiers, éventuellement une invitation, puis un Lead. Le backend possède pourtant déjà une conversion transactionnelle Lead → Tiers/client. Cette duplication créait un risque d’écriture partielle et de doublon. Le motif de perte utilisait aussi `window.prompt`.

### Catalogue

La devise et le code taxe étaient saisis librement. La famille d’unité était également une saisie peu guidée, alors que le contrat #467 précise qu’elle est volontairement personnalisable par entreprise et qu’aucun référentiel global DTSC ne doit être inventé. Les formulaires longs n’utilisaient pas systématiquement le mode `editor` de la primitive Dialog.

### Contrats

Le motif de résiliation était rendu comme erreur applicative, l’archivage pouvait partir sans confirmation contrôlée et l’édition pouvait se superposer au détail. Les erreurs d’action étaient affichées hors du dialog concerné.

## Architecture retenue

### Workspaces guidés

Les gros workspaces Tiers, CRM, Catalogue et Contrats délèguent à des implémentations guidées dédiées `*-workspace-v2.tsx`. Les routeurs et codes de modules restent inchangés : il n’existe aucune seconde source de vérité métier.

Les formulaires longs utilisent `Dialog presentation="editor"`, avec :

- scroll vertical interne ;
- prise en compte du clavier mobile et des safe areas ;
- footer d’actions stable ;
- états `busy` et `disabled` ;
- conservation des valeurs tant que le backend n’a pas confirmé le succès.

### Références tenant-scoped

`professional-lookups` expose maintenant, dans le contexte de l’organisation autorisée :

- membres ;
- départements ;
- tiers ;
- dépôts ;
- devises issues de la configuration Finance et des comptes financiers ;
- codes taxe actifs.

`SALES_QUOTES_ORDERS` est explicitement autorisé dans cette route.

Le Catalogue revalide côté serveur tout code taxe reçu avec `organizationId + code + isActive=true`. Le navigateur ne devient jamais l’autorité.

La famille d’unité respecte le contrat #467 : le formulaire propose d’abord les familles déjà présentes dans les unités du tenant. Une option explicite permet de créer une nouvelle famille propre à l’organisation. Aucune liste globale `QUANTITY/WEIGHT/...` n’est introduite comme seconde source de vérité.

### Tiers et identité

Une fiche Tiers créée avec succès reste un succès métier même si l’invitation DTSC échoue ensuite. L’échec d’invitation produit un avertissement et peut être repris depuis la fiche existante sans recréer le Tiers.

### CRM

Un nouveau prospect est créé comme Lead. Le Tiers n’est créé ou sélectionné qu’au moment de la conversion qualifiée, en utilisant le service transactionnel existant. Le mode « tiers existant » réutilise les coordonnées canoniques de la fiche sélectionnée.

Les transitions vers `LOST` utilisent un dialog contrôlé avec motif obligatoire ; `window.prompt` n’est plus utilisé.

Le pipeline indique explicitement qu’il représente la page courante lorsque la pagination s’applique.

### Devis et commandes

Le catalogue est interrogé via `/catalog` avec recherche serveur, page de 50 éléments et statut actif. Les réponses HTTP non réussies produisent une erreur visible au lieu d’une liste vide silencieuse.

Le devis utilise une devise contrôlée ; une ligne provenant d’un article dans une autre devise est signalée avant soumission.

Rejet et annulation passent par une confirmation contrôlée.

Une livraison reçoit une clé d’idempotence au moment d’ouvrir le parcours. Cette même clé est conservée pendant les retries et n’est remplacée qu’après succès ou ouverture d’une nouvelle livraison.

Les listes Devis/Commandes projettent le Tiers métier par une requête groupée sur les `businessPartyId` de la page, bornée au même `organizationId`. Le schéma Prisma ne définit pas de relation directe Quote/Order → BusinessParty ; le hotfix n’en invente donc pas une.

### Contrats

Les devises viennent des références Finance, avec fallback vers le référentiel monétaire contrôlé DTSC si aucune devise Finance n’est disponible.

Le détail est fermé avant ouverture de l’édition ou d’une action. Toutes les transitions, y compris archivage et activation, passent par un dialog contrôlé. Les erreurs restent dans ce dialog. Le motif de résiliation est affiché comme information métier, pas comme erreur.

## Sécurité

Aucune migration Prisma n’est introduite.

Les contrôles serveur existants sont conservés : session, organisation active, membership, module, entitlement, permission, same-origin, validation Zod, rate limit, audit et logs API selon les routes concernées.

Les références de tiers, taxe, dépôt, membre, devise et autres objets restent revalidées côté serveur dans le même `organizationId` lorsque le domaine l’exige.

## QA permanente

La QA de régression commerciale vérifie notamment :

- `SALES_QUOTES_ORDERS` autorisé dans les lookups ;
- lookups Finance et taxes tenant-scoped ;
- absence de l’ancienne route `/catalog-items?page=1&pageSize=200` ;
- traitement explicite de `response.ok` ;
- recherche catalogue réelle via `/catalog` ;
- absence de `window.prompt` dans les workspaces guidés ;
- formulaires longs en mode `editor` ;
- validation serveur du code taxe Catalogue ;
- réutilisation des familles d’unité du tenant et absence d’une taxonomie globale artificielle ;
- confirmation contrôlée rejet/annulation de devis ;
- confirmation contrôlée archivage de contrat ;
- clé d’idempotence stable pour une tentative de livraison ;
- maintien des transitions serveur et de l’isolation multi-tenant.

Les QA historiques mobile, packaging, CRM, Contrats, identité et i18n ont été adaptées pour suivre les workspaces guidés au lieu de lire uniquement les anciens fichiers relais.

## Rollback

Le rollback applicatif consiste à revenir sur les commits du hotfix #549. Aucun rollback de base de données n’est nécessaire, car aucune migration ni modification destructive de données n’est introduite.

## Dette de contribution

- Dette créée : **Aucune connue**.
- Dette remboursée : sélecteurs silencieusement vides, route catalogue inexistante, lookups ventes refusés, prompts natifs, formulaire/feedback non conformes, idempotence de livraison fragile, taxe Catalogue libre, famille d’unité peu guidée sans inventer de taxonomie globale, dialogs empilés.
- Dette maintenue : aucune dette matérielle identifiée dans le périmètre nécessaire au hotfix.
- Dette reportée : **Aucune**.
