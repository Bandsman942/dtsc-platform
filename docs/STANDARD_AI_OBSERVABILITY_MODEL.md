# Observabilité IA

Mesures : requêtes, succès, erreurs, fournisseur, modèle, stratégie, fallback, retries, latence, premier token, durée, tokens, coût, outils, récupération, citations, feedback, refus, quota et incident.

## Deux niveaux de trace

`AiModelCall` reste la trace canonique d'un appel IA consommé par le Chatbot ou l'Assistant entreprise. Il porte la sélection finale, le contexte, l'usage, le coût, la latence, le fallback et le statut terminal de l'appel applicatif.

`AiProviderAttempt` est une trace d'exécution plus fine : une ligne par tentative provider/modèle à l'intérieur d'une même décision de routage. Les tentatives d'une requête partagent `routeRequestId` et utilisent `attemptIndex` pour conserver l'ordre. La table ne stocke ni prompt complet, ni contenu de message, ni secret.

Champs opérationnels principaux :

- provider et modèle réellement tentés ;
- contexte et type de tâche ;
- organisation nullable ;
- statut `STARTED`, `SUCCESS`, `FAILED` ou `CANCELLED` ;
- `reasonCode` normalisé ;
- durée de tentative ;
- timestamps début/fin.

## Cycle de vie provider

`lib/ai/orchestrator.ts` crée l'observation avant l'appel provider. Les erreurs HTTP ou de connexion survenues avant la remise du stream sont clôturées immédiatement et peuvent déclencher un fallback uniquement lorsqu'elles sont retryables et toujours compatibles avec la policy.

Lorsqu'un stream est obtenu, `observeAiProviderAttemptStream()` conserve la tentative en cours jusqu'à son vrai terminal :

- `COMPLETED` → `SUCCESS` ;
- événement `ERROR` → `FAILED` avec reason code ;
- fin de transport sans `COMPLETED` → `FAILED / STREAM_INTERRUPTED` ;
- cancellation → `CANCELLED / STREAM_INTERRUPTED`.

Cette séparation évite de considérer une simple ouverture HTTP comme un succès d'inférence.

## Appel modèle

`lib/ai/observability.ts` continue de créer puis clôturer `AiModelCall`. Les routes Chatbot et Assistant entreprise transmettent contexte, utilisateur, organisation, conversation, locale et stratégie, puis enregistrent usage, coût et latence à la fin du consumer applicatif.

Le contenu complet, les secrets, documents sensibles et prompts privés ne sont pas journalisés par défaut. Les métadonnées sont limitées à ce qui est nécessaire au diagnostic, à la sécurité, au fallback et à l'attribution de coût.
