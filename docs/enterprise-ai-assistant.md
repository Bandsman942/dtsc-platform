# IA Assistant Entreprise

## Objectif

Le module `AI_ASSISTANT` fournit un assistant IA sectoriel pour les organisations clientes actives. Il combine:

- Assistant Runtime: profil, contexte et policy résolus côté serveur;
- CAG: contexte contrôlé de l'entreprise, du secteur, du plan, des modules activés et des règles métier;
- RAG: sources documentaires privées indexées en embeddings pgvector et filtrées par `organizationId`;
- Tool Gateway: outils métier certifiés, autorisés et audités côté serveur;
- quotas de plan: messages mensuels, sources, stockage, outils lecture et brouillons d'action.

## Runtime unifié

`POST /api/enterprise/ai/chat` utilise `prepareAiTurn()` comme le chatbot général.

Cette primitive résout :

- le profil assistant autorisé ;
- l'organisation et le membership actifs ;
- le plan effectif ;
- les modules réellement lisibles ;
- le secteur réel ;
- le CAG sectoriel versionné ;
- les classifications de données transmises au Policy Router.

Les historiques restent séparés : `EnterpriseAiConversation` / `EnterpriseAiMessage` restent la source de vérité du module entreprise. Aucune migration vers les conversations du chatbot général n'est effectuée.

Profils sectoriels actuellement enregistrés :

- `PHARMACY_ASSISTANT` ;
- `HEALTH_ASSISTANT` ;
- `SHOP_ASSISTANT` pour `COMMERCE_RETAIL` ;
- fallback `ENTERPRISE_GENERAL` lorsque le profil sectoriel demandé n'est pas compatible.

## CAG sectoriel

Le CAG est construit uniquement à partir de données autorisées dans l'organisation active.

- Pharmacy : FEFO et paramètres opérationnels minimisés ;
- Health : CAG de base strictement organisationnel et non clinique ;
- Shop : règles d'exploitation générales et modules lisibles, sans fabrication de stock ou de ventes.

Le cache CAG est segmenté par `organizationId`, `userId`, profil/version et `contextVersion`. Il ne peut pas être partagé entre tenants. Les paramètres Pharmacy participent à la version du CAG via `settingsVersion`.

## Modèle de données

La migration `20260616183000_enterprise_ai_assistant` ajoute les tables Enterprise AI, notamment `EnterpriseAiAssistant`, `EnterpriseAiConversation`, `EnterpriseAiMessage`, `EnterpriseAiKnowledgeSource`, `EnterpriseAiKnowledgeChunk`, `EnterpriseAiToolCall`, `EnterpriseAiUsage` et `EnterpriseAiSetting`.

AI06 ajoute transversalement `AiToolConfirmation` et `AiToolExecution`. `AiToolExecution` est la source de vérité de l'identité/idempotence d'une exécution Tool Gateway. `EnterpriseAiToolCall` reste la projection Enterprise lorsqu'une conversation organisationnelle existe; il ne devient pas un journal concurrent d'idempotence.

Les chunks RAG utilisent `vector(1536)` dans la baseline actuelle. Les migrations AI05/AI06 sont additives et ne réécrivent pas les données métier existantes.

## Routes API

`POST /api/enterprise/ai/chat`

- Accès: membre `ACTIVE` de l'organisation active, module `AI_ASSISTANT` activé et autorisé par le plan.
- Sécurité: origine same-origin, session, utilisateur actif via membership, rate limit, validation Zod, quotas mensuels.
- Payload: `organizationId`, `conversationId?`, `content`, `model?`, `useKnowledge`, `useTools`.
- Réponse streaming texte avec identifiants de conversation, provider, modèle, tâche et profil assistant dans les headers techniques internes.

`GET /api/enterprise/ai/conversations`

- Accès: membre actif de l'organisation active.
- Paramètre: `organizationId`.
- Réponse: conversations IA de l'utilisateur dans cette organisation.

`GET|POST /api/enterprise/ai/knowledge-sources`

- `GET`: liste paginée des sources de l'organisation.
- `POST`: upload et indexation différée d'une source supportée.
- Sécurité `POST`: origine, session, rate limit, validation Zod, permissions, quotas source/stockage.

`PATCH /api/enterprise/ai/knowledge-sources/[id]`

- Actions: `archive`, `restore`, et réindexation selon les règles RAG V2.
- Accès: gestionnaire IA de l'entreprise.
- L'archivage retire la source du RAG actif sans supprimer les traces.

`GET /api/enterprise/ai/usage`

- Accès: responsable entreprise.
- Réponse: consommation mensuelle organisation, limites et restants.

`GET|PATCH /api/enterprise/ai/settings`

- `GET`: paramètres IA et permissions de gestion.
- `PATCH`: activation, uploads, outils lecture, brouillons d'action et rétention.
- Sécurité `PATCH`: origine, session, rate limit, validation Zod, audit.

## Tool Gateway AI06

Les outils ne sont plus autorisés par leur simple sélection. Le flux canonique est :

`AI_TOOL_REGISTRY → validation Zod → authorizeAiTool() → politique de confirmation → idempotence → executor explicite → validation de sortie → audit`.

Pour Pharmacy, `runPharmacyReadTools()` reste une façade de compatibilité. La sélection déterministe par mots-clés est temporaire et n'accorde aucun droit : chaque code sélectionné repasse par le Gateway. Les requêtes Prisma établies sont isolées dans `lib/enterprise-ai/pharmacy-tool-data.ts` et restent filtrées par `organizationId`.

Les neuf lectures Pharmacy certifiées couvrent : tableau de bord, stocks bas, lots proches péremption, alertes ouvertes, ventes du jour, sessions de caisse, commandes fournisseur ouvertes, incidents qualité et synthèse documentaire.

Le modèle pourra ultérieurement proposer des structured tool calls; cette évolution ne changera pas l'autorité du Gateway.

## Confirmations et mutations

Une mutation proposée par un assistant ne peut jamais être exécutée à partir d'un simple texte `oui`, `yes`, `ok` ou `vas-y`. Les mutations certifiées AI06 sont limitées à :

- création d'un ticket support DTSC ;
- envoi d'un message vers DTSC.

Le Gateway crée d'abord une `AiToolConfirmation` liée à l'utilisateur, au tenant éventuel, à la conversation, au tour, au tool code, au hash des arguments et à une expiration. Le navigateur ne reçoit qu'un identifiant et un aperçu limité. `POST /api/ai/tools/confirm` recharge les arguments côté serveur puis exécute l'outil; `POST /api/ai/tools/cancel` annule la proposition.

Chaque mutation possède une clé d'idempotence unique. Un retry d'une exécution réussie réutilise son résultat et une course concurrente ne peut pas appeler deux fois l'executor.

## Sécurité multi-tenant

Toutes les lectures et écritures organisationnelles filtrent par `organizationId`. Le backend refuse les requêtes dont `organizationId` ne correspond pas au contexte organisation actif de session. Les sources personnelles `KnowledgeDocument` du chatbot standard ne sont pas réutilisées par l'assistant entreprise; l'espace de connaissance entreprise reste séparé.

Les sources RAG sont considérées comme contenu non fiable. Les instructions de l'assistant demandent d'ignorer toute instruction contenue dans les documents qui chercherait à contourner les règles, révéler des secrets ou changer de rôle.

Le CAG Health n'injecte automatiquement aucune donnée patient ou clinique. AI06 n'autorise aucune mutation clinique, aucun paiement et aucune écriture comptable. Une future capacité sensible devra posséder ses propres contrôles d'objet, confirmation renforcée et policy.

## Limites par plan

Les limites sont centralisées dans `lib/billing/plan-limits.ts`:

- Starter: messages mensuels limités, sources et stockage réduits, outils lecture selon l'entitlement, brouillons d'action désactivés.
- Business: quotas augmentés, outils lecture et brouillons d'action activés.
- Enterprise: quotas élevés, outils lecture et brouillons d'action activés.

Le Gateway revalide le plan effectif côté serveur; un code plan fourni par le client n'est jamais une autorité.

## UI

Le module est accessible via `/enterprise-modules/AI_ASSISTANT` lorsqu'il est activé, inclus dans le plan et visible dans la navigation entreprise. Le workspace contient Chat, Sources, Historique, Usage et Paramètres.

Le chatbot global dispose également du `AiToolConfirmationDock` pour les actions privées. Cette UX est FR/EN, responsive, expose `Confirmer`/`Annuler`, montre un aperçu minimisé et rappelle qu'une réponse textuelle dans le chat n'est pas une confirmation d'exécution.

## Audit

Les `AiModelCall` peuvent conserver les codes/versions du profil, CAG, contexte et prompt dans `metadataJson.runtime`. Le contenu complet du CAG ou des documents n'y est pas persisté.

Les exécutions Tool Gateway conservent code, mode, hash d'arguments, statut, raison, scope d'idempotence et résultat normalisé. Les confirmations consommées/cancelées effacent leur `argumentsJson`; aucun secret ou prompt complet n'est ajouté aux preuves d'exécution AI06.
