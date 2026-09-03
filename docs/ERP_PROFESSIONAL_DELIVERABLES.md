# ERP professionnel — Temps projet et livrables

## Périmètre

Module canonique : `TIME_DELIVERABLES`.

Le module fournit un registre consolidé des livrables autorisés. Sa consultation ne dépend pas de l’ouverture préalable d’un projet dans `PROJECTS_SERVICES` : recherche, filtre, pagination et actions de revue sont disponibles directement dans le workspace.

## Source de vérité du temps projet

Le temps réellement travaillé reste porté par les timesheets canoniques. `TIME_DELIVERABLES` ne crée aucune seconde source de temps.

Pour un livrable, les minutes affichées comme réalisées/approuvées proviennent exclusivement des `EnterpriseTimesheetEntry` rattachées au projet/livrable lorsque leur feuille de temps est `APPROVED` et non archivée. Une planification, un brouillon de feuille ou une feuille non approuvée ne devient jamais une preuve de travail.

Le caractère facturable reste une information métier. L’acceptation d’un livrable ou l’approbation de temps ne crée automatiquement ni facture, ni paiement, ni écriture comptable.

## Livrables

Chaque livrable possède notamment :

- une référence ;
- un projet et un jalon éventuel ;
- un titre et une description ;
- un responsable ;
- une date prévue, bornée par la période du projet et, si applicable, par le jalon ;
- un statut ;
- une révision utilisée pour le contrôle de concurrence ;
- un commentaire de revue ;
- un document lié éventuel lorsque `DOCUMENTS` est accessible ;
- le temps approuvé issu des timesheets canoniques.

Les références projet, jalon, responsable et document sont revalidées côté serveur dans la même entreprise. `DOCUMENTS` demeure l’autorité de la pièce et de sa confidentialité.

## Workflow

```text
Brouillon
→ Soumis
→ Accepté
```

Alternatives de revue :

```text
Soumis → Corrections demandées → Soumis
Soumis → Rejeté
```

La transition est versionnée côté serveur. Une décision obsolète échoue au lieu d’écraser silencieusement une révision plus récente.

## Revue indépendante

Les capacités `canSubmit`, `canAccept`, `canRequestChanges` et `canReject` sont calculées côté serveur puis exposées à l’interface uniquement pour guider l’expérience.

- Le créateur peut soumettre ou resoumettre selon l’état du livrable.
- Le créateur ne peut pas accepter, rejeter ou demander lui-même les corrections de son propre livrable.
- Une demande de correction ou un rejet exige un motif explicite.
- L’UI n’est jamais utilisée comme barrière d’autorisation : le backend revalide la transition, la révision et l’acteur.

## Continuité inter-modules

- `PROJECTS_SERVICES` reste l’autorité du portefeuille, des jalons, risques et incidents projet.
- `TIME_ATTENDANCE` / timesheets restent l’autorité du temps réalisé.
- `DOCUMENTS` reste l’autorité des documents liés.
- Une continuité de facturation éventuelle doit passer par le mécanisme cross-module prévu ; aucune création comptable implicite n’est déclenchée ici.

## UX

- registre consolidé paginé, recherchable et filtrable ;
- formulaires et revues en `presentation="editor"` ;
- actions visibles selon capacités serveur ;
- états `saving/disabled` pendant les mutations ;
- feedback local et toast global ;
- aucun `window.prompt`, `window.alert` ou `window.confirm` dans le parcours métier.

## Sécurité et audit

- isolation stricte par `organizationId` ;
- contrôle de module et permissions côté serveur ;
- revalidation des références tenant-scoped ;
- contrôle de révision sur les mutations ;
- séparation créateur/reviewer pour les décisions finales ;
- same-origin, validation de payload, rate limit et audit sur les mutations sensibles.

## Maturité

`PROFESSIONAL_READY` sous réserve des Quality Gates du head livré. `OWNER_E2E` reste obligatoire avant merge/commercialisation pour `TIME_DELIVERABLES`.
