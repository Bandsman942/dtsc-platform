# i18n Health clinique — garde de dette #439

Parent : #398
Programme : #268 / #253

## Objectif

La convergence FR/EN du cœur clinique Health reste un chantier fonctionnel distinct. Cette contribution maintient un garde-fou immédiat afin que les six workspaces cliniques prioritaires ne puissent plus accumuler de nouvelles chaînes UI locales pendant leur migration progressive vers la source i18n canonique.

## Surfaces protégées

| Workspace | Plafond historique | Cible sémantique actuelle |
|---|---:|---:|
| Patients | 76 | 0 |
| Rendez-vous | 58 | 0 |
| Consultations | 68 | 0 |
| Dossiers médicaux | 47 | 0 |
| Équipe médicale | 53 | 0 |
| Laboratoire | 75 | à converger |

Les valeurs historiques proviennent de `config/i18n-hardcoded-baseline.json` et du périmètre #398. Une surface à cible sémantique `0` est prouvée par sa QA dédiée plutôt que par le seul compteur heuristique.

## Contrat de la gate

`scripts/qa-health-clinical-i18n-439.mjs` :

- vérifie que les six fichiers existent ;
- vérifie que les plafonds déclarés correspondent à l'inventaire canonique ;
- utilise le même compteur de libellés probables que le contrat i18n global ;
- compare la branche avec le vrai `origin/main` afin de tolérer une dette préexistante sur la baseline tout en refusant toute aggravation ;
- refuse également l'augmentation de patterns de traduction locale ou de locales de formatage codées en dur ;
- exécute les sous-gates sémantiques Patients #447, Rendez-vous #451, Consultations #457, Dossiers médicaux #491 et Équipe médicale #494 ;
- ne lit ni ne traduit aucune donnée patient, diagnostic, prescription, résultat laboratoire, donnée professionnelle libre ou note clinique.

## Politique de remboursement

Le plafond est un maximum, jamais une cible à conserver. Chaque PR de convergence #398 doit :

1. déplacer les copies système vers le catalogue FR/EN canonique ;
2. préserver les données cliniques et professionnelles libres telles qu'elles ont été saisies ;
3. réduire ou maintenir le compteur, jamais l'augmenter ;
4. porter la surface convergée à une cible sémantique `0` prouvée par QA dédiée ;
5. conserver les contrôles Health, confidentialité, RBAC, `organizationId` et les QA sectorielles.

## Ce que cette contribution ne revendique pas

Cette gate ne clôture pas #398. La surface Laboratoire reste à converger, ainsi que le shell Health prévu par #398. La gate ne remplace jamais l'OWNER_E2E FR/EN desktop/mobile demandé pour chaque surface à impact utilisateur.

## QA

La gate est raccordée à Regression QA afin qu'une contribution future qui ajoute des chaînes locales ou casse une surface déjà convergée échoue avant merge.

## Données, sécurité et migrations

- aucune migration Prisma ;
- aucun backfill ;
- aucune donnée clinique ou professionnelle modifiée ;
- aucune permission changée ;
- aucun changement de frontière Health/Finance.

## Rollback

Revert du script, de ses sous-gates et de cette documentation. Aucun rollback de donnée n'est nécessaire.
