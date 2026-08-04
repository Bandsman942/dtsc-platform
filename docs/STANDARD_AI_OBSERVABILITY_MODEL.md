# Observabilité IA

Mesures : requêtes, succès, erreurs, fournisseur, modèle, stratégie, fallback, retries, latence, premier token, durée, tokens, coût, outils, récupération, citations, feedback, refus, quota et incident.

`lib/ai/observability.ts` crée puis clôture `AiModelCall`. Les routes Chatbot et Assistant entreprise transmettent contexte, utilisateur, organisation, conversation, tour, locale et stratégie.

Le contenu complet, les secrets, documents sensibles et prompts privés ne sont pas journalisés par défaut. Les métadonnées sont limitées à ce qui est nécessaire au diagnostic et à l’attribution de coût.
