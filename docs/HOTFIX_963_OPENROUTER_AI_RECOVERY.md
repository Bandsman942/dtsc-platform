# Hotfix P0 #963 — OpenRouter : disponibilité, fallback et catalogue ZDR

Statut : **branche de pré-release, non déployée** (30 octobre 2026). Source : Issue #963.

## Constat établi

La capture utilisateur du Chatbot DTSC montre « Le modèle IA sélectionné n'est pas disponible dans ce contexte » lors d'envois simples (« Bonjour ! »). Les tentatives Production du 30 octobre ont montré des HTTP 404 sur `google/gemini-2.5-flash`, puis des réponses `MODEL_UNAVAILABLE`/503 lorsque les tentatives récentes ont classé les modèles comme indisponibles. Le fallback OpenAI `gpt-5-nano` a notamment produit `invalid_function_parameters` lors d'appels d'outils : ce sont deux problèmes distincts. L'erreur `P2002` observée sur l'initialisation des réglages IA Entreprise est un troisième problème concurrent.

Vérification publique du 30 octobre : OpenRouter annonce `google/gemini-2.5-flash` dans `/api/v1/models`, **mais plus dans** `/api/v1/models?zdr=true`. DTSC requiert explicitement `provider.zdr=true` et `data_collection=deny`. Un solde OpenRouter positif n'annule ni l'absence d'un fournisseur ZDR pour ce modèle, ni la contrainte de confidentialité.

## Corrections

1. L'identifiant `google/gemini-2.5-flash` est écarté de toute certification OpenRouter historisée, sans relâchement de ZDR ou autorisation implicite de données sensibles.
2. `config/ai/openrouter-certified-models-20261030.json` prépare **7 candidats**, répartis entre Anthropic, OpenAI, DeepSeek, Qwen et Google. Ils possèdent des profils, des tiers STARTER/BUSINESS/ENTERPRISE, des plafonds de coût, un contexte et des fallbacks explicitement décrits. Les capacités multimodales ne sont pas promues avant certification de l'adaptateur ; la politique de confidentialité externe reste héritée du fournisseur OpenRouter contrôlé.
3. La santé des modèles s'évalue séparément par contexte et par tâche. Une erreur `invalid_function_parameters` ou d'outil DTSC n'entraîne plus la mise hors service globale d'un modèle pour un simple échange. Les succès à `reasonCode=null` restent comptés. Les erreurs d'amont journalisent uniquement un statut HTTP et des identifiants non sensibles.
4. OpenAI Responses transmet les fonctions optionnelles en mode `strict:false` ; le registre Zod, le contrôle des permissions et la confirmation des mutations sur le serveur ne changent pas.
5. La sélection côté UI, la sauvegarde des préférences et les routes Chatbot/Entreprise respectent contexte, plan et désactivations administrateur. Une préférence historique retirée ne doit pas immobiliser une ancienne conversation : sélection automatique sûre en l'absence de choix explicite. La provision initiale des réglages IA entreprise devient idempotente.

## Catalogue des nouveaux candidats

| Identifiant OpenRouter | Modèle DTSC | Accès minimal |
| --- | --- | --- |
| `anthropic/claude-haiku-5.5` | `openrouter-claude-haiku-5-5` | STARTER |
| `openai/gpt-6-luna` | `openrouter-gpt-6-luna` | STARTER |
| `deepseek/deepseek-v4.1-flash` | `openrouter-deepseek-v4-1-flash` | STARTER |
| `qwen/qwen3.8-27b` | `openrouter-qwen3-8-27b` | BUSINESS |
| `google/gemini-3.5-flash-lite` | `openrouter-gemini-3-5-flash-lite` | STARTER |
| `google/gemini-3.8-flash` | `openrouter-gemini-3-8-flash` | BUSINESS |
| `anthropic/claude-sonnet-5.5` | `openrouter-claude-sonnet-5-5` | ENTERPRISE |

Les identifiants, tarifs de catalogue et capacités sont des données fournisseur **instantanées** au 30/10/2026, à revalider avant activation. La présence dans la liste ZDR publique ne prouve pas qu'une requête privée authentifiée, y compris l'outil/streaming, réussira : **aucun test facturable avec la clé DTSC n'est revendiqué**.

## QA et E2E propriétaire — publication interdite avant validation

1. Vérifier le SHA de la branche et les gates : `node scripts/qa-hotfix-963-ai-reliability.mjs`, `node scripts/ai/audit-openrouter-catalog.mjs --catalog-file config/ai/openrouter-certified-models-20261030.json` avec `AI_OPENROUTER_CATALOG_AUDIT_STRICT=true`, puis typecheck, lint, `qa:regression`, build, et CI standard. L'audit distant est en lecture seule ; toute panne réseau en mode strict est un **FAIL**, pas une réussite.
2. Sur une configuration de test avec `AI_OPENROUTER_CERTIFIED_MODELS_JSON` défini à partir du fichier ci-dessus et des secrets existants, ouvrir le Chatbot, choisir chacun des 7 modèles autorisés pour le plan test, envoyer « Bonjour ! » puis une tâche autorisée avec outil en lecture. Vérifier réponse en streaming, données d'usage et code fournisseur.
3. Sélectionner un modèle ancien révoqué dans une conversation préexistante. Vérifier que « Auto » reprend la conversation, sans 404, et qu'une sélection **explicite** non autorisée reste refusée (pas de contournement).
4. Simuler un modèle indisponible et observer le fallback DTSC vers un **autre modèle autorisé et certifié**, avec `X-AI-Fallback`/télémétrie de tentative. Vérifier les erreurs amont normalisées ; ne jamais forcer `zdr:false`.
5. Tester simultanément Chatbot personnel et IA Entreprise pour confirmer l'isolement des plans, des droits, de la classification et de la santé par contexte/tâche. Dans IA Entreprise, enregistrer une préférence admise par le plan, refuser une préférence supérieure et créer les réglages à l'aide de deux requêtes concurrentes, sans `P2002`.
6. Désactiver un modèle et son provider via la console DTSC : ils disparaissent du sélecteur et ne sont plus routables ; réactiver de façon autorisée. Contrôler refus `SECRET`, cross-tenant, outils en écriture sans confirmation, limite de quotas et terminal mobile Android/iOS.
7. Après validation du propriétaire, noter **`E2E #963 BON`** avec SHA, contexte, modèle, traces expurgées, tests passés. Cette preuve ne peut pas être déduite d'une QA structurelle.

## Activation contrôlée et rollback

- Les nouveaux modèles **ne sont pas chargés automatiquement depuis le fichier versionné**. L'unique allowlist à l'exécution demeure la variable `AI_OPENROUTER_CERTIFIED_MODELS_JSON`, gérée côté serveur pour Vercel Production. Après CI et OWNER_E2E, fusionner sur `main` seulement selon la gouvernance, puis mettre à jour cette variable (JSON intégral du manifest ou sous-ensemble validé) avec le mécanisme d'environnement/déploiement Production approuvé. Ne jamais recopier de clé OpenRouter dans le dépôt ou dans la PR.
- Vérifier que `OPENROUTER_API_KEY` est configurée ; ne jamais exposer son contenu. Le solde et les quotas OpenRouter se vérifient dans le compte fournisseur, sans données de paiement ni secret dans les logs.
- Déploiement Vercel : **Production depuis `main` uniquement**, sans Preview ni `vercel --prod` manuel. Vérifier une requête simple et les logs après déploiement, puis seulement élargir le catalogue.
- Retour arrière : remettre la dernière allowlist certifiée comprenant uniquement des modèles encore ZDR, ou retirer les entrées nouvellement activées en conservant le retrait de `google/gemini-2.5-flash`; rétablir l'ancien déploiement `main` si régression applicative. Aucune migration Prisma ni réparation de données nécessaire.

## Non inclus

Pas de désactivation globale de confidentialité, pas de changement de modèle de facturation ou de plan, pas de recharge de crédit, pas de nouvelle table Prisma, pas de nouveau fournisseur direct, pas de déploiement avant certification du propriétaire.
