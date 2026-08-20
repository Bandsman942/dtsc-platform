# SCALE-4C — File durable et worker Web Push isolé

Issue : #449
Parent : #357
Programme : #352

## Objectif

Retirer les appels réseau Web Push du chemin synchrone des actions métier sans changer la notification canonique visible dans DTSC Platform.

Une action métier continue de créer sa `Notification` en base immédiatement. Le dispatch vers les navigateurs est ensuite traité par un worker interne dédié.

## Architecture

SCALE-4C réutilise `EnterpriseDomainEvent` comme file durable canonique. Aucune seconde table de queue et aucune seconde source de vérité ne sont introduites.

Les jobs Push utilisent :

- `eventType = PLATFORM_WEB_PUSH_NOTIFICATION` ;
- `entityType = Notification` ;
- `entityId = <notification.id>` ;
- `idempotencyKey = platform:web-push:<notification.id>` ;
- aucun `payloadJson` métier.

Pour une notification sans organisation, le scope technique de queue est `__DTSC_PLATFORM__`. Cette valeur n'est jamais présentée au client. Au dispatch, le worker relit la notification et vérifie que son `organizationId` normalisé correspond exactement au scope du job avant d'utiliser la relation vers l'utilisateur.

## Atomicité

### Notification unique

`notifyUser()` crée la notification et son job Push dans la même transaction Prisma. Si l'enqueue échoue, la notification n'est pas validée seule.

La clé d'idempotence métier existante de `notifyUser()` reste inchangée. Le job Push utilise l'ID canonique de notification comme identité durable.

### Notifications multiples

`notifyUsers()` pré-génère les IDs de notifications, puis crée dans une seule transaction :

1. les notifications ;
2. les événements Push correspondants.

Le précédent ID Push synthétique fondé sur l'heure n'est plus utilisé.

## Isolation des workers

Le worker workflow et le worker Web Push partagent la table durable mais pas les jobs :

- le worker workflow exclut explicitement `PLATFORM_WEB_PUSH_NOTIFICATION` de son claim et de ses métriques ;
- le worker Push ne réclame que `PLATFORM_WEB_PUSH_NOTIFICATION` ;
- les claims utilisent `FOR UPDATE SKIP LOCKED` avec lease ;
- un worker ne peut donc pas consommer le travail de l'autre.

Le worker Web Push est exposé uniquement par :

`/api/internal/web-push/process?batch=50`

La route accepte `CRON_SECRET` ou `WEB_PUSH_WORKER_SECRET`, comparés avec `timingSafeEqual`. La Function est bornée à 60 secondes.

## Cadence et capacité bornée

Vercel Cron appelle le worker chaque minute avec un batch maximal de 50 jobs.

Le résultat interne expose uniquement des compteurs et métriques de file :

- `claimed` ;
- `processed` ;
- `delivered` ;
- `skipped` ;
- `failed` ;
- `dead` ;
- `recovered` ;
- `queueBefore` / `queueAfter` ;
- `saturated`.

Aucun `userId`, `organizationId`, endpoint Push, contenu de notification ou payload métier n'est renvoyé.

## Retry, lease et DLQ

Un job passe par :

`PENDING → PROCESSING → PROCESSED`

Une erreur rejouable produit :

`PROCESSING → FAILED → PROCESSING`

Le backoff est exponentiel, démarrant à 10 secondes et borné à 300 secondes. Après 5 tentatives, le job passe à `DEAD`.

Sont notamment rejouables :

- exception réseau ;
- timeout du transport ;
- HTTP 408, 425, 429 et 5xx ;
- configuration VAPID momentanément indisponible.

Une lease `PROCESSING` périmée est récupérée et repassée en `FAILED` afin qu'une interruption de Function ne bloque pas définitivement le job.

Les erreurs enregistrées dans `lastError` sont des codes internes bornés, jamais des URLs d'endpoint ou du contenu métier.

## Subscriptions expirées

Les réponses 404 et 410 du fournisseur Push restent terminales pour la subscription concernée. La subscription obsolète est supprimée et le traitement du job peut se terminer sans retry inutile.

## Déduplication visible lors des retries

`createDtscPushPayload()` construit déjà le `tag` du Service Worker à partir de l'ID canonique de notification. Un retry d'un même job réutilise donc le même tag ; le navigateur remplace la notification système correspondante au lieu d'empiler volontairement plusieurs notifications visibles pour le même événement.

## Préférences et confidentialité

SCALE-4C ne change pas :

- les préférences de notification applicatives ;
- `pushNotificationsEnabled` ;
- le mode de contenu Push privé/détaillé ;
- la limite de 12 subscriptions récentes par utilisateur ;
- la normalisation des deep links ;
- le RBAC ou les règles multi-tenant des actions métier.

Le worker relit toujours la notification canonique et l'utilisateur au moment du dispatch.

## Observabilité

Le snapshot Push mesure :

- jobs prêts ;
- jobs `PROCESSING` avec lease active ;
- jobs `DEAD` ;
- âge du plus ancien job prêt ;
- saturation lorsque le batch complet est réclamé et qu'un backlog reste disponible.

Ces métriques ne contiennent aucune donnée métier.

## Base de données

Aucune migration n'est nécessaire dans SCALE-4C : `EnterpriseDomainEvent` possède déjà les champs et indexes de file requis (`processingStatus`, `availableAt`, lease, tentatives, idempotence, erreur bornée).

Une optimisation d'index supplémentaire ne sera ajoutée que sur preuve de charge réelle plutôt que par anticipation, conformément au programme de scalabilité.

## Validation

La gate dédiée est :

`node scripts/qa-scale4c-web-push-worker.mjs`

Elle est chaînée à `scripts/run-regression-qa-ci.mjs`. La QA session/Web Push historique exige désormais la transaction durable et l'absence de dispatch réseau direct depuis `notifyUser()` / `notifyUsers()`.

Les états de preuve restent `NOT_EXECUTED` tant que la CI du SHA final n'a pas réellement terminé.

## Rollback

1. retirer le cron `/api/internal/web-push/process` ;
2. rétablir le dispatch best-effort synchrone depuis `lib/notifications.ts` si un rollback applicatif complet est requis ;
3. retirer l'exclusion `PLATFORM_WEB_PUSH_NOTIFICATION` des workers workflow uniquement après suppression de tout job Push restant.

Aucune donnée Notification n'a besoin d'être migrée ou restaurée.

## Dette restante de SCALE-4

Ce lot ne déplace pas encore hors requête interactive :

- l'envoi Zoho/email des broadcasts ;
- imports/exports lourds ;
- rapports lourds ;
- indexation IA.

Ces traitements restent tracés par #357 et doivent être découpés dans les sous-lots suivants plutôt qu'ajoutés silencieusement à #449.

## Réconciliation avec le dernier main

Le 20 août 2026, la branche SCALE-4C a été revalidée après la fusion de #448 sur `main@70a90680613b1e6222b2a38850b7878de6a67c4c`. La comparaison confirme que le lot Patients et SCALE-4C ne modifient aucun fichier commun. Une nouvelle CI sur le merge-ref courant reste l'autorité avant toute fusion de #450.
