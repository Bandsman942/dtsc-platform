# Health Laboratory — convergence FR/EN #496

Parent : #398
Programme : #268 / #253
Garde : #439

## Objectif

Converger le workspace **Health → Laboratoire** vers le catalogue clinique canonique FR/EN sans changer le workflow métier, les permissions médicales, les frontières multi-tenant, les APIs ou les données cliniques sensibles.

Baseline : `main@e785a2b82add803bbb5c2b53b4e297b6b66a9872`.

## Périmètre livré

- catalogues dédiés `locales/health-laboratory.fr.json` et `locales/health-laboratory.en.json` ;
- enregistrement dans `health-clinical-i18n.ts` ;
- dashboard, filtres, recherche, cartes, formulaires, dialogs, actions, aides, détails, catalogue et empty states localisés ;
- statuts, priorités, types/qualités de prélèvement, niveaux d'anomalie, catégories, confidentialité et titres d'actions localisés depuis leurs codes contrôlés ;
- labels d'examens de catalogue affichés via `labelEn` ou `labelFr` selon la locale, avec fallback non destructif ;
- recherche locale-aware ;
- dates et heures via `healthClinicalDateTime` ;
- adaptation sémantique de la Regression QA historique ;
- cible Laboratoire de la garde #439 portée à `0` via QA dédiée #496.

## Données qui restent verbatim

Le changement de langue ne traduit ni ne réécrit :

- identité et numéro patient ;
- motif et diagnostic de consultation ;
- indication clinique ;
- notes médicales ;
- résultat laboratoire ;
- unité ;
- valeurs de référence ;
- interprétation du résultat ;
- commentaires de prélèvement ;
- consignes et commentaires laboratoire ;
- notes internes ;
- libellé historique d'un examen déjà enregistré dans une demande ;
- résumés d'événements et noms des acteurs.

Les champs `labelFr` et `labelEn` du catalogue sont des valeurs métier administrées par l'entreprise. Ils sont sélectionnés selon la locale disponible ; ils ne sont jamais générés automatiquement par le traducteur.

## Sécurité et invariants

Aucun changement sur :

- `organizationId` ;
- membership entreprise ;
- RBAC et permissions Health Laboratory ;
- création/modification/annulation de demande ;
- prélèvement, saisie, validation, correction ou transmission de résultat ;
- création d'examen de catalogue ;
- APIs Health Laboratory ;
- schéma Prisma ou données persistées.

## QA

`scripts/qa-health-laboratory-i18n-496.mjs` vérifie notamment :

- symétrie exacte FR/EN et catalogues non vides ;
- raccordement au helper clinique ;
- absence des anciennes copies système françaises dans le workspace ;
- recherche et dates locale-aware ;
- localisation exclusivement des codes contrôlés ;
- conservation verbatim des données cliniques, résultats, unités, références, interprétations et historiques ;
- absence de transformation de ces valeurs en clés de traduction ;
- fallback `labelEn` / `labelFr` ;
- contrats responsive `h-[94dvh]`, `min-w-0`, `overflow-x-hidden`.

La garde #439 exécute cette QA et protège désormais les six workspaces cliniques prioritaires avec une cible sémantique `0`.

## OWNER_E2E requis avant merge

Valider sur le SHA final de PR :

1. desktop FR : dashboard, filtres, cartes, création/modification, détail, prélèvement, résultat et catalogue selon les permissions disponibles ;
2. desktop EN : changement de langue immédiat sans rechargement métier destructif ;
3. mobile FR/EN : dialogs, listes et formulaires sans débordement horizontal ;
4. vérifier qu'un nom patient, une indication clinique, une note médicale, un résultat, une unité, une valeur de référence, une interprétation et un résumé d'événement restent strictement identiques entre FR et EN ;
5. vérifier qu'un examen ayant `labelFr` et `labelEn` affiche le bon libellé selon la locale ;
6. tester au moins une action non destructive autorisée selon le rôle disponible.

## Déploiement

Aucune Preview Vercel. Après CI verte et OWNER_E2E validé, merge sur `main` puis vérification du déploiement Vercel `production` sur le SHA de merge exact.

## Dette restante #398

Après ce lot, la dette fonctionnelle restante de #398 est limitée au **shell Health** `components/enterprise/healthcare-admin-workspace.tsx` et à son audit final consolidé.

## Rollback

Revert des catalogues, du helper, du workspace et des gates. Aucune migration ni restauration de données n'est nécessaire.
