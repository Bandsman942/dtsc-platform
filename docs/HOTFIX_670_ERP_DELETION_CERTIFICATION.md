# Hotfix #670 — ERP Deletion & Certification

## Objectif

Supprimer physiquement les bridges de compatibilité devenus morts après #669, conserver une seule implémentation active par workspace couvert et ajouter une certification anti-régression empêchant le retour silencieux de cette dette.

Base de départ : `main@d41a2380f5937c66bad328098c439b81fdc4eeae`, contenant #669 validé par CI et OWNER_E2E.

## Suppressions ciblées

Le hotfix supprime uniquement les 16 bridges de compatibilité introduits ou conservés pendant la convergence #669 :

- Tiers, Catalogue, CRM, Contrats et Actifs `*-v2` ;
- IA Entreprise `enterprise-ai-workspace-v2.tsx` ;
- Comptabilité `*-v3` ;
- Finance avancée, Factures, Paiements, Trésorerie et Banque/Rapprochement `*-hotfix` ;
- les deux bridges `legacy` internes Finance ;
- les deux bridges historiques de panneaux d’administration.

Aucune table, colonne, migration ou donnée métier n’est supprimée.

## Convergence des QA

Les QA historiques qui lisaient encore un bridge pour vérifier une implémentation ont été réorientées vers le fichier canonique. La gate #669 est conservée mais son contrat final exige désormais que les bridges historiques soient absents.

Le référentiel de maturité commerciale IA pointe vers `components/enterprise/enterprise-ai-workspace.tsx`. L’ancienne entrée i18n dédiée au bridge IA est retirée du baseline.

## Gate #670

`pnpm qa:hotfix-670` vérifie :

1. l’absence physique des 16 bridges ciblés ;
2. l’existence des 16 implémentations/couches canoniques correspondantes ;
3. l’absence de référence active à ces anciens noms dans `app/`, `components/`, `lib/`, `scripts/`, `config/` et `.github/` ;
4. l’absence de routage runtime via `v2/v3/hotfix/legacy` sur les routeurs ERP/Finance/Administration couverts ;
5. le maintien des gates #666, #667, #668, #669 et #670 dans la régression ;
6. la protection du registre contre les codes canoniques dupliqués ;
7. la synchronisation de l’évidence de maturité commerciale IA ;
8. sur les additions de la PR, l’absence de nouveau fallback USD arbitraire, de date métier dérivée naïvement de `toISOString().slice(0, 10)`, de nouvelle réponse `Invalid payload` générique et de nouveau bridge suffixé mince non documenté.

## Commercial readiness

Ce hotfix ne promeut aucun module automatiquement. Il synchronise uniquement les chemins de preuve vers les implémentations réellement actives. Les transitions de maturité restent soumises aux preuves existantes, à la CI, à Production et à la validation propriétaire lorsque le contrat l’exige.

## Sécurité / RBAC / multi-tenant

Aucun resolver d’accès, entitlement, rôle, permission ou contrôle tenant n’est supprimé. Les routes et services métier restent identiques ; seuls des fichiers de réexport sans logique propre sont retirés.

## Base de données

- migration Prisma : aucune ;
- backfill : aucun ;
- suppression de donnée : aucune ;
- suppression de schéma : aucune.

## Rollback

Revert applicatif de la PR. Comme aucune donnée ni migration n’est touchée, aucun rollback de base de données n’est requis.

## Validation

La CI dédiée exécute Prisma generate, migrations depuis une base propre, QA #668, QA #669, QA #670, régression complète, type-check, lint et build.

La certification finale propriétaire est décrite dans `docs/OWNER_E2E_670_ERP_DELETION_CERTIFICATION.md`.
