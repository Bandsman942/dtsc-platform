# Changelog — Comptabilité #598

Date : 2026-09-07

## Ajouté

- workspace Comptabilité V3 organisé en Accueil / Comptabiliser / Consulter / Configurer ;
- Journal Workbench multi-lignes avec références canoniques et dimensions analytiques ;
- tableaux comptables compacts avec en-tête sticky, chiffres tabulaires et navigation clavier ;
- service partagé de requêtes pour grand livre, balance, trace d’écriture et anomalies ;
- endpoint Comptabilité tenant-scoped pour ces requêtes ;
- revalidation serveur des dimensions tiers, projet, département, site, actif et article de stock ;
- liens vers les documents sources conditionnés par l’accès réel au module cible ;
- exécuteur `FINANCE_ACCOUNTING_READ` basé sur les mêmes requêtes canoniques que l’UI ;
- QA permanente `qa-accounting-598-gl-workbench.mjs` ;
- documentation d’architecture et guide utilisateur FR/EN actualisé.

## Corrigé

- le grand livre ne peut plus être interrogé comme un pseudo-grand-livre avec un statut autre que `POSTED` ;
- la balance d’une période calcule désormais l’ouverture avant le début de la période au lieu de limiter l’ouverture aux mouvements de cette même période ;
- les actifs déjà présents dans le registre comptable restent sélectionnables comme dimension d’une écriture Comptabilité, tout en restant exclus du parcours de création d’un nouveau profil Immobilisation ;
- les anciens deep links Comptabilité restent compatibles avec le nouveau workspace.

## Inchangé

- `EnterpriseJournalEntry` / `EnterpriseJournalLine` restent la source de vérité ;
- aucune migration Prisma ;
- aucune écriture `POSTED` historique réécrite ;
- aucun élargissement d’abonnement, RBAC, tenant ou scope IA ;
- aucune mutation IA.

## Suivi

- #599 : atomicité, récurrents, accruals/deferrals, FX de clôture, year-end et cession d’actifs ;
- #600 : dimensions configurables, multi-ledger, intercompany et consolidation.

## Preuves à ce stade

- `LOCAL_EXECUTED` : `NOT_EXECUTED` ;
- `CI_PROVEN` : `NOT_EXECUTED` ;
- `OWNER_E2E` : `NOT_EXECUTED` ;
- Production : `NOT_EXECUTED`.
