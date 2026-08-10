# DTSC Standard AI — Agent Runtime

## Objectif

AI08 ajoute une boucle agentique bornée au-dessus des autorités déjà livrées par AI00→AI07. Il ne crée ni un nouveau routeur de modèles, ni un nouveau moteur d’outils, ni une troisième mémoire conversationnelle.

Le chemin canonique reste :

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

## Sources de vérité réutilisées

- `Conversation` / `Message` restent la mémoire du chatbot global.
- `EnterpriseAiConversation` / `EnterpriseAiMessage` restent la mémoire de l’assistant entreprise.
- `routeAiStream()` reste l’autorité de sélection provider/modèle/policy.
- `executeAiTool()` reste l’unique frontière d’exécution outil.
- `AiToolConfirmation` / `AiToolExecution` restent l’autorité de confirmation/idempotence des mutations.
- `AiAgentRun` et `AiAgentStep` ne stockent que l’état d’exécution, les limites, compteurs, outils appelés, provider/modèle, coûts/durées et reason codes.

Aucune chaîne de pensée privée, prompt complet ou copie de conversation n’est persistée dans les tables agent.

## Baseline certifiée

La première livraison certifie l’**Interactive Agent**. Il s’exécute dans la requête de chat avec :

- `maxSteps` ;
- `maxToolCalls` ;
- `maxTokens` ;
- `maxEstimatedCost` ;
- `maxDurationMs` ;
- modes/codes outils autorisés.

Les valeurs sont des plafonds serveur par plan. Un payload client pourra demander une limite inférieure, jamais supérieure.

### Plafonds initiaux

- Starter : 3 étapes, 2 tools, 4k tokens, coût estimé 0,10, 20 s, READ/PREPARE.
- Business : 6 étapes, 4 tools, 12k tokens, coût estimé 0,50, 45 s, READ/PREPARE/MUTATE.
- Enterprise : 8 étapes, 6 tools, 24k tokens, coût estimé 2,00, 50 s, READ/PREPARE/MUTATE.

Ces limites sont des budgets de sécurité, pas des promesses de consommation ni de prix facturé.

## Outils model-driven

Le modèle reçoit uniquement les définitions d’outils qui ont déjà passé `authorizeAiTool()` dans le contexte courant. Il ne peut pas inventer un code exécutable.

OpenAI Responses et OpenRouter Chat Completions reçoivent désormais les définitions structurées certifiées. Les événements natifs restent normalisés en `TOOL_CALL_DELTA` / `TOOL_CALL_COMPLETED` avant d’atteindre le runtime agentique.

Lorsqu’un tool call est proposé :

1. le code doit appartenir à la liste autorisée du run ;
2. `executeAiTool()` revalide encore le contexte, tenant, plan, modules, permissions, schemas et policy ;
3. le résultat est validé par le Tool Gateway ;
4. le résultat est réinjecté au modèle comme **donnée non fiable**, jamais comme instruction système ;
5. le texte produit avant un tool call est tamponné et n’est pas publié comme réponse finale.

## Mutations et confirmation humaine

Une mutation certifiée reste soumise à AI06 : confirmation structurelle, hash d’arguments, expiration, single-use, idempotence et audit.

Si `executeAiTool()` retourne `CONFIRMATION_REQUIRED` :

- le run devient `WAITING_CONFIRMATION` ;
- l’identifiant de confirmation est persisté ;
- la requête s’arrête proprement ;
- le navigateur confirme via l’API Tool Gateway existante ;
- après exécution confirmée, le run devient `READY_TO_RESUME`.

Le modèle ne peut jamais se confirmer lui-même et un texte comme « oui », « ok » ou « vas-y » n’est pas une autorisation.

La reprise complète du raisonnement après confirmation doit relire le résultat canonique déjà exécuté et la conversation source ; elle ne doit jamais accepter du navigateur un faux résultat ou de nouveaux arguments. Tant que cette reprise n’est pas certifiée end-to-end, `READY_TO_RESUME` reste un état explicite et honnête.

## Domaines sensibles

Pour `RESTRICTED`, `HEALTH_SENSITIVE`, `HR_SENSITIVE`, `FINANCIAL_SENSITIVE`, `LEGAL_SENSITIVE` et `SECRET`, le runtime limite les outils exposés à READ/PREPARE. `SENSITIVE_MUTATE` n’est jamais exposé dans la baseline AI08.

Conséquences :

- Health : analyse/préparation possibles, aucune décision clinique finale autonome.
- Finance : aucune écriture comptable/paiement autonome.
- RH : aucune paie, sanction ou décision RH finale autonome.
- Legal : aucun engagement juridique final autonome.

Les workflows métier canoniques restent l’autorité finale.

## Cancellation

Un run interactif observe :

- l’AbortSignal de la requête ;
- une demande de cancellation persistée ;
- une déconnexion du flux.

L’annulation est propagée au stream provider. Un run déjà suspendu sur confirmation ou prêt à reprendre est clôturé immédiatement en `CANCELLED` si l’utilisateur l’annule.

Les mutations déjà confirmées/exécutées ne sont jamais « annulées » fictivement : leur audit et leur effet métier restent réels.

## Retry

La boucle agentique initiale n’ajoute aucun retry automatique de tool call. Les fallbacks provider restent ceux du Policy Router. Une future politique de retry outil ne pourra s’appliquer qu’à un outil explicitement idempotent et avec une règle serveur dédiée.

## Observabilité

`AiAgentRun` agrège :

- état ;
- étapes ;
- tool calls ;
- tokens ;
- coût estimé ;
- durée/budget ;
- confirmation pendante ;
- cancellation ;
- reason code.

`AiAgentStep` expose uniquement des métadonnées d’exécution utiles : type d’étape, statut, code outil, provider/modèle, tokens, coût, durée et reason code. L’API de statut n’expose pas `metadataJson`, arguments outils, prompts ou reasoning privé.

## Durable / background agent

Le repo possède déjà une vraie infrastructure de worker durable pour les workflows entreprise (`lib/enterprise/workflows/worker.ts` et `/api/internal/workflows/process`) avec lease DB, `FOR UPDATE SKIP LOCKED`, retry/backoff et reprise.

AI08 ne simule donc pas un agent durable avec une longue requête HTTP. La classe `DURABLE` est réservée dans le modèle de domaine, mais son activation comme agent background est **reportée tant qu’un contrat d’intégration dédié avec cette infrastructure n’a pas été implémenté et validé**.

## Commercial readiness

La présence du runtime et de QA vertes ne suffit pas pour `COMMERCIAL_READY`. Il faut encore, sur un SHA `main` Production :

- scénario chatbot agent ;
- scénario assistant entreprise ;
- CAG+RAG multi-étapes ;
- OpenRouter/fallback ;
- READ/PREPARE/MUTATE confirmé ;
- MCP READ réel avec un serveur certifié ;
- cancellation ;
- refus cross-tenant/sensitive ;
- preuves propriétaire persistées.

Aucun de ces E2E externes n’est inventé si les providers/connecteurs réels ne sont pas configurés.
