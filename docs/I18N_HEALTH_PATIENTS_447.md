# i18n Health 3A.2 — Patients FR/EN

Parent : #398
Programme : #268 / #253
Issue : #447

## Objectif

Le workspace Patients utilise désormais le catalogue Health clinique canonique et la locale globale de DTSC Platform. Le lot ne modifie aucun modèle de données, endpoint, RBAC ou contenu saisi par l'utilisateur.

## Contrat linguistique

- les copies système Patients sont définies dans `locales/health-patients.fr.json` et `locales/health-patients.en.json` ;
- les deux catalogues possèdent exactement les mêmes clés ;
- `health-clinical-i18n.ts` compose le socle clinique #443 avec le catalogue Patients ;
- `useHealthClinicalLocale()` reste l'unique source de locale du workspace ;
- statuts et dates utilisent les helpers canoniques ;
- filtres/recherche adaptent leur locale sans maintenir d'état de langue local.

## Données patient exclues de la traduction

Les valeurs suivantes restent strictement telles qu'elles ont été saisies ou reçues :

- nom et identité patient ;
- allergies ;
- antécédents ;
- traitements chroniques ;
- notes médicales ;
- notes administratives ;
- titres/résumés des activités métier ;
- historique d'actions ;
- données de délivrance pharmacie.

Le catalogue traduit les libellés autour de ces données, jamais leur contenu.

## Dette i18n

La baseline historique Patients reste documentée à 76 occurrences dans l'inventaire global. La gate #439 ajoute désormais une **cible de convergence à 0** pour `health-patients-workspace.tsx`. Une fois ce lot intégré, toute nouvelle copie système locale dans ce fichier fait échouer la régression.

## QA

`scripts/qa-health-patients-i18n-447.mjs` vérifie :

- parité FR/EN ;
- présence d'un catalogue suffisamment complet ;
- composition par le helper Health canonique ;
- utilisation de la locale globale ;
- statuts et dates localisés ;
- absence des principales copies FR historiques dans le workspace ;
- absence de formatage date FR local ;
- présence des champs cliniques bruts et interdiction de les passer au traducteur ;
- maintien des endpoints Patients.

Cette QA est chaînée à la gate Health #439, elle-même déjà exécutée par Regression QA.

## OWNER_E2E requis

Le lot modifie une surface utilisateur réelle. Avant merge Production, le propriétaire doit vérifier un parcours non destructif :

1. ouvrir Health → Patients sur desktop en FR ;
2. vérifier titre, filtres, recherche, carte patient et détail ;
3. ouvrir le formulaire sans enregistrer et vérifier sections/aides/actions ;
4. passer en EN et confirmer la mise à jour immédiate des mêmes copies ;
5. vérifier que nom, allergies, antécédents, traitements et notes existants restent identiques ;
6. répéter les contrôles essentiels sur mobile ;
7. revenir en FR et confirmer l'absence de rechargement incohérent ou de copie anglaise résiduelle.

## Rollback

Revert applicatif des catalogues Patients, du helper, du workspace et des gates QA. Aucune migration, backfill ni donnée patient n'est à restaurer.
