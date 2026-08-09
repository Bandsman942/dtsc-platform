# Observabilité IA

Mesures : requêtes, succès, erreurs, fournisseur, modèle, stratégie, fallback, retries, latence, premier token, durée, tokens, coût, outils, récupération, citations, feedback, refus, quota et incident.

## Deux niveaux complémentaires

`AiModelCall` reste la trace fonctionnelle d'un appel modèle retenu et consommé par le chatbot ou l'assistant entreprise. Il porte notamment contexte, utilisateur, organisation, conversation, modèle final, stratégie, usage, coût, latence et statut.

`AiProviderAttempt` trace chaque tentative technique effectuée par l'orchestrateur, y compris une tentative qui échoue avant l'ouverture du stream et provoque un fallback. Chaque tentative conserve :

- `routeRequestId` commun aux candidats d'une même décision ;
- index de tentative ;
- provider et modèle ;
- contexte et tâche ;
- organisation lorsque applicable ;
- statut `STARTED`, `SUCCESS`, `FAILED` ou `CANCELLED` ;
- reason code ;
- durée.

Cette séparation permet de mesurer réellement les taux de fallback et la santé fournisseur sans transformer `AiModelCall` en second journal de transport.

## Multi-provider

OpenAI direct et OpenRouter produisent le même contrat d'événements DTSC. Les tentatives sont donc comparables par provider/modèle sans que les routes métier connaissent le protocole natif.

Un fallback interne OpenRouter est désactivé : DTSC doit observer chaque changement de provider/modèle et repasser par son Policy Engine. Les éventuels coûts déclarés dans les définitions certifiées restent estimatifs jusqu'à rapprochement avec les données d'usage/facturation réellement disponibles.

## Confidentialité

Le contenu complet, les secrets, documents sensibles et prompts privés ne sont pas journalisés par défaut. `AiProviderAttempt` ne possède aucun champ de prompt ou message. Les métadonnées sont limitées à ce qui est nécessaire au diagnostic, à la santé fournisseur et à l'attribution de coût.
