# Hotfix #1097 — MCP hybride Vercel (Time/Brave) + Fly.io (Fetch)

**Date :** 2026-11-09 · **Version candidate :** v1.7.5 · **Issue :** #1097 · **Dépendance opérateur :** #1096

**État :** code candidat. `OWNER_E2E` NON EXÉCUTÉ ; Vercel HTTP live NON CERTIFIÉ ; Fly.io NON PROVISIONNÉ ; aucun service annoncé opérationnel. Ne pas fusionner avant l'E2E propriétaire ni activer les flags sans preuves.

## 1. Architecture et périmètre

| Serveur | Transport | Exécution | Outils exacts |
| --- | --- | --- | --- |
| `PUBLIC_TIME` | Stateless Streamable HTTP, `mcp-handler` v2 | Next.js Node 22 sur Vercel, route privée `/api/internal/mcp/time` | `get_current_time`, `convert_time` |
| `PUBLIC_BRAVE` | Stateless Streamable HTTP, `mcp-handler` v2 | Next.js Node 22 sur Vercel, API Brave officielle | `brave_web_search`, `brave_news_search` |
| `PUBLIC_FETCH` | HTTPS bearer vers `STDIO_BRIDGE` | **Un conteneur** Fly.io, `uvx mcp-server-fetch` | `fetch` |

Le Tool Gateway reste l'autorité unique : 5 définitions READ, contrôles session/plan/permissions/contexte, 10 appels par tour, 10/min par utilisateur, 15 secondes d'attente, journaux `AiMcpAuditEvent`, refus des données `CONFIDENTIAL` et plus sensibles. Le site public ne possède pas ce Gateway. Le schéma comptable, les écritures `POSTED`, les libellés FR/EN et les MCP Gmail/Calendar ne changent pas.

Les trois flags sont indépendants. Aucune disponibilité n'est héritée du flag d'un autre serveur. La Console vérifie réellement la découverte de chaque serveur, rend les outils indisponibles si la sonde échoue, et conserve la suspension individuelle. Une clé ou un flag ne prouvent **jamais** seuls que la connexion fonctionne.

## 2. Variables à renseigner sur Vercel — Production uniquement

Toutes les variables ci-dessous sont **côté serveur**. Les tokens et la clé Brave sont de type **Secret** (jamais `NEXT_PUBLIC_*`).

| Variable | Valeur attendue | Étape |
| --- | --- | --- |
| `MCP_PUBLIC_TIME_TOKEN` | jeton aléatoire ≥ 32 caractères, distinct des autres | Avant tests Time |
| `MCP_PUBLIC_TIME_CERTIFIED` | `false`, puis `true` après rapport Time LIVE | Après certification Time |
| `MCP_PUBLIC_BRAVE_TOKEN` | autre jeton aléatoire ≥ 32 caractères | Avant tests Brave |
| `BRAVE_API_KEY` | clé officielle Brave Search API, depuis le coffre Vercel | Avant tests Brave |
| `MCP_PUBLIC_BRAVE_CERTIFIED` | `false`, puis `true` après rapport Brave LIVE | Après certification Brave |
| `MCP_PUBLIC_BRIDGE_URL` | `https://<app-fly>.fly.dev/v1/tool` ; DNS public et HTTPS valide | Après création Fly |
| `MCP_PUBLIC_BRIDGE_TOKEN` | même secret aléatoire ≥ 32 caractères que sur Fly | Avant tests Fetch |
| `MCP_PUBLIC_FETCH_CERTIFIED` | `false`, puis `true` après rapport Fetch LIVE et pare-feu vérifié | Après certification Fetch |

**Ancien flag :** retirer `MCP_PUBLIC_BRIDGE_CERTIFIED` lorsqu'il existe ; il n'active plus aucun outil. Aucune nouvelle variable d'environnement de base de données ou Prisma n'est nécessaire.

Un serveur n'est exposé au catalogue des assistants que si sa configuration et son flag sont valides. Des routes HTTP sécurisées peuvent être certifiées manuellement avec leurs jetons alors que les flags sont encore à `false`.

## 3. Certification Vercel Time et Brave

1. Livrer le code **depuis `main` uniquement** après CI verte et OWNER_E2E du hotfix ; aucun Preview ni `vercel --prod` de branche.
2. Créer les secrets `MCP_PUBLIC_TIME_TOKEN`, `MCP_PUBLIC_BRAVE_TOKEN`, `BRAVE_API_KEY` dans Vercel Production avant les tests d'exploitation, sans les partager par chat, Issue ou PR.
3. Depuis un poste autorisé disposant des deux jetons d'appel (jamais enregistrés dans Git), exécuter `node scripts/mcp-vercel-http-certify.mjs`. Le script teste réellement `tools/list`, Time Kinshasa, conversion Paris estivale, Brave web et news et produit les durées **mesurées**, sans afficher de secret.
4. Exiger les résultats `LIVE_CERTIFIED` des deux serveurs séparément. Examiner les journaux de refus/quotas, les réponses 401 sans token et la suspension Console.
5. Alors seulement, configurer individuellement les flags certifiés sur Vercel Production ; une nouvelle livraison autorisée depuis `main` doit appliquer ces variables au runtime. Ne pas utiliser de déploiement manuel d'une branche.

Le Time actuel prend `date` optionnel sur la conversion (par défaut le jour courant dans le fuseau source) ; une heure inexistante ou ambiguë au changement d'heure d'été est refusée explicitement. Brave ne connaît que les endpoints HTTPS `web/search` et `news/search`, limite à 10 résultats, coupe les réponses volumineuses, traite tous les snippets comme des données non fiables et ne révèle jamais `BRAVE_API_KEY`.

## 4. Un seul conteneur Fetch sur Fly.io

Fichiers : `deploy/fly-fetch/Dockerfile`, `fly.toml`, `start.sh`, `egress.nft`. Le pont de `scripts/mcp-public-stdio-bridge.mjs` n'autorise désormais **que** `fetch.fetch` et lance uniquement `uvx mcp-server-fetch` ; aucune clé Brave ni commande Time.

1. Depuis un compte Fly.io autorisé, réserver un nom d'application dans `deploy/fly-fetch/fly.toml` (l'exemple `dtsc-mcp-fetch` n'est pas une preuve de réservation), puis provisionner l'application sans DB ni réseau DTSC montés.
2. Stocker `MCP_PUBLIC_BRIDGE_TOKEN` dans les **secrets Fly.io** ; utiliser exactement le même token dans Vercel Production.
3. Construire depuis la racine du dépôt avec `fly deploy -c deploy/fly-fetch/fly.toml` **uniquement après autorisation opérateur**. Garder une unique machine (`fly scale count 1`) et vérifier que `auto_stop_machines="off"`, TLS Fly Proxy et les ressources sont corrects.
4. Le script de démarrage applique obligatoirement `nft -f deploy/fly-fetch/egress.nft` **avant** de démarrer l'utilisateur non privilégié. Si la machine n'autorise pas nftables/NET_ADMIN ou si la politique ne s'applique pas, le conteneur doit **échouer fermé**. Bloquer IPv4 privés/link-local/loopback/CGNAT et IPv6 ULA/link-local, en préservant uniquement DNS résolveur Fly et trafic de réponse déjà établi. **Ne pas déclarer le firewall certifié sans inspection réelle des règles et tests d'egress**. Vérifier aussi les redirects/DNS rebinding. Les contrôles applicatifs SSRF restent nécessaires mais insuffisants seuls.
5. Exécuter `MCP_PUBLIC_BRIDGE_URL=https://<app-fly>.fly.dev/v1/tool node scripts/mcp-public-stdio-certify.mjs` avec le token dans l'environnement secret du poste d'exploitation. Exiger : découverte `fetch`, `https://example.com/` et refus réels `localhost` et `169.254.169.254`.
6. Quand le résultat est `LIVE_CERTIFIED` et l'egress firewall prouvé, renseigner `MCP_PUBLIC_FETCH_CERTIFIED=true` uniquement pour Production, puis appliquer selon la politique Git `main`.

Fly Proxy gère le TLS HTTPS public ; la route interne de la machine écoute le port 8686. Le serveur refuse sans token, n'accepte qu'un corps borné et journalise des métadonnées non sensibles (pas les URL ou contenus).

## 5. Recette propriétaire et preuves opposables

- E01 : Time disponible sans Brave ni Fetch ; Kinshasa et conversions été/hiver exactes, refus DST ambigu/inexistant.
- E02 : Brave web/news authentifié, sources réelles, pas d'image/vidéo, refus sans clé/jeton, erreur 429 expliquée sans secret.
- E03 : Fetch seul sur Fly, page publique lisible, rejet localhost/métadonnées, DNS/redirect privés et pare-feu egress.
- E04 : Console IA distingue `CERTIFIED`, `DISABLED`, `UNAVAILABLE` et `SUSPENDED` par serveur et outil ; pas de réussite fictive.
- E05 : `DTSC_GENERAL`, `ENTERPRISE_GENERAL` et un assistant sectoriel hériteront des outils READ certifiés selon leurs permissions, quotas et contexte ; assistant du site public exclu.
- E06 : 10 appels/tour, 10/min, deadline, audit sans donnée métier/secrets, refus de sortie de données sensibles.
- E07 : `pnpm qa:hotfix-1094`, `pnpm qa:hotfix-1097`, `pnpm qa:regression`, type-check, build, migrations et Quality CI obligatoires.
- E08 : OWNER_E2E `BON` **à confirmer personnellement**, puis PR/review/merge `main` ; la certification live Fly/Brave reste une preuve distincte, pas une conséquence automatique de l'E2E applicatif.

## 6. Échec, rollback et dette

- **Échec d'un seul MCP :** remettre uniquement son flag `MCP_PUBLIC_*_CERTIFIED=false`, ou suspendre son serveur dans Console ; les autres ne sont pas désactivés.
- **Échec HTTP Vercel :** endpoints bloqués par bearer, repli fail-closed. Ne jamais restaurer le runner Brave/Time sans nouvelle PR auditée.
- **Échec Fly :** garder Fetch désactivé, inspecter sortie/pare-feu/secret/uptime ; l'application financière DTSC et les deux autres MCP ne sont pas affectés.
- **Retour applicatif :** PR de revert traçable vers dernier SHA sain ; pas de `git reset` ni migration destructrice.
- **Dette maintenue :** AI07/Streamable HTTP historique inchangé. **Dette reportée :** provisioning réel, secrets Fly/Vercel, tests live et deux vraies sessions assistants dans #1096 ; ne pas fermer cette issue avant certification effective.

**QA locale automatisée ≠ certification réseau réelle.** Ce document décrit le contrat à tester, pas une certification déjà obtenue.
