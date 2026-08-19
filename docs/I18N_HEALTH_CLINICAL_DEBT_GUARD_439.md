# i18n Health clinique — garde de dette #439

Parent : #398
Programme : #268 / #253

## Objectif

La convergence FR/EN du cœur clinique Health reste un chantier fonctionnel distinct. Cette contribution installe un garde-fou immédiat afin que les six workspaces cliniques prioritaires ne puissent plus accumuler de nouvelles chaînes UI locales pendant leur migration progressive vers la source i18n canonique.

## Surfaces protégées

| Workspace | Plafond historique |
|---|---:|
| Patients | 76 |
| Rendez-vous | 58 |
| Consultations | 68 |
| Dossiers médicaux | 47 |
| Équipe médicale | 53 |
| Laboratoire | 75 |

Les valeurs proviennent de `config/i18n-hardcoded-baseline.json` et du périmètre #398.

## Contrat de la gate

`scripts/qa-health-clinical-i18n-439.mjs` :

- vérifie que les six fichiers existent ;
- vérifie que les plafonds déclarés correspondent à l'inventaire canonique ;
- utilise le même compteur de libellés probables que le contrat i18n global ;
- compare la branche avec le vrai `origin/main` afin de tolérer une dette préexistante sur la baseline tout en refusant toute aggravation ;
- refuse également l'augmentation de patterns de traduction locale (`locale === ...`) ou de locales de formatage codées en dur ;
- ne lit ni ne traduit aucune donnée patient, diagnostic, prescription, résultat laboratoire ou note clinique.

## Politique de remboursement

Le plafond est un maximum, jamais une cible à conserver. Chaque PR de convergence #398 doit :

1. déplacer les copies système vers le catalogue FR/EN canonique ;
2. préserver les données cliniques telles qu'elles ont été saisies ;
3. réduire ou maintenir le compteur, jamais l'augmenter ;
4. abaisser le plafond historique lorsqu'une réduction est stabilisée ;
5. conserver les contrôles Health, confidentialité, RBAC, `organizationId` et les QA sectorielles.

## Ce que cette contribution ne revendique pas

Cette gate ne clôture pas #398. Elle ne prouve pas que les six surfaces sont déjà bilingues et ne remplace pas l'OWNER_E2E FR/EN desktop/mobile demandé par #398.

Elle transforme simplement une dette connue en dette **bornée et non régressive** pendant que la convergence réelle continue.

## QA

La gate est raccordée à Regression QA afin qu'une contribution future qui ajoute des chaînes locales dans ces fichiers échoue avant merge.

## Données, sécurité et migrations

- aucune migration Prisma ;
- aucun backfill ;
- aucune donnée clinique modifiée ;
- aucune permission changée ;
- aucun changement runtime utilisateur.

## Rollback

Revert du script, de son branchement Regression QA et de cette documentation. Aucun rollback de donnée n'est nécessaire.
