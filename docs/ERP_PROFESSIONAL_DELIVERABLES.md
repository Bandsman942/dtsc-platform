# ERP professionnel — Temps projet et livrables

## Périmètre

Module canonique : `TIME_DELIVERABLES`.

## Temps projet

Les feuilles de temps peuvent référencer un projet et une activité. Le temps devient exploitable pour la facturation ou la paie uniquement après approbation. Le caractère facturable reste une information métier et ne crée pas automatiquement une facture.

## Livrables

Chaque livrable possède :

- une référence ;
- un projet et un jalon éventuel ;
- un titre et une description ;
- un responsable ;
- une date prévue ;
- un statut ;
- une révision ;
- un commentaire de revue ;
- des documents liés lorsque disponibles.

## Workflow

```text
Brouillon
→ Soumis
→ Validé
```

Alternatives de revue :

```text
Soumis → Corrections demandées → Soumis
Soumis → Rejeté
```

Une validation ne doit jamais écraser silencieusement l’historique ou une révision précédente.

## Validation client future

La structure prépare une validation externe, sans l’activer automatiquement. Elle exigera une relation active, un partage explicite, une permission projet et un accès limité au livrable concerné.

## Sécurité et audit

- Isolation par entreprise et projet.
- Validation des transitions côté serveur.
- Approbation indépendante selon les règles.
- Historique des événements et commentaires.

## Maturité

`PROFESSIONAL_READY` avec validation E2E manuelle en attente.
