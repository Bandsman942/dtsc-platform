# IA Assistant Entreprise

## Objectif

Le module `AI_ASSISTANT` fournit un assistant IA sectoriel pour les organisations clientes actives. Il combine:

- CAG: contexte contrôlé de l'entreprise, du secteur, du plan, des modules activés et des règles métier;
- RAG: sources documentaires privées indexées en embeddings pgvector et filtrées par `organizationId`;
- outils backend en lecture: synthèses métier autorisées sans mutation directe;
- quotas de plan: messages mensuels, sources, stockage, outils lecture et brouillons d'action.

## Modèle de données

La migration `20260616183000_enterprise_ai_assistant` ajoute uniquement des tables nouvelles:

- `EnterpriseAiAssistant`
- `EnterpriseAiConversation`
- `EnterpriseAiMessage`
- `EnterpriseAiKnowledgeSource`
- `EnterpriseAiKnowledgeChunk`
- `EnterpriseAiToolCall`
- `EnterpriseAiUsage`
- `EnterpriseAiSetting`

Les chunks utilisent `vector(1536)` et `CREATE EXTENSION IF NOT EXISTS vector`. Aucune table existante n'est supprimée ou modifiée destructivement.

## Routes API

`POST /api/enterprise/ai/chat`

- Accès: membre `ACTIVE` de l'organisation active, module `AI_ASSISTANT` activé et autorisé par le plan.
- Sécurité: origine same-origin, session, utilisateur actif via membership, rate limit, validation Zod, quotas mensuels.
- Payload: `organizationId`, `conversationId?`, `content`, `model?`, `useKnowledge`, `useTools`.
- Réponse: message assistant, citations RAG, résultats d'outils, usage.

`GET /api/enterprise/ai/conversations`

- Accès: membre actif de l'organisation active.
- Paramètre: `organizationId`.
- Réponse: conversations IA de l'utilisateur dans cette organisation.

`GET|POST /api/enterprise/ai/knowledge-sources`

- `GET`: liste paginée des sources de l'organisation.
- `POST`: upload et indexation d'une source texte/PDF supportée.
- Sécurité `POST`: origine, session, rate limit, validation Zod, permissions, quotas source/stockage.

`PATCH /api/enterprise/ai/knowledge-sources/[id]`

- Actions: `archive`, `restore`.
- Accès: gestionnaire IA de l'entreprise.
- L'archivage retire la source du RAG actif sans supprimer les traces.

`GET /api/enterprise/ai/usage`

- Accès: responsable entreprise.
- Réponse: consommation mensuelle organisation, limites et restants.

`GET|PATCH /api/enterprise/ai/settings`

- `GET`: paramètres IA et permissions de gestion.
- `PATCH`: activation, uploads, outils lecture, brouillons d'action et rétention.
- Sécurité `PATCH`: origine, session, rate limit, validation Zod, audit.

## Sécurité multi-tenant

Toutes les lectures et écritures filtrent par `organizationId`. Le backend refuse les requêtes dont `organizationId` ne correspond pas au contexte organisation actif de session. Les sources personnelles `KnowledgeDocument` du chatbot standard ne sont pas réutilisées par l'assistant entreprise; l'espace de connaissance entreprise est séparé.

Les sources RAG sont considérées comme contenu non fiable. Les instructions de l'assistant demandent d'ignorer toute instruction contenue dans les documents qui chercherait à contourner les règles, révéler des secrets ou changer de rôle.

## Limites par plan

Les limites sont centralisées dans `lib/billing/plan-limits.ts`:

- Starter: messages mensuels limités, sources et stockage réduits, outils lecture actifs, brouillons d'action désactivés.
- Business: quotas augmentés, outils lecture et brouillons d'action activés.
- Enterprise: quotas élevés, outils lecture et brouillons d'action activés.

## UI

Le module est accessible via `/enterprise-modules/AI_ASSISTANT` lorsqu'il est activé, inclus dans le plan et visible dans la navigation entreprise. Le workspace contient:

- Chat;
- Sources;
- Historique;
- Usage;
- Paramètres.

Les actions de sources passent par un menu `...` et les confirmations destructives utilisent la boîte de dialogue applicative.
