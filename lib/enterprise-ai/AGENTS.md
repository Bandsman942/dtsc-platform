# Enterprise AI — règles conversationnelles pérennes

- `EnterpriseAiConversation` reste la source de vérité de l'historique métier ; `EnterpriseAiConversationPreference` ajoute uniquement les préférences propres à une conversation.
- Toute préférence Enterprise AI doit être bornée simultanément par `organizationId`, `userId` et `conversationId` après `getEnterpriseAiAccess(...)`.
- Un rôle DTSC global ne donne jamais accès aux conversations, sources ou outils IA d'une organisation cliente sans membership actif et entitlement du module.
- Le modèle demandé doit appartenir au catalogue canonique `lib/ai/catalog.ts` et rester autorisé pour le contexte, la locale, le plan et la politique de données ; une valeur client arbitraire ne doit jamais être passée au provider.
- `useKnowledge` ne peut activer que les sources RAG auxquelles l'utilisateur a déjà accès. Il ne change aucune règle de confidentialité.
- `useTools` ne peut activer que les outils backend déjà autorisés par RBAC/entitlement et reste limité à la lecture tant qu'aucun workflow sensible n'a été explicitement approuvé.
- Ne pas inventer de recherche Web ou de source externe dans l'UI. Une nouvelle source nécessite un backend réel, une politique d'accès et de l'audit.
- Les instructions personnalisées de conversation sont subordonnées aux instructions sectorielles, règles de sécurité, confidentialité, RBAC, isolation tenant et confirmation humaine DTSC.
- Les citations affichées proviennent de `EnterpriseAiMessage.citationsJson`; ne jamais fabriquer de citation côté frontend.
- Le feedback d'une réponse assistant est persisté dans `EnterpriseAiMessageFeedback`, limité à `-1` ou `1`, et vérifie que le message appartient à une conversation de l'utilisateur dans l'organisation active.
- Les migrations IA conversationnelles restent additives. Ne pas DROP/ALTER destructivement les tables d'historique existantes pour ajouter une préférence d'interface.

## Gouvernance IA itération 05

- Les modèles entreprise sont résolus par `lib/ai/catalog.ts` et `lib/ai/orchestrator.ts`, jamais par un identifiant client arbitraire.
- Chaque appel applicatif crée une observation `AiModelCall`; chaque tentative provider/modèle crée une observation `AiProviderAttempt`. Aucun de ces journaux ne stocke le contenu sensible complet.
- Les consommateurs métier utilisent le flux normalisé `AiProviderEvent`; les noms d'événements natifs d'un provider restent confinés à son adapter.
- Les sources et fragments conservent leur langue source. Les citations persistées transportent langue, page et section lorsqu'elles existent.
- Les outils actifs restent en lecture ou préparation tant qu'une mutation canonique, confirmée et idempotente n'a pas été livrée.
- Les erreurs fournisseur sont normalisées en `reasonCode` stable puis traduites par la couche de présentation.
