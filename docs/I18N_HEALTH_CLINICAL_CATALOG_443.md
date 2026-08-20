# Health clinique — catalogue i18n canonique #443

Parent : #398
Programme : #268 / #253

## Objectif

Installer sur le `main` courant un catalogue FR/EN unique pour les libellés système du cœur clinique Health avant la migration progressive des workspaces Patients, Rendez-vous, Consultations, Dossiers médicaux, Équipe médicale et Laboratoire.

Ce sous-lot ne branche encore aucun écran clinique au catalogue. Il prépare une source canonique typée et testable afin d'éviter six dictionnaires locaux divergents.

## Contrat

- la locale provient exclusivement de `useAppLocale()` ;
- les locales applicatives supportées sont normalisées vers `fr` et `en` ;
- les catalogues FR et EN exposent exactement les mêmes clés ;
- le français reste le fallback explicite en cas de clé ou locale non reconnue ;
- statuts et priorités sont traduits à partir de codes système, jamais à partir du contenu clinique ;
- dates et dates/heures utilisent `Intl.DateTimeFormat` selon la locale active ;
- aucun appel API, aucune mutation et aucune lecture de données patient n'existent dans le helper.

## Données cliniques exclues

Le catalogue ne doit jamais traduire automatiquement les valeurs saisies par les utilisateurs : diagnostic, symptômes, allergies, antécédents, prescription, notes cliniques, résultats de laboratoire, identité ou autre contenu patient.

Seules les chaînes système de l'interface sont candidates à la traduction.

## QA

`scripts/qa-health-clinical-catalog-443.mjs` vérifie :

- la parité stricte des clés FR/EN ;
- la présence et la non-vacuité de chaque valeur ;
- les clés minimales attendues pour les six surfaces cliniques ;
- l'utilisation du provider de locale global ;
- le fallback FR ;
- le formatage date/heure via `Intl` ;
- l'absence d'accès API et de manipulation de champs cliniques utilisateur dans le helper.

## Suite

Après intégration de cette fondation, #398 pourra migrer les surfaces une par une en abaissant les plafonds de dette protégés par #439. Chaque lot UI conservera les contrôles Health/confidentialité et exigera l'OWNER_E2E FR/EN desktop/mobile prévu par #398.

## Rollback

Revert applicatif des catalogues, du helper, de la QA et de son raccordement à Regression QA. Aucune migration, aucun backfill et aucune donnée clinique ne sont concernés.
