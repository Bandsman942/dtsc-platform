# DTSC — Prestations réelles et validation opérationnelle

## Objet

Le Sprint 4 introduit la déclaration du travail réellement effectué dans l’espace `DTSC_INTERNAL`.

La chaîne métier est strictement séparée :

```text
Planning Sprint 3
→ travail réellement déclaré
→ soumission hebdomadaire
→ validation indépendante
→ temps validé
→ Sprint 5 (HR & CFO / paie)
```

Une disponibilité n’est jamais convertie automatiquement en temps travaillé. Une prestation déclarée n’est jamais considérée comme validée avant décision du reviewer.

## Modèles

### `DtscWorkEntry`

Une entrée représente une période de travail réellement déclarée par le collaborateur connecté : date locale, heure de début, heure de fin, pause, type de travail, mode de travail, résumé, détail facultatif et référence opérationnelle contrôlée facultative.

`workedMinutes` est recalculé côté serveur avec :

```text
heure de fin - heure de début - pause = minutes travaillées déclarées
```

Le frontend ne peut pas fixer cette valeur.

### `DtscWorkSubmission`

Une soumission représente une semaine lundi → dimanche d’un collaborateur. Une contrainte unique interdit plusieurs soumissions concurrentes pour la même combinaison `employeeId + periodStart + periodEnd`.

Statuts :

- `DRAFT`
- `SUBMITTED`
- `CHANGES_REQUESTED`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

Transitions usuelles :

```text
DRAFT → SUBMITTED
SUBMITTED → APPROVED
SUBMITTED → CHANGES_REQUESTED
SUBMITTED → REJECTED
CHANGES_REQUESTED → SUBMITTED
```

Une période `SUBMITTED`, `APPROVED` ou `REJECTED` est verrouillée pour le collaborateur. Une correction redevient éditable uniquement via `CHANGES_REQUESTED`.

### `DtscWorkSubmissionReview`

Chaque soumission/resoumission et chaque décision de reviewer est ajoutée à l’historique. Une nouvelle décision n’efface donc pas les cycles précédents.

## Identité et ownership

La cible d’écriture est toujours dérivée de :

```text
session.userId
→ HrcfoEmployee actif
→ employee.id
```

Un `employeeId` fourni par le navigateur ne permet jamais de créer ou modifier le travail d’un collègue.

## Matrice de validation

La politique est centralisée dans `lib/work-prestations.ts`.

| Collaborateur qui soumet | Reviewer requis |
| --- | --- |
| Collaborateur standard | COO |
| CTO | COO |
| MPO | COO |
| SCO | COO |
| LA | COO |
| HR & CFO | COO |
| CEO | COO |
| COO | CEO |

Plusieurs collaborateurs peuvent porter le même poste. Toute personne active portant le poste reviewer requis peut traiter la soumission, mais une seule transition est acceptée car le serveur revalide l’état `SUBMITTED` au moment de la décision.

### Aucune auto-validation

Le service bloque systématiquement :

```text
submission.employeeId === reviewer.id
```

Cette règle s’applique également à `ADMIN`, CEO, COO et HR & CFO. Le rôle global ne constitue jamais une exception au workflow métier.

## Calcul et chevauchements

Les durées sont conservées en minutes entières. Les plages doivent respecter :

- début < fin ;
- pause >= 0 ;
- pause < durée brute ;
- aucune superposition avec une autre entrée active du même collaborateur le même jour.

Le Sprint 4 ne crée aucun mécanisme automatique de clock-in/clock-out, géolocalisation, capture d’écran, webcam ou surveillance utilisateur.

## Comparaison au planning Sprint 3

Chaque création, modification et soumission utilise `resolveDtscEffectiveAvailability()`.

Les indicateurs persistés sur l’entrée permettent de signaler :

- travail hors disponibilité déclarée ;
- chevauchement avec absence/congé/maladie/indisponibilité ;
- mission/formation ou autre avertissement de planning.

Ces indicateurs sont des informations de revue. Ils ne créent ni faute, ni retenue, ni paie automatiquement.

Une prestation chevauchant une absence n’est pas supprimée. Avant soumission, le collaborateur doit confirmer explicitement qu’il souhaite maintenir la déclaration après avoir vu le conflit.

## Références opérationnelles

Une entrée peut être reliée, de manière facultative, à des objets déjà existants :

- tâche COO ;
- opération COO ;
- réunion COO ;
- projet MPO ;
- demande collaborative.

`sourceType` et `sourceId` sont validés côté serveur. L’objet doit réellement concerner le collaborateur ; un identifiant arbitraire n’est pas accepté.

## Self-service — Activités DTSC

`/activities` reçoit un espace « Mes prestations » construit avec le système workspace :

```text
section → métriques → liste compacte → détail/actions
```

Le collaborateur peut :

- créer une prestation dans la semaine ;
- modifier ou supprimer logiquement un brouillon ;
- voir les minutes calculées ;
- voir les écarts avec son planning ;
- soumettre la semaine ;
- corriger et resoumettre après `CHANGES_REQUESTED` ;
- consulter son historique.

Aucun montant de salaire, prime ou retenue n’est affiché.

## Review COO / CEO

### COO

Dans `Administration → COO`, la file affiche uniquement les soumissions dont le reviewer requis est COO. Cela inclut notamment les collaborateurs standards, HR & CFO et CEO.

### CEO

Dans `Administration → CEO`, la file affiche uniquement les soumissions du COO nécessitant la validation croisée CEO.

Actions disponibles sur une soumission `SUBMITTED` :

- Valider ;
- Demander correction ;
- Refuser.

Une demande de correction et un refus exigent un motif. Une validation simple fixe `validatedMinutes = declaredMinutes`. Le reviewer ne dispose pas d’un champ lui permettant de réécrire silencieusement la durée.

## Notifications et Web Push

Les notifications utilisent `notifyUser` / `notifyUsers`, donc la chaîne de Web Push existante.

- soumission → reviewer éligible ;
- resoumission → reviewer éligible ;
- correction demandée → collaborateur ;
- validation → collaborateur ;
- refus → collaborateur.

Les notifications restent synthétiques et n’exposent pas les descriptions détaillées de travail sur l’écran verrouillé.

## Audit et API logs

Actions principales :

- `WORK_ENTRY_CREATED`
- `WORK_ENTRY_UPDATED`
- `WORK_ENTRY_DELETED`
- `WORK_SUBMISSION_CREATED`
- `WORK_SUBMISSION_SUBMITTED`
- `WORK_SUBMISSION_RESUBMITTED`
- `WORK_SUBMISSION_CHANGES_REQUESTED`
- `WORK_SUBMISSION_APPROVED`
- `WORK_SUBMISSION_REJECTED`

Les routes sensibles conservent session, contexte `DTSC_INTERNAL`, same-origin, Zod strict, rate limit, `AuditLog` et `ApiLog` selon le type d’action.

## Frontière Sprint 5

`getApprovedWorkForPayroll({ employeeId, periodStart, periodEnd })` expose uniquement les soumissions `APPROVED` et leurs entrées.

Ce helper ne calcule aucun montant et ne modifie jamais :

- `HrcfoPayroll` ;
- salaire ;
- prime ;
- retenue ;
- bulletin ;
- transaction financière.

Le Sprint 5 devra consommer les prestations approuvées comme donnée d’entrée, sans jamais repartir directement du planning Sprint 3.

## Déploiement

Le workflow Vercel reste Production Only :

```text
feature branch
→ GitHub CI / QA / build
→ PR
→ review
→ merge main
→ unique Vercel Production
→ prisma migrate deploy
→ pnpm build
```

Aucun Preview Deployment n’est activé et aucun déploiement manuel de branche feature n’est utilisé.
