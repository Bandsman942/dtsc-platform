# DTSC Education — EDU-1 Structure académique, campus et paramètres

Issue : #281
Parent : #279
Dépendance : EDU-0 #280 / PR #677
Baseline : `main@51fa9c77f464a4219e860e77eece0cc81dc88244`

## Portée livrée

EDU-1 livre les trois premiers modules canoniques Education :

- `EDUCATION_SETTINGS` ;
- `ACADEMIC_STRUCTURE` ;
- `ACADEMIC_CALENDAR`.

Le domaine persiste les paramètres d’établissement, campus, années académiques, périodes, niveaux, départements académiques, programmes, classes/groupes, matières, offres de cours et événements du calendrier.

## Autorités et non-duplication

EDU-1 respecte le contrat EDU-0. Il ne crée ni utilisateur, adhésion, employé/RH, facture, paiement, document, workflow, notification ni journal comptable sectoriel parallèle.

Les identités académiques d’étudiants, tuteurs et enseignants restent hors scope et appartiennent aux itérations suivantes.

## Isolation multi-tenant et multi-campus

Chaque modèle métier porte `organizationId`. Les relations académiques utilisent des clés étrangères composites `organizationId + id` dès qu’une relation intra-Education est persistée.

Cela empêche structurellement une période, classe, matière ou offre de cours de référencer un objet d’une autre entreprise.

Les références facultatives qui ne sont pas des relations Prisma, notamment `defaultCampusId` dans les paramètres, sont revalidées par le service avant écriture.

## Concurrence et historique

Les modèles modifiables portent `revision`. Les mutations utilisent `updateMany` avec `id + organizationId + revision` et renvoient `REVISION_CONFLICT` lorsque la donnée a changé.

L’API n’expose aucun `DELETE`. Les données utilisent des transitions explicites :

- années/périodes : `DRAFT → ACTIVE → CLOSED` ;
- autres référentiels : `ACTIVE/INACTIVE → ARCHIVED`.

Une année ou période déjà référencée ne peut pas être archivée brutalement. Elle doit être clôturée afin que les cours et événements historiques restent consultables.

## Cohérence métier

Le service refuse notamment :

- une période hors des bornes de son année ;
- une période liée à une autre année ;
- une classe liée à des références d’un autre tenant ;
- une offre de cours utilisant une classe d’une autre année ou d’un autre campus ;
- un événement en dehors de son année/période ;
- un campus principal appartenant à une autre organisation.

## Template Education v2

La migration `20260926002000_education_academic_structure` crée un template Education version 2 sans modifier la migration v1.

Le template v2 n’active que les modules réellement livrés par EDU-1. Pour les organisations Education existantes, il crée/upsert les trois modules canoniques et désactive seulement la navigation des anciens codes v1. Aucune donnée `EnterpriseSectorRecord` historique n’est supprimée ou convertie automatiquement.

## Permissions et entitlements

Le resolver canonique reste l’unique autorité. Les modules sont sectoriels `EDUCATION`, plan minimum `BUSINESS`, abonnement actif requis.

Permissions proposées par le template :

- `enterprise.education.settings.view|manage` ;
- `enterprise.education.structure.view|create|update|manage` ;
- `enterprise.education.calendar.view|create|update|manage`.

L’API exige en plus le contexte d’entreprise actif, same-origin sur mutation et rate-limit.

## Aucune suppression physique

EDU-1 n’expose aucune suppression physique des référentiels académiques. Les suppressions fonctionnelles passent exclusivement par clôture ou archivage contrôlé.

## API

- `GET /api/enterprise/:organizationId/education/structure` : snapshot de configuration ;
- `GET ...?resource=...` : listes paginées, recherche et filtres ;
- `POST .../structure` : création ou paramètres ;
- `PATCH .../structure/:id` : update/activation/désactivation/clôture/archivage ;
- `DELETE` : explicitement refusé.

Les listes sont paginées côté serveur, maximum 100 lignes par page.

## UX

`/enterprise-education/[moduleCode]` rend le workspace Education commun avec :

- assistant de configuration en quatre étapes ;
- métriques de structure ;
- rails de référentiels ;
- recherche et filtres ;
- pagination ;
- formulaires `Dialog presentation="editor"` adaptés aux claviers mobiles ;
- états vides ;
- erreurs métier lisibles ;
- FR/EN.

## Guides utilisateur

Les guides canoniques `EDUCATION_SETTINGS`, `ACADEMIC_STRUCTURE` et `ACADEMIC_CALENDAR` sont ajoutés à `lib/enterprise/education-user-guides.ts` et intégrés au registre du centre d’aide.

## Migration et rollback

Migration additive, sans `DROP`, sans backfill destructif.

Rollback applicatif : revert de la PR. Les nouvelles tables peuvent rester inutilisées sans casser l’ancien template. Un rollback SQL destructif automatique n’est volontairement pas fourni afin de ne jamais supprimer des données académiques créées après déploiement.

## Hors scope

Admissions, étudiants, tuteurs, enseignants/affectations, présences, évaluations, notes, résultats, frais scolaires, discipline, EMIS et outils IA Education restent dans EDU-2 à EDU-10.
