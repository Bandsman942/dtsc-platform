# Observabilité IA

Mesures : requêtes, succès, erreurs, fournisseur, modèle, stratégie, fallback, retries, latence, premier token, durée, tokens, coût, outils, récupération, citations, feedback, refus, quota et incident.

## Niveaux de trace

`AiModelCall` reste la trace canonique d'un appel IA consommé par le Chatbot ou l'Assistant entreprise. Il porte la sélection finale, le contexte, l'usage, le coût, la latence, le fallback et le statut terminal de l'appel applicatif.

`AiProviderAttempt` est une trace d'exécution plus fine : une ligne par tentative provider/modèle à l'intérieur d'une même décision de routage. Les tentatives d'une requête partagent `routeRequestId` et utilisent `attemptIndex` pour conserver l'ordre. La table ne stocke ni prompt complet, ni contenu de message, ni secret.

AI08 ajoute un troisième niveau complémentaire, sans remplacer les deux précédents :

- `AiAgentRun` : état et budgets agrégés d'une exécution multi-étapes ;
- `AiAgentStep` : étapes auditables du run (modèle, outil, confirmation, statut, provider/modèle, tokens, coût, durée, reason code).

Un run peut donc référencer plusieurs appels modèle/provider et plusieurs outils tout en conservant une seule identité d'exécution agentique.

## Cycle de vie provider

`lib/ai/orchestrator.ts` crée l'observation avant l'appel provider. Les erreurs HTTP ou de connexion survenues avant la remise du stream sont clôturées immédiatement et peuvent déclencher un fallback uniquement lorsqu'elles sont retryables et toujours compatibles avec la policy.

Lorsqu'un stream OpenAI ou OpenRouter est obtenu, `observeAiProviderAttemptStream()` conserve la tentative en cours jusqu'à son vrai terminal :

- `COMPLETED` → `SUCCESS` ;
- événement `ERROR` → `FAILED` avec reason code ;
- fin de transport sans `COMPLETED` → `FAILED / STREAM_INTERRUPTED` ;
- cancellation → `CANCELLED / STREAM_INTERRUPTED`.

Cette séparation évite de considérer une simple ouverture HTTP comme un succès d'inférence. L'adapter OpenRouter réutilise le même contrat `AiProviderEvent`, de sorte que les métriques provider restent comparables sans dépendre du protocole natif.

Dans AI08, chaque tour modèle du run repasse par le même orchestrateur et produit donc les mêmes traces provider. L'Agent Runtime ne fabrique pas une télémétrie provider parallèle.

## Appel modèle

`lib/ai/observability.ts` continue de créer puis clôturer `AiModelCall`. Les routes Chatbot et Assistant entreprise transmettent contexte, utilisateur, organisation, conversation, locale et stratégie, puis enregistrent usage, coût et latence à la fin du consumer applicatif.

Le contenu complet, les secrets, documents sensibles et prompts privés ne sont pas journalisés par défaut. Les métadonnées sont limitées à ce qui est nécessaire au diagnostic, à la sécurité, au fallback et à l'attribution de coût.

## Agent Runtime AI08

`AiAgentRun` mesure :

- scope global/Enterprise ;
- classe d'exécution ;
- contexte et assistant ;
- statut terminal ou suspendu ;
- `maxSteps`, `maxToolCalls`, `maxTokens`, `maxEstimatedCost`, `maxDurationMs` ;
- étape courante et nombre d'appels outils ;
- tokens d'entrée/sortie/total ;
- coût estimé cumulé ;
- confirmation en attente ;
- demande/cause de cancellation ;
- reason code ;
- timestamps start/completed/cancelled.

`AiAgentStep` mesure :

- index et type d'étape ;
- statut ;
- code outil éventuel ;
- provider/modèle éventuels ;
- tokens/coût de l'étape ;
- durée active ;
- reason code.

L'attente humaine d'une confirmation ne doit pas être interprétée comme de la latence provider ou comme de la durée active du modèle. La reprise reconstitue le budget de durée à partir des étapes exécutées.

Les tokens et coûts de reprise sont comptés en delta par rapport à l'usage déjà enregistré avant suspension, afin d'éviter un double comptage fonctionnel.

## Outils, confirmations et MCP

`AiToolExecution` reste l'identité canonique d'exécution d'un outil et sa source d'idempotence. `AiAgentStep` ne la remplace pas ; il indique seulement qu'une étape du run a proposé/exécuté un outil donné.

Les confirmations sont observables via le statut du run et les traces Tool Gateway. Un refus explicite ferme le run lié avec `CONFIRMATION_CANCELLED` s'il attend encore cette confirmation.

Les appels MCP continuent d'émettre leurs événements d'audit MCP dédiés en plus de `AiToolExecution`. Un run Agent n'efface ni ne duplique cette provenance.

## UX et confidentialité

`GET /api/ai/agent/runs/:id` expose un payload volontairement réduit pour l'interface : état, plafonds, consommation, confirmation id et étapes auditables.

Ne sont pas exposés :

- `metadataJson` interne ;
- prompts complets ;
- messages privés recopiés ;
- chaîne de pensée/reasoning privé ;
- arguments bruts d'outil ;
- secrets provider/MCP.

Le panneau Agent affiche progression, outils, tokens, coût estimé, reason codes et contrôles de confirmation/cancellation/reprise à partir de ce payload sûr.

## Health registry AI03

`lib/ai/health.ts` ne crée aucune table de santé. Il dérive l'état runtime depuis les traces déjà existantes sur une fenêtre récente bornée :

- succès/échecs depuis `AiProviderAttempt` ;
- latence premier token depuis `AiModelCall.firstTokenLatencyMs` ;
- statut configuré du provider et du modèle.

États calculés : `HEALTHY`, `DEGRADED`, `UNAVAILABLE`, `DISABLED_BY_POLICY`.

Le health registry sert exclusivement à éliminer une indisponibilité technique avérée ou à déprioriser un candidat dégradé après que la policy AI00 l'a déclaré éligible. Il ne peut jamais autoriser un modèle, une classification, un plan ou un tenant.

Si la lecture de télémétrie est temporairement indisponible, `reason=OBSERVABILITY_UNAVAILABLE` est retourné et la télémétrie cesse d'influencer le classement. Cette défaillance ne supprime aucune barrière AI00.

## Explicabilité AI03

`AiModelCall.metadataJson` enregistre notamment :

- `selectionReason` ;
- `selectionScore` ;
- `selectionCriteria` ;
- `requestedModel`.

Les critères comprennent les composantes capacité, préférence, santé, coût, latence, pénalité de fallback, le statut health et sa raison. Ce sont des métadonnées de décision non sensibles ; le prompt, les messages, les documents et les secrets ne sont pas copiés dans cette explication.

Cette séparation permet d'expliquer pourquoi un modèle a été choisi sans créer de journal de raisonnement privé ni de nouvelle source de consommation.

## Indicateurs AI08 recommandés

Les tableaux opérationnels peuvent dériver, sans stocker de contenu privé :

- nombre de runs démarrés/terminés/annulés/échoués ;
- taux de `BUDGET_EXHAUSTED` ;
- steps moyens par run ;
- tool calls moyens par run ;
- taux de confirmations demandées/acceptées/refusées ;
- taux de reprise réussie ;
- provider/modèle par run ;
- coût et tokens agrégés ;
- durée active ;
- taux de réussite par assistant et toolCode ;
- reason codes dominants ;
- refus tenant/sensitive/policy.

Ces métriques doivent distinguer usage réel, coût estimé et coût inconnu selon les contrats existants.

## OpenRouter et audit distant

Le script `scripts/ai/audit-openrouter-catalog.mjs` est un contrôle de certification, pas une source d'observabilité d'usage. Il consulte le catalogue ZDR compatible en lecture seule et ne crée aucun `AiModelCall` ni `AiProviderAttempt`, car aucune génération utilisateur n'a lieu.

Les E2E Production AI08 doivent confirmer que les provider attempts, model calls, agent runs/steps et Tool Gateway executions se recoupent sans double comptage ni perte de provenance.
