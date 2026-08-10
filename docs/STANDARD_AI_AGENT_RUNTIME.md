# DTSC Standard AI — Agent Runtime

## Objectif

AI08 ajoute une boucle agentique bornée au-dessus des autorités AI00→AI07. Il ne crée ni nouveau routeur de modèles, ni nouveau moteur d’outils, ni troisième mémoire conversationnelle.

```text
Conversation existante
  -> Assistant Runtime / Context Engine / CAG / RAG
  -> Policy Router
  -> provider certifié
  -> structured tool proposal
  -> DTSC Tool Gateway
  -> résultat validé/audité
  -> modèle
  -> réponse finale
```

## Sources de vérité

- `Conversation` / `Message` : mémoire chatbot global.
- `EnterpriseAiConversation` / `EnterpriseAiMessage` : mémoire assistant entreprise.
- `routeAiStream()` : sélection provider/modèle/policy.
- `executeAiTool()` : unique frontière d’exécution outil.
- `AiToolConfirmation` / `AiToolExecution` : confirmation/idempotence des mutations.
- `AiAgentRun` / `AiAgentStep` : état d’exécution, limites, compteurs, provider/modèle, outils, tokens, coût, durée et reason codes.

Les tables Agent ne persistentent aucune chaîne de pensée privée, prompt complet ou copie de conversation.

## Surfaces serveur AI08

Le mode agent reste séparé des routes historiques afin que le comportement existant ne change pas sans opt-in explicite :

- `POST /api/chat/agent` : agent interactif du chatbot global ;
- `POST /api/enterprise/ai/agent` : agent interactif entreprise ;
- `GET /api/ai/agent/runs/:id` : état sûr du run ;
- `POST /api/ai/agent/runs/:id/cancel` : cancellation ;
- `POST /api/ai/agent/runs/:id/resume` : reprise après confirmation structurelle.

Les routes historiques `/api/chat/v2` et `/api/enterprise/ai/chat` restent indépendantes du runtime agentique.

## Budgets serveur

La première livraison certifie l’`INTERACTIVE` Agent. Les plafonds initiaux sont serveur-side et une requête client ne peut que demander plus restrictif :

| Plan | Étapes | Tools | Tokens | Coût estimé max | Durée active | Modes |
|---|---:|---:|---:|---:|---:|---|
| Starter | 3 | 2 | 4 000 | 0,10 | 20 s | READ, PREPARE |
| Business | 6 | 4 | 12 000 | 0,50 | 45 s | READ, PREPARE, MUTATE |
| Enterprise | 8 | 6 | 24 000 | 2,00 | 50 s | READ, PREPARE, MUTATE |

Le coût est un budget de sécurité d’exécution, pas une promesse de facturation.

Une préférence `useTools=false` se traduit par `maxToolCalls=0`, `allowedToolModes=[]` et `allowedToolCodes=[]`. Une liste vide est restrictive ; elle ne signifie jamais « tous les outils ».

## Structured tool calls

Le modèle reçoit uniquement les outils qui ont déjà passé `authorizeAiTool()` dans le contexte courant. OpenAI Responses et OpenRouter Chat Completions reçoivent des définitions fonctionnelles structurées ; leurs événements natifs sont normalisés en `TOOL_CALL_DELTA` / `TOOL_CALL_COMPLETED` avant le runtime agentique.

Lorsqu’un tool call est proposé :

1. son code doit appartenir à l’ensemble autorisé du run ;
2. `executeAiTool()` revalide tenant, plan, modules, permissions, schemas et policy ;
3. le résultat est validé/audité par le Tool Gateway ;
4. il est réinjecté au modèle comme **donnée non fiable**, jamais comme instruction système ;
5. le texte produit avant le tool call est tamponné et n’est pas publié comme réponse finale.

Aucun import dynamique piloté par un code outil modèle n’existe.

## Confirmation humaine et suspension

Une mutation certifiée conserve toutes les garanties AI06 : hash d’arguments, expiration, single-use, idempotence et audit.

Si `executeAiTool()` retourne `CONFIRMATION_REQUIRED` :

```text
RUNNING
  -> WAITING_CONFIRMATION
  -> confirmation Tool Gateway
  -> AiToolExecution SUCCESS
  -> READY_TO_RESUME
  -> claim atomique
  -> RUNNING
```

Le modèle ne peut jamais se confirmer lui-même. Des mots tels que `oui`, `yes`, `ok` ou `vas-y` ne constituent aucune autorité de mutation.

## Reprise canonique du même run

La route `/resume` n’accepte aucun body métier du navigateur. Elle reçoit uniquement le `runId` par l’URL et :

1. recharge `AiAgentRun` par `userId + organisation active` ;
2. exige `READY_TO_RESUME` et le `pendingConfirmationId` ;
3. recharge côté serveur le `AiToolExecution` correspondant, avec `status=SUCCESS` ;
4. vérifie quotas et contexte actuels ;
5. re-clampe le budget persistant avec le plan et les classifications actuels ;
6. claim atomiquement `READY_TO_RESUME -> RUNNING` ;
7. réinjecte `resultJson` comme donnée non fiable ;
8. continue **le même `runId`**, sans créer de second run.

Le claim est single-winner : deux clics concurrents ne créent pas deux continuations.

Les tokens/coûts déjà comptabilisés avant confirmation ne sont pas comptés une seconde fois. Les écritures d’usage de la continuation utilisent uniquement le delta entre l’usage final cumulé et l’usage du run avant reprise.

La période humaine passée à attendre la confirmation n’est pas comptée comme durée active du modèle ; la reprise reconstitue la durée active à partir des étapes exécutées.

## Quotas et changements de droits pendant l’attente

Une confirmation ne fige pas les permissions dans le temps. Avant reprise :

- le tenant actif est revérifié ;
- Enterprise AI access est revérifié ;
- les quotas courants sont revérifiés ;
- le plan actuel re-clampe les plafonds ;
- les outils sont de nouveau filtrés via `authorizeAiTool()` ;
- les classifications actuelles peuvent encore réduire les modes autorisés.

Une baisse de plan ou de rôle réduit donc les capacités au lieu de conserver artificiellement l’ancien niveau.

## Domaines sensibles

Pour `RESTRICTED`, `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` et `SECRET`, le runtime limite l’exposition aux modes READ/PREPARE. `SENSITIVE_MUTATE` n’est jamais exposé dans la baseline AI08.

- Health : aucune décision clinique finale autonome.
- Finance : aucun paiement ni écriture comptable autonome.
- RH : aucune paie, sanction ou décision finale autonome.
- Legal : aucun engagement juridique final autonome.

Les workflows métier canoniques restent l’autorité finale.

## Cancellation

Un run interactif observe :

- l’AbortSignal HTTP ;
- une demande de cancellation persistée ;
- une déconnexion du stream.

L’annulation est propagée au provider. Un run suspendu en `WAITING_CONFIRMATION` ou `READY_TO_RESUME` est clôturé immédiatement si l’utilisateur annule.

Une mutation déjà confirmée/exécutée reste auditée et réelle : la cancellation du run ne prétend jamais l’effacer.

## Retry

AI08 n’ajoute aucun retry automatique de tool call. Les fallbacks provider restent ceux du Policy Router. Une future politique de retry outil devra exiger un outil explicitement idempotent et une policy serveur dédiée.

## Observabilité et confidentialité

`AiAgentRun` agrège statut, limites, steps, tool calls, tokens, coût estimé, confirmation, cancellation et reason code.

`AiAgentStep` conserve seulement les métadonnées nécessaires à l’audit d’exécution : type d’étape, statut, code outil, provider/modèle, tokens, coût, durée et reason code.

L’API de statut n’expose pas `metadataJson`, arguments outils, prompts ou raisonnement privé.

## Durable / background agent

Le repo possède déjà un worker durable réel pour les workflows entreprise (`lib/enterprise/workflows/worker.ts` et `/api/internal/workflows/process`) avec lease DB, `FOR UPDATE SKIP LOCKED`, retry/backoff et reprise.

AI08 ne simule donc pas un background agent avec une requête HTTP longue. La classe `DURABLE` reste réservée dans le modèle de domaine ; son activation est reportée tant qu’un contrat d’intégration dédié avec cette infrastructure n’a pas été implémenté et validé.

## QA opposable

Les gates Standard AI incluent désormais :

- runtime + confidentialité ;
- budgets ;
- confirmation ;
- reprise canonique ;
- idempotence ;
- cancellation ;
- isolation tenant ;
- domaines sensibles.

La reprise QA exige notamment : aucun `req.json()` dans la route resume, aucun second `AiAgentRun`, `AiToolExecution SUCCESS` côté serveur, claim atomique, quotas actuels et delta d’usage.

## Commercial readiness

Le runtime et des Quality Gates vertes ne suffisent pas à `COMMERCIAL_READY`. Il faut encore, sur un SHA `main` Production :

- E2E chatbot agent ;
- E2E assistant entreprise ;
- CAG+RAG multi-étapes ;
- OpenRouter + fallback ;
- READ ;
- PREPARE ;
- MUTATE confirmé puis repris ;
- MCP READ avec un serveur réellement certifié ;
- cancellation ;
- refus cross-tenant/sensitive ;
- preuves propriétaire persistées.

Aucune preuve externe ne doit être inventée quand un provider ou connecteur réel n’est pas configuré.
