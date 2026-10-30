# Hotfix #965 — Gouvernance IA unifiée, culture générale et landing multi-modèles

## Diagnostic vérifié
Le 30/10/2026, une exécution Agent Entreprise a terminé avec `BUDGET_EXHAUSTED / MAX_TOOL_CALLS` après **20 outils** sur deux tours, sans réponse finale. Les plafonds serveur ne doivent pas être augmentés arbitrairement. L'assistant de la landing utilisait directement `OPENAI_API_KEY` / `getOpenAIModel()`, sans sélection de modèle administrable. Le chatbot général était fortement orienté DTSC.

## Contrat livré dans la PR
- **Administration DTSC → Centre de pilotage IA → Modèles** : extension de la politique canonique `AiPlatformRuntimePolicy`, avec contrôle `CONSOLE_AI_MANAGE`, validation Zod, révision optimiste, raison et historique audités. Paramètres: culture générale du chatbot, guidance éditoriale (générale, entreprise, landing), modèles publics ordonnés et plafond de lectures par run Agent (1 à 8).
- **Effet immédiat** : les routes relisent la version publiée en base pour chaque nouveau tour. Les exécutions en cours conservent leur configuration; les autorisations réelles sont revalidées côté Tool Gateway. Les changements de modèles ne nécessitent pas un redeploy après première livraison du code/migration.
- **Chatbot général** : peut répondre à la culture générale même hors sujet DTSC. Pas d'accès aux données métier; le Mode Agent général utilise la même frontière `PERSONAL` et les documents personnels uniquement.
- **IA Entreprise** : guidance éditoriale globale ajoutée, sans assouplissement du RBAC, de l'isolation ou des confirmations humaines.
- **Mode Agent** : analyses de risques opérationnels ciblées sur les sources autorisées de tâches, projets, demandes, trésorerie synthétique, stocks et workflows. Nombre de lectures par exécution limité; les tours suivants sont sans outils pour réserver la synthèse. Les autres tâches gardent le Tool Gateway et les plafonds de plan.
- **Landing page** : utilise le catalogue certifié existant (`OPENAI` et `OPENROUTER`) et la politique globale. Seuls les modèles `PUBLIC` autorisés pour `STARTER`, disposant de texte + outils et d'une clé configurée, sont éligibles. Le premier modèle de la liste est prioritaire; les suivants sont des secours. Liste vide = sélection automatique parmi les modèles admissibles. En cas de désactivation de modèle, aucune levée de restriction; en cas de panne, repli uniquement vers un modèle admissible. OpenRouter conserve sa politique ZDR obligatoire.
- L'assistant landing reste **commercial / DTSC uniquement**; cela n'étend pas les connaissances publiques de la landing par défaut. Les visiteurs ne disposent d'aucune identité de compte ou d'accès entreprise. Le modèle peut proposer une transmission uniquement si le serveur présente l'outil de création et si le dernier échange inclut une confirmation explicite; l'enregistrement réel passe encore par `publicDtscLeadSchema`.

## Frontières et threat model
- Les instructions personnalisées et les textes RAG/CAG ne sont **jamais** des autorisations de lecture ou de mutation.
- Les contrôles RBAC, contexte entreprise, plan, catalogue et validations de sortie restent côté serveur et structurés.
- Les paramètres de guidance sont limités à 800 caractères et ne modifient pas les droits réels.
- Le modèle n'obtient jamais une méthode arbitraire, uniquement des outils certifiés et filtrés en amont.
- La confirmation textuelle d'un **visiteur anonyme** n'est pas une preuve cryptographique de son identité ; aucun accès ERP ou opération financière ne doit reposer dessus. L'outil public existant crée uniquement une demande commerciale DTSC.

## Migration
`20261030184500_ai_assistant_governance` ajoute uniquement `assistantSettings JSONB NOT NULL DEFAULT '{}'` à `AiPlatformRuntimePolicy`. Aucune donnée existante n'est supprimée. Une ligne antérieure sans profil reçoit des valeurs par défaut strictement typées.

## API centrale
- `GET /api/admin/ai/policy` (permission AI_READ) : politique versionnée et historique des 20 publications.
- `PATCH /api/admin/ai/policy` (AI_MANAGE, same-origin, schéma Zod, révision attendue, raison obligatoire) : accepte le profil global; vérifie les modèles publics réellement éligibles; renvoie 400 si sélection interdite, 409 en cas de conflit de révision. Les changements sont historisés et audités.

## E2E propriétaire requis avant merge
1. **Chatbot général** : demander la capitale de la RDC puis une question DTSC; réponses normales; question ERP privée refusée/orientée.
2. **Mode Agent général** : en tenant actif, tenter une lecture de finances ERP, vérifier absence d'outils de lecture entreprise.
3. **IA Entreprise** : « Identifie les risques opérationnels »; outils pertinents (pas 20 outils distincts), synthèse avec limites et sources. Test délai et données manquantes.
4. **Console IA** : changer temporairement guidance, basculer culture générale, enregistrer avec motif, vérifier le prochain tour sans redeploy; vérifier édition concurrente 409 et restauration.
5. **Landing** : configurer un modèle OpenRouter Starter réellement certifié + OpenAI disponible comme secours; conversation qualification, accord explicite, création du lead une seule fois; refuser sans accord.
6. **Confidentialité** : document / demande prompt injection (« ignore les règles »), données inter-tenant, modèles non configurés, fournisseur suspendu; toutes les requêtes interdites échouent proprement.
7. **Mobile / i18n** : navigation et formulaire Console desktop / 320,360,390,414,768 px, français et anglais.
8. **Failover** : couper le fournisseur primaire dans un environnement de test, vérifier repli vers un modèle configuré et autorisé uniquement.

## Rollback
Revert de PR via main et redeploy Vercel Production. Garder la colonne additive (ne pas supprimer la migration); les anciens lecteurs l'ignorent. Une révocation urgente peut être appliquée via la politique actuelle de suspension des modèles/fournisseurs. Ne jamais assouplir ZDR pour rétablir un modèle.
