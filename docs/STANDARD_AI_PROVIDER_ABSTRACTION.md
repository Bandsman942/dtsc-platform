# Abstraction fournisseur IA

`lib/ai/provider.ts` normalise l’appel Responses en streaming : messages, instructions, signal d’annulation, identifiant fournisseur, modèle et erreurs HTTP.

## Erreurs communes

`PROVIDER_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `RATE_LIMITED`, `TIMEOUT`, `CONTEXT_TOO_LARGE`, `CONTENT_REJECTED`, `INVALID_REQUEST`, `AUTHENTICATION_FAILED`, `STRUCTURED_OUTPUT_INVALID`, `TOOL_CALL_INVALID`, `STREAM_INTERRUPTED`, `UNKNOWN_PROVIDER_ERROR`.

Les erreurs sont classées par `lib/ai/errors.ts`; elles restent indépendantes de la langue. Les routes traduisent les messages via `lib/ai/i18n.ts`.

## Sécurité

- secret lu uniquement par `process.env[provider.apiKeyEnv]` ;
- `store: false` demandé au protocole fournisseur ;
- aucune clé, URL secrète ou payload sensible complet dans les logs ;
- annulation transmise au fournisseur lorsque supportée.
