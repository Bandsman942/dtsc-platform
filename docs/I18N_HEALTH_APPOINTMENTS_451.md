# Health Rendez-vous — convergence i18n #451

Issue : #451
Parent : #398
Programme : #268 / #253
Baseline : `main@70a90680613b1e6222b2a38850b7878de6a67c4c`

## Objectif

Faire suivre immédiatement au workspace Rendez-vous la langue globale FR/EN de DTSC Platform, sans traduire ni réécrire les données métier ou cliniques saisies.

## Ce qui est localisé

- titre, description et CTA ;
- bascule liste/planning ;
- filtres et placeholders ;
- statuts et priorités à partir des codes serveur ;
- types de rendez-vous ;
- formulaires, aides et empty states ;
- actions de workflow ;
- titres et libellés des détails ;
- dates et heures via la locale globale ;
- âge calculé et libellés système associés.

## Ce qui n'est jamais traduit automatiquement

- nom du patient ;
- téléphone et identifiants ;
- motif du rendez-vous ;
- description libre ;
- notes administratives ;
- notes internes protégées ;
- motif d'annulation ;
- résumé et type des événements historiques ;
- nom du professionnel ;
- libellé de service renvoyé par le référentiel de l'organisation.

Ces valeurs restent les données canoniques fournies par le serveur. Le passage FR/EN ne les transforme pas.

## Architecture

Les catalogues dédiés sont :

- `locales/health-appointments.fr.json` ;
- `locales/health-appointments.en.json`.

Ils sont fusionnés dans `components/enterprise/health-clinical-i18n.ts` avec le catalogue clinique partagé et le catalogue Patients.

Le workspace utilise :

- `useHealthClinicalLocale()` ;
- `healthClinicalT()` ;
- `healthClinicalStatusLabel()` ;
- `healthClinicalPriorityLabel()` ;
- `healthClinicalDateTime()`.

Les codes API et transitions métier ne changent pas.

## Garde anti-dette

`scripts/qa-health-appointments-i18n-451.mjs` vérifie notamment :

- parité stricte des clés FR/EN ;
- branchement du catalogue au helper canonique ;
- absence des principales copies FR locales ;
- locale globale pour recherche et date-heures ;
- conservation brute des champs libres et historiques ;
- conservation des endpoints existants.

La gate #439 appelle maintenant les sous-gates Patients #447 et Rendez-vous #451. La cible sémantique Rendez-vous devient zéro copie système locale même si l'inventaire historique reste conservé comme baseline de dette.

## OWNER_E2E requis avant Production

Après CI verte :

1. ouvrir Health → Rendez-vous sur desktop ;
2. vérifier liste, planning, filtres et détail en FR ;
3. ouvrir un formulaire non destructif et vérifier les aides/libellés ;
4. passer en EN et confirmer le changement immédiat de toute la copie système ;
5. vérifier qu'un nom patient, un motif, une note et un historique existants sont strictement inchangés ;
6. répéter sur mobile ;
7. revenir en FR.

Aucune fusion Production avant cette preuve humaine.

## Rollback

Revert du workspace, des catalogues, du helper et des gates #451/#439. Aucune migration, aucun backfill et aucune donnée clinique ne sont à restaurer.
