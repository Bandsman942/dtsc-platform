# Hotfix #1102 — Console Time/Brave UNAVAILABLE et chat standard sans outils

**Date :** 2026-11-10 · **Version candidate :** v1.8.1 · **Issue :** #1102 · **Branche :** `fix/1102-mcp-vercel-inprocess-chat-gateway`.

**Statut :** code en PR, `OWNER_E2E` non exécuté, Production non modifiée tant que l'utilisateur n'a pas validé. Aucun succès LIVE de ce hotfix ne peut être inféré d'une build CI.

## Incident et preuves

La Console IA (section Connecteurs) affichait `PUBLIC_TIME / PUBLIC_BRAVE = UNAVAILABLE`, `Certifié : non`, `Configuration : disponible`, `Outils actifs : 0`, alors que Vercel Production disposait de `MCP_PUBLIC_TIME_CERTIFIED=true` et `MCP_PUBLIC_BRAVE_CERTIFIED=true` (tokens/clé sensibles présents, valeurs non consultées).

Le dialogue chat général `/api/chat/v2` répondait qu'il ne pouvait pas connaître l'heure réelle de Kinshasa : cette route utilisait un flux de génération textuelle **sans passage au Tool Gateway** ; les outils étaient disponibles seulement dans la boucle Agent.

La Console interrogeait les MCP hébergés sur **la même application** en sortant vers `https://app.dtsc-platform.com/api/internal/mcp/time|brave` ; des appels de diagnostic externes rencontraient `429 Vercel Security Checkpoint`. Une protection Edge ou un effet réseau self-call peut donc empêcher `tools/list` de passer. Ce signal ne démontre pas qu'un client interne authentifié a échoué : nous remédions cependant à cette dépendance superflue.

## Architecture corrigée (candidate)

- **MCP Time / Brave :** deux serveurs `mcp-handler` v2 véritables et stateless, dans `lib/ai/mcp/public-knowledge-time-handler.ts` et `...brave-handler.ts`. Les routes HTTPS d'origine réexportent exactement ces handlers ; toujours bearer privé `MCP_PUBLIC_TIME_TOKEN` ou `MCP_PUBLIC_BRAVE_TOKEN`.
- **Transport MCP côté serveur :** `callMcpJsonRpc` conserve la même enveloppe JSON-RPC, les validations de résolution/URL, le secret, le timeout, la taille maximale et le parsing réel JSON/SSE. Pour les **deux codes exacts** `PUBLIC_TIME` et `PUBLIC_BRAVE` avec URL, transport, host et `authEnvKey` *canoniques*, il dispatch directement un vrai `Request` au handler protégé, sans réentrée sur le firewall public Vercel. Les endpoints tiers (OAuth Gmail/Calendar, Fly Fetch) continuent leur HTTPS externe. Aucune capacité d'exécuter des URLs arbitraires dans le processus.
- **Console :** `probePublicMcpServers` garde la découverte effective via `tools/list` avec vérification des 2 noms d'outil attendus par serveur ; **le flag `CERTIFIED` seul ne suffit toujours pas**. `CERTIFIED` décrit la disponibilité MCP *depuis les fonctions DTSC*, pas une attestation de joignabilité depuis un client externe ni la réussite de toutes les requêtes Brave payantes.
- **Chat général standard :** reconnaissance étroite des questions explicites sur heure/date actuelle (Kinshasa, Lubumbashi, Paris, Londres, Tokyo, New York, UTC) et des recherches Web/actualités. Utilise `executeAiTool` authentifié, permissions, classification et quota, puis renvoie une heure formatée ou jusqu'à 5 sources Brave, sans inventer. En cas de refus/panne, message explicite sans faux chiffre. Les autres questions gardent le flux LLM existant. Les contenus Brave ne sont jamais exécutés comme instructions.
- **Modes Agent et IA Entreprise / profils sectoriels :** continuent à utiliser `callMcpJsonRpc` et les cinq définitions dans `PUBLIC_MCP_TOOL_SPECS` ; seuls les services autorisés / non sensibles sont exposés. Règles du rôle, du plan, des données et du budget intactes.
- **Fetch :** `MCP_PUBLIC_FETCH_CERTIFIED=false` reste requis jusqu'à déploiement Fly et certification dédiée ; le transport local ne le concerne pas.

## Configuration Vercel

Aucune variable supplémentaire ni rotation de clé n'est imposée par le correctif. Il faut toujours vérifier, côté Production et sans copier de secret, que :
- `MCP_PUBLIC_TIME_CERTIFIED=true` et `MCP_PUBLIC_TIME_TOKEN` ≥ 32 caractères, enregistré côté serveur ;
- `MCP_PUBLIC_BRAVE_CERTIFIED=true`, `MCP_PUBLIC_BRAVE_TOKEN` ≥ 32 caractères et une `BRAVE_API_KEY` réellement valide ;
- aucun préfixe `NEXT_PUBLIC_` sur ces clés ;
- le dernier SHA `main` est bien le SHA `READY` Production. Ne jamais déployer la branche feature.

Les flags sont des **déclarations d'exploitation**, pas des preuves de bonne réponse Brave ni de la recette multi-assistants. Sur `UNAVAILABLE` persistant, vérifier également `AiMcpControlState.suspended`, la résolution DNS et les contrôles SDK sous le même runtime.

## Preuves requises pour E2E propriétaire

1. Vérifier les deux cartes Time et Brave dans la Console : `CERTIFIED`, `Configuration Disponible`, `2 outils actifs` par serveur et `reachable = true` ; l'étiquette `Fetch` doit rester `DISABLED`.
2. Dans **la conversation standard** (`/api/chat/v2`) demander « Quelles date et heure est-il maintenant à Kinshasa ? » puis « Cherche sur le Web la documentation Model Context Protocol » et « Quelles sont les dernières actualités sur la sécurité de Next.js ? ». Vérifier heure réelle, liens Brave, absence d'hallucination et `X-AI-Execution: CANONICAL_TOOL`.
3. En **mode Agent** : `time.get_current_time`, `time.convert_time` (Kinshasa→Paris à date fixe), `brave.search_web`, `brave.search_news`. Répéter depuis `ENTERPRISE_GENERAL` puis un profil sectoriel disponible (ex. SHOP), uniquement sur données PUBLIC.
4. Vérifier des événements authentifiés `AiMcpAuditEvent` de type `TOOL_CALL`, statut `SUCCESS` et `assistantCode` distincts ; vérifier les limites 10 appels/tour et 10/minute sans épuisement volontaire de l'API Brave.
5. Vérifier les refus : appel HTTP sans bearer `401` lorsqu'il atteint bien l'application, Brave API invalide/429 traitée proprement, classifications `CONFIDENTIAL`, `HEALTH_SENSITIVE`, `SECRET` refusées, suspension Console immédiate et aucun secret dans les traces.
6. Vérifier les profils non concernés : chatbot marketing sans outils, Gmail/Calendar inchangés, Fetch toujours désactivé.

**Tests automatiques :** `pnpm qa:hotfix-1094`, `pnpm qa:hotfix-1097`, `pnpm qa:hotfix-1102`, `pnpm qa:regression`, `pnpm type-check`, `pnpm lint`, `pnpm build`, migration CI. CI valide le code mais **ne certifie pas l'API Brave en direct ni l'usage par chaque assistant** sans recette réelle.

## Gouvernance et reprise

- Contrat de livraison : code feature → PR → CI → validation écrite `E2E final #<PR> BON` → squash `main` → déploiement automatique Vercel Production → `READY`/Release versionnée.
- Rollback : revert de la PR via GitHub (aucune migration DB, aucun secret ajouté). La suspension individualisée des serveurs dans la Console reste disponible.
- Le `429 Vercel Security Checkpoint` externe peut encore affecter un client public qui tente le endpoint HTTP. Ce hotfix **n'affaiblit pas le WAF global** et garantit la voie interne uniquement ; une certification HTTP externe est séparée et doit être faite depuis un client/chemin autorisé sans divulguer les jetons.
- Les travaux du runner Fly restent suivis par #1096, distinctement.

## Matrice de vérification

| Contrôle | Statut initial |
|---|---|
| Variables Production | Vérifiées déclarées, sans déchiffrer les secrets |
| Production v1.8.0 | READY, mais Console Time/Brave UNAVAILABLE selon capture |
| Appel sans bearer depuis diagnostic externe | 429 Edge observé (non équivalent à 401 applicatif) |
| Appels MCP réels par assistant dans Neon | Aucune preuve récente au diagnostic initial |
| CI v1.8.1 | À exécuter |
| E2E Time/Brave multi-assistants | **NOT_EXECUTED** |
| Fusion / Production v1.8.1 | **NOT_EXECUTED** |
