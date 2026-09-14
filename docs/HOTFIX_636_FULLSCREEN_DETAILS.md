# Hotfix #636 — détails plein écran et actions contextuelles

## Baseline

`main@3718b1f637c151fb3c3b7892904cf8eae1552634`.

## Cause racine

Plusieurs surfaces métier utilisaient encore des listes et tableaux compacts sans appliquer entièrement le contrat transverse DTSC `liste → détail plein écran → actions contextuelles → formulaire plein écran` :

- le catalogue `REPORTS` affichait des définitions sans `onOpen` ;
- la page personnelle des relations d’entreprise affichait une invitation déjà liée au compte DTSC mais exigeait encore le token de notification pour accepter/refuser ;
- `FINANCE_ACCOUNTING` possédait déjà un tableau compact capable de gérer `onRowClick`, mais le workspace ne lui transmettait cette action que de façon partielle ;
- la route canonique `POST /fiscal-years/:id/open` existait, mais aucune fiche utilisateur n’exposait l’ouverture d’un exercice `DRAFT` ;
- les rails secondaires `Configurer`/`Consulter` étaient scrollables sans largeur intrinsèque minimale des boutons, ce qui écrasait les libellés sur petits écrans ;
- plusieurs formulaires comptables utilisaient des champs sans aide visible et des dialogs hauts plutôt que le contrat plein écran mobile.

## Correctif transverse

### Primitive partagée

`components/workspace/fullscreen-entity-detail.tsx` fournit désormais le conteneur canonique de fiche plein écran :

- `Dialog` en présentation `editor` ;
- `100dvh`, largeur écran et angles non arrondis sur mobile ;
- retour au comportement desktop à partir de `sm` ;
- scroll interne du `Dialog`, safe area basse et aucun débordement horizontal global ;
- menu contextuel `…` via `ContextActions` ;
- marqueur `data-dtsc-fullscreen-detail` pour la QA.

### REPORTS

- une définition du catalogue est maintenant ouvrable ;
- sa fiche plein écran expose source, fraîcheur, formats et indicateurs ;
- le menu `…` permet de lancer le vrai formulaire de génération ;
- un rapport généré conserve sa vue professionnelle plein écran et expose CSV, Excel, PDF, publication et archivage dans `…` selon les capabilities serveur ;
- les exports existants dans `ProfessionalReportView` restent disponibles.

### Relations avec les entreprises

- toutes les lignes actives, demandes, invitations et historiques sont ouvrables en plein écran ;
- les actions ne sont plus empilées dans la liste mais vivent dans `…` ;
- pour une invitation `INVITATION_PENDING` déjà liée au `userId` du compte connecté, accepter/refuser est possible depuis la fiche sans retrouver le token URL ;
- le serveur revalide `linkId`, `userId`, `origin=ENTERPRISE`, `revision`, statut, expiration et digest de l’email connecté avant la décision ;
- le flux privé par token reste supporté ;
- aucune recherche globale par `linkId` fourni par le client n’est utilisée.

### Comptabilité

- écritures, grand livre, balance, anomalies et objets `Configurer` ouvrent une fiche plein écran ;
- les actions d’écriture ne sont plus dupliquées dans une colonne compacte : elles sont projetées dans `…` depuis les capabilities réelles ;
- une fiche d’exercice `DRAFT` expose `Ouvrir l’exercice` uniquement avec `canManage` et appelle la route canonique `/fiscal-years/:id/open` avec `revision` ;
- plans, comptes, exercices, périodes, journaux, règles, balance et anomalies projettent uniquement les champs persistés ou calculés disponibles ;
- les formulaires de création sont plein écran sur mobile, bloquent la double soumission, utilisent des références tenant-scoped et une aide visible ;
- les rails `Consulter` et `Configurer` sont des rails locaux déclarés `data-horizontal-rail`, avec boutons `shrink-0`, `snap-start`, largeur minimale et libellés multi-lignes lisibles.

## Base de données

Aucune migration. Aucun backfill. Les sources de vérité existantes sont conservées.

## Sécurité

Le correctif n’élargit aucun entitlement. Les mutations continuent à être autoritaires côté serveur. Le nouveau chemin de décision d’invitation sans token n’est disponible que pour une invitation d’entreprise déjà associée au compte connecté et à son email normalisé, avec contrôle de version et d’expiration.

## QA

`scripts/qa-hotfix-636-fullscreen-details.mjs` vérifie les contrats statiques du hotfix et est importé par `qa:enterprise-accounting`, donc repris par la régression comptable/canonique.

Validation attendue en CI : diff check, Prisma generate/parité, type-check, QA ciblée, responsive UI, standard experience, regression QA, lint et build.

## OWNER_E2E requis

Sur mobile réel au minimum 320/360/375/390/414 px :

1. REPORTS : ouvrir une définition du catalogue, lancer la génération, ouvrir le rapport généré, tester CSV/XLSX/PDF et `…`.
2. Relations : ouvrir une invitation depuis la liste sans token dans l’URL, accepter ou refuser ; vérifier relation active/historique ; tester révocation et annulation de demande.
3. Comptabilité : parcourir chaque rail, ouvrir les lignes compactes, ouvrir un exercice `Brouillon`, l’activer depuis `…`, vérifier le nouvel état ; ouvrir balance/anomalie/plan/compte/période/journal/règle.
4. Créer plan, compte, exercice, période et journal ; vérifier que les champs visibles dans le formulaire correspondent à la fiche créée.
5. FR/EN, clair/sombre, clavier/focus, retour, scroll vertical interne et absence de scroll horizontal global.

## Rollback

Revert applicatif du hotfix. Aucune donnée à supprimer et aucune migration à annuler. Les routes métier et modèles historiques restent compatibles.
