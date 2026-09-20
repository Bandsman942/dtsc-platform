# Hotfix #669 — UI/i18n & Code Convergence ERP

## Objectif

Faire converger les workspaces ERP actifs vers des chemins et noms canoniques, tout en réduisant la dette i18n visible sans modifier les contrats métier, les permissions, les données ou le schéma Prisma.

Ce hotfix part du `main` contenant #668.

## Convergence des workspaces

Les implémentations actives suivantes vivent désormais sous leur nom canonique :

- Tiers & clients ;
- Catalogue ;
- CRM ;
- Contrats ;
- Actifs & maintenance ;
- IA Entreprise ;
- Comptabilité ;
- Finance avancée (Fiscalité, Clôture, États financiers, Immobilisations) ;
- Ventes & créances / Achats & dettes ;
- Paiements ;
- Trésorerie ;
- Banque & Rapprochement ;
- Administration entreprise.

Les anciens fichiers `*-v2`, `*-v3`, `*-hotfix` et `*-legacy` concernés deviennent des bridges de compatibilité minces qui réexportent l’implémentation canonique. Ils ne constituent plus une deuxième implémentation active.

Deux couches internes ont reçu un nom fonctionnel au lieu d’un nom historique :

- `finance-professional-workspace-core.tsx` pour les primitives Finance partagées ;
- `enterprise-finance-cash-bank-reconciliation-base.tsx` pour la base Banque/Rapprochement.

L’administration utilise désormais `enterprise-administration-panels.tsx` et `enterprise-administration-panels-base.tsx`.

La suppression physique des bridges historiques reste volontairement hors scope et appartient à #670, après preuve de zéro référence.

## i18n et présentation client

Le workspace ERP commun utilise le catalogue `translateWorkspaceGeneralization` pour la copie partagée déjà disponible.

Les dates et heures de ce workspace utilisent la locale active :

- `fr-FR` pour le français ;
- `en-US` pour l’anglais.

Les statuts contrôlés passent par `getControlledStatusLabel`; les valeurs inconnues sont humanisées au lieu d’être rendues comme un enum brut.

Les cartes d’entrée Finance « Comptabilité périodique », « Opérations de clôture » et « Cessions d’actifs » utilisent désormais le catalogue `enterprise-finance.fr/en.json` au lieu de ternaires FR/EN locaux.

Les catalogues Finance gardent une parité stricte de clés FR/EN.

## Responsive et accessibilité

Les implémentations déplacées conservent les primitives et contrats existants :

- `ModuleWorkspace` ;
- formulaires `presentation="editor"` ;
- actions responsives ;
- absence de `w-screen` dans les workspaces professionnels couverts ;
- scroll interne des dialogues, safe areas et clavier mobile via les primitives communes ;
- statuts et enums projetés par les helpers métier existants.

La validation rendue reste obligatoire aux largeurs 320, 360, 375, 390, 414, 768 et 1024 px, en clair/sombre et FR/EN.

## QA

`pnpm qa:hotfix-669` protège notamment :

1. le sens des bridges historiques vers les fichiers canoniques ;
2. l’absence d’import de workspace suffixé dans les routeurs actifs ;
3. le routage canonique Finance et IA Entreprise ;
4. le routage canonique de l’administration ;
5. la locale active dans le workspace commun ;
6. la parité des catalogues Finance FR/EN ;
7. les primitives responsive des workspaces déplacés ;
8. la projection métier des statuts/enums ;
9. le branchement de la gate dans `qa:regression`.

La CI dédiée exécute en plus Prisma generate, migrations depuis une base propre, régression complète, type-check, lint et build.

## Base de données

- migration Prisma : aucune ;
- backfill : aucun ;
- changement de données : aucun ;
- changement destructif : aucun.

## Sécurité

Ce hotfix ne modifie pas les resolvers d’accès, entitlements ou règles tenant. Les workspaces canoniques continuent d’utiliser les mêmes routes serveur, permissions et contrôles multi-tenant qu’avant la convergence.

## Rollback

Revert applicatif de la PR #669. Aucun rollback de données ou de migration n’est requis.

## OWNER_E2E

La recette propriétaire est définie dans `docs/OWNER_E2E_669_UI_I18N_CODE_CONVERGENCE.md`.
