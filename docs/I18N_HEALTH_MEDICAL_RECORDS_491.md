# Health Dossiers médicaux — convergence i18n #491

Parent : #398  
Programme : #268 / #253  
Baseline : `main@03aad888db59d7feddfda41b01aec740a8bc6c12`

## Objectif

Le workspace **Health → Dossiers médicaux** utilise désormais le catalogue clinique canonique FR/EN pour sa copie système, ses libellés contrôlés, ses dates/heures et sa recherche, sans transformer les données cliniques.

## Périmètre

- `components/enterprise/health-medical-records-workspace.tsx` ;
- `locales/health-medical-records.fr.json` ;
- `locales/health-medical-records.en.json` ;
- raccordement au helper `health-clinical-i18n.ts` ;
- QA dédiée `scripts/qa-health-medical-records-i18n-491.mjs` ;
- extension de la gate #439 afin que Dossiers médicaux ait une cible sémantique à zéro copie système locale.

## Contrat de traduction

Sont localisés :

- titres, descriptions, CTA, aides, filtres et états vides ;
- messages de succès/échec définis dans le workspace ;
- statuts et niveaux de confidentialité contrôlés ;
- catégories d’antécédents, types d’allergie et niveaux de gravité ;
- libellés du formulaire et des sections ;
- dates/heures via `healthClinicalDateTime` ;
- recherche via la locale globale.

Ne sont **jamais** traduits ou réécrits automatiquement :

- noms et identifiants patient ;
- résumés cliniques saisis ;
- problèmes actifs, facteurs de risque et antécédents ;
- allergènes, réactions, traitements, indications et notes ;
- motifs et diagnostics de consultation ;
- résultats de laboratoire ;
- noms/codes/unités produit ;
- résumés et types d’événement fournis par le serveur.

Une valeur contrôlée inconnue conserve sa valeur originale au lieu d’inventer une traduction.

## Confidentialité et sécurité

Aucun changement RBAC, tenant, API, workflow, Prisma ou migration. Les permissions médicales restent l’autorité existante. Le catalogue i18n ne reçoit aucune donnée clinique libre comme clé ou variable de traduction.

## Mobile et accessibilité

Les dialogs principaux conservent les contrats `h-[94dvh]` / `h-[90dvh]`, `min-w-0` et `overflow-x-hidden`. Les aides contextuelles conservent leurs intitulés et `aria-label` localisés.

## QA

La QA dédiée vérifie notamment :

- parité stricte des 130 clés FR/EN ;
- raccordement des deux catalogues au helper canonique ;
- absence des anciennes copies système françaises structurantes ;
- recherche locale-aware ;
- présence verbatim des données cliniques ;
- interdiction de passer ces données au traducteur ;
- garanties responsive/mobile.

La gate #439 exécute cette QA dans Regression QA et porte la cible sémantique de Dossiers médicaux à `0`.

## OWNER_E2E requis avant merge

Tester sur le SHA final :

1. FR desktop : liste, recherche, filtre, carte, détail et formulaire non destructif ;
2. EN desktop : changement immédiat de toute la copie système ;
3. mobile FR puis EN : liste, détail, formulaires et menus accessibles sans débordement horizontal ;
4. vérifier que noms patients, antécédents, allergies, traitements, diagnostics, résultats labo et notes restent strictement identiques lors du changement de langue ;
5. vérifier les libellés de statut, confidentialité, catégories et gravité ;
6. revenir en FR et confirmer l’absence de copie système anglaise résiduelle.

## Rollback

Revert applicatif des catalogues, du helper, du workspace et des gates. Aucune donnée clinique ou migration à restaurer.
