# Health Staff — convergence FR/EN #494

Parent : #398  
Programme : #268 / #253  
Garde : #439

## Objectif

Converger le workspace **Health → Équipe médicale** vers le catalogue clinique canonique FR/EN sans changer le comportement métier des affectations, les permissions Santé, les transitions, les frontières multi-tenant ou les APIs.

Baseline : `main@02cc31ff60c4895d1b4f53a1d87059899a7470b0`.

## Périmètre livré

- catalogue dédié `locales/health-staff.fr.json` / `locales/health-staff.en.json` ;
- enregistrement dans `health-clinical-i18n.ts` ;
- dashboard, filtres, recherche, cartes, formulaires, dialogs, actions, aides, détails, permissions et empty states localisés ;
- statuts, disponibilités et jours de travail localisés depuis leurs codes contrôlés ;
- permissions Santé localisées depuis leur identifiant contrôlé, avec fallback sur l'identifiant si une permission inconnue apparaît ;
- postes, services et spécialités affichés via `labelEn` ou `labelFr` selon la langue, avec fallback non destructif ;
- recherche locale-aware ;
- historique daté via `healthClinicalDateTime` ;
- adaptation sémantique de la Regression QA historique ;
- cible Staff de la garde #439 portée à `0` via QA dédiée #494.

## Données qui restent verbatim

Le changement de langue ne traduit ni ne réécrit :

- nom, email et téléphone du membre ;
- numéro professionnel et ordre professionnel ;
- niveau d'expérience et domaine de compétence ;
- notes administratives ;
- nom du responsable ;
- résumés d'événements et activité métier ;
- tout libellé serveur inconnu ne disposant pas d'une clé contrôlée.

Les labels de référentiel `labelFr` / `labelEn` ne sont pas générés par le traducteur : ils sont des valeurs métier administrées par l'entreprise et sont sélectionnés selon la locale disponible.

## Sécurité et invariants

Aucun changement sur :

- `organizationId` ;
- membership entreprise ;
- RBAC et permissions Health ;
- création/modification/suspension/réactivation/archivage ;
- création de spécialité ;
- validation des relations poste/service/spécialité/superviseur ;
- APIs Health Staff ;
- schéma Prisma ou données persistées.

## QA

`scripts/qa-health-staff-i18n-494.mjs` vérifie notamment :

- symétrie exacte FR/EN et catalogue non vide ;
- raccordement au helper clinique ;
- absence de copie système française historique dans le workspace ;
- recherche locale-aware ;
- conservation verbatim des valeurs personnelles/professionnelles ;
- absence de transformation de ces valeurs en clés de traduction ;
- fallback `labelEn`/`labelFr` ;
- contrats responsive `h-[94dvh]`, `min-w-0`, `overflow-x-hidden`.

La garde #439 exécute cette QA et protège désormais Staff avec une cible sémantique `0`.

## OWNER_E2E requis avant merge

Valider sur le SHA final de PR :

1. desktop FR : dashboard, filtres, cartes, création/modification, détails, permissions, actions ;
2. desktop EN : changement de langue immédiat sans rechargement métier destructif ;
3. mobile FR/EN : dialogs, listes et textes sans débordement horizontal ;
4. vérifier qu'un nom, email, téléphone, numéro professionnel, note ou résumé d'événement reste strictement identique entre FR et EN ;
5. vérifier qu'une spécialité avec `labelFr` et `labelEn` affiche le bon libellé selon la locale ;
6. tester au moins une action non destructive autorisée selon le rôle disponible.

## Déploiement

Aucune Preview Vercel. Après CI verte et OWNER_E2E validé, merge sur `main` puis vérification du déploiement Vercel `production` sur le SHA de merge exact.

## Rollback

Revert des catalogues, du helper, du workspace et des gates. Aucune migration ni restauration de données n'est nécessaire.
