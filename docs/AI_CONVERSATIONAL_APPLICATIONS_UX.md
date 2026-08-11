# IA conversationnelle DTSC — langage métier, applications connectées et copilote de rédaction

## Objectif

Cette évolution corrige quatre problèmes produit transversaux :

1. les assistants ne doivent jamais exposer aux utilisateurs normaux des identifiants techniques qui ne sont pas visibles dans l’interface ;
2. l’Assistant entreprise doit restituer les noms de modules tels qu’ils apparaissent réellement dans l’UX et utiliser le rendu enrichi existant ;
3. les applications MCP doivent être présentées comme des applications métier compréhensibles, avec un état réel et une autorisation personnelle sécurisée lorsqu’elles sont certifiées ;
4. l’IA DTSC doit aider à rédiger et agir dans les interfaces conversationnelles sans contourner la sécurité ni envoyer un message à l’insu de l’utilisateur.

## Contrat de langage utilisateur

`lib/ai/prompts.ts` porte un contrat commun de présentation utilisateur appliqué par les routes qui réutilisent `buildLanguageInstruction()`.

Sont interdits dans une réponse métier normale :

- codes internes de modules ;
- noms de modules contenant des underscores ;
- enums bruts ;
- clés camelCase ;
- noms de champs de base de données ;
- variables d’environnement ;
- noms bruts d’outils et de fournisseurs ;
- payloads MCP ;
- routes techniques ;
- flags d’implémentation ;
- secrets, tokens, logs protégés ou configuration cachée.

L’assistant doit convertir un fait interne en **libellé visible + effet métier**. Exemple :

- interdit : `blockExpiredBatchSale: true` ;
- attendu : `Les lots expirés ne peuvent pas être vendus.`

La règle ne bloque pas un diagnostic technique demandé explicitement par un utilisateur autorisé ; elle empêche les fuites de détails d’implémentation dans une conversation métier normale.

### Hotfix Assistant entreprise — noms de modules et rendu enrichi

Une transcription réelle de l’Assistant entreprise a montré une fuite de codes comme `FINANCE_ACCOUNTING`, `FINANCE_CASH`, `FINANCE_PAYABLES` et `FINANCE_RECEIVABLES` dans une réponse destinée à un utilisateur métier.

Le correctif impose deux couches complémentaires :

1. le contrat global interdit explicitement tout nom de module affiché avec des underscores ;
2. `lib/enterprise-ai/context.ts` injecte dans le contexte interne le vocabulaire bilingue généré depuis le registre canonique `lib/enterprise/module-registry.ts` (`labelFr` / `labelEn`).

Le modèle peut utiliser le code interne pour raisonner, mais doit restituer uniquement le nom que l’utilisateur voit dans l’UX. Aucun second dictionnaire de noms de modules n’est maintenu côté IA.

Le rendu des réponses entreprise réutilise le renderer streaming Markdown existant (`Streamdown`) et le style partagé `dtsc-assistant-markdown`. Les consignes de sortie demandent, lorsque pertinent : titres courts, paragraphes brefs, listes, étapes numérotées, **gras**, *italique*, citations, séparateurs, tableaux comparatifs et liens Markdown lorsque l’URL est réellement disponible. Le HTML brut n’est pas demandé.

## Mode Agent dans le bouton flottant commun

Dans **Chatbot** et **Assistant IA entreprise**, le mode Agent ne possède plus un second bouton flottant indépendant. `AiAgentRunDock` s’enregistre dans le hub partagé via `useFloatingAction`.

Ordre des actions :

1. **Mode agent** — ordre `5` ;
2. **Boîte à outils professionnelle** — ordre `10`.

Le changement est uniquement UX. Les endpoints Agent, budgets, étapes persistées, annulation, reprise, Tool Gateway et confirmations humaines restent inchangés.

## Centre Applications connectées

Route UI : `/ai/apps`

Le catalogue initial présente Gmail, Google Calendar, Notion, GitHub, Linear, Jira & Confluence et Stripe. La disponibilité est calculée depuis le vrai `MCP_SERVER_REGISTRY`.

### Autorisation personnelle OAuth MCP

Le runtime supporte trois modes d’authentification serveur :

- `NONE` pour un serveur ne demandant aucune authentification ;
- `BEARER_ENV` pour une credential technique DTSC gérée côté serveur ;
- `OAUTH_USER` pour une autorisation personnelle et tenant-scoped.

Une application n’obtient un bouton **Connecter** que lorsqu’un serveur correspondant est réellement `CERTIFIED`, configuré en `OAUTH_USER` et autorisé dans le contexte actif. Une connexion est liée à :

`userId + organizationId + serverCode`.

Le passage à une autre entreprise n’emporte donc jamais implicitement une autorisation personnelle.

### Flux de connexion

1. l’utilisateur choisit **Connecter** depuis `/ai/apps` ;
2. le serveur revalide session, organisation active, membership, contexte, certification du serveur et rate limit ;
3. DTSC découvre les métadonnées OAuth uniquement sur des hôtes explicitement certifiés dans `oauthAllowedHosts` ;
4. DTSC crée un `state` aléatoire et un verifier PKCE ;
5. le verifier est chiffré côté serveur ;
6. l’utilisateur est redirigé vers la page d’autorisation du fournisseur ;
7. le callback consomme le `state` une seule fois et rejette tout changement de user ou d’organisation ;
8. le code OAuth est échangé côté serveur avec PKCE S256 et Resource Indicator ;
9. access/refresh tokens sont chiffrés avant persistance ;
10. le centre affiche **Connecté** seulement après persistance réelle.

Le transport MCP demande ensuite un access token valide uniquement avec un contexte `{ userId, organizationId }` explicite. Un token expiré est rafraîchi côté serveur et le refresh est audité.

### Coffre de credentials

`DTSC_MCP_OAUTH_ENCRYPTION_KEY` est une clé serveur de 32 octets. Les credentials et les verifiers PKCE utilisent AES-256-GCM avec AAD contenant l’identité user/tenant/server afin qu’un ciphertext copié dans un autre contexte ne soit pas déchiffrable comme une credential valide.

Les tokens :

- ne sont jamais envoyés au modèle ;
- ne sont jamais rendus au navigateur ;
- ne sont jamais placés dans `DTSC_MCP_SERVERS_JSON` ;
- ne sont jamais journalisés ;
- sont détruits localement lors de la déconnexion, même si le fournisseur ne propose pas ou refuse une révocation distante.

Le runtime échoue fermé si la clé de chiffrement ou le client OAuth requis manque.

### Certification et SSRF

OAuth n’auto-certifie aucun serveur. Le serveur MCP doit déjà être présent dans le registre DTSC. Les endpoints MCP gardent les contrôles SSRF existants ; les endpoints OAuth sont limités séparément par `oauthAllowedHosts`. Les redirections HTTP automatiques sont refusées pendant découverte, échange et révocation.

`oauthClientIdEnvKey` et, si nécessaire, `oauthClientSecretEnvKey` référencent des secrets serveur. `oauthScopes` définit la liste minimale demandée. Aucun secret client ne doit être inclus directement dans le JSON du registre.

### Persistance additive

La migration `20260811010000_add_mcp_user_oauth` ajoute :

- `McpUserOAuthConnection` : credential chiffrée par user/organisation/serveur, scopes et expiration ;
- `McpUserOAuthState` : état anti-CSRF à usage unique et verifier PKCE chiffré.

La migration ne supprime ni colonne ni table existante.

## Mes collaborateurs — Copilote IA DTSC

Le composant partagé `VoiceConversationComposer` expose **Copilote IA DTSC** avec les actions Reformuler, Professionnaliser, Raccourcir, Plus chaleureux et Proposer une réponse.

API : `POST /api/collaborators/ai/compose`.

La route exige session, same-origin et rate limit, valide les entrées, réutilise le runtime IA canonique et retourne uniquement un brouillon. Le message reste envoyé manuellement par l’utilisateur.

L’extension suivante porte le **mode Agent de conversation** : le serveur doit fournir automatiquement un contexte borné issu du thread actif après revalidation du membership, sans donner au modèle un droit implicite d’envoi.

## Variables d’environnement OAuth

Voir `env.example`.

Obligatoires dès qu’un serveur `OAUTH_USER` est activé :

- `DTSC_MCP_OAUTH_ENCRYPTION_KEY` ;
- la variable nommée par `oauthClientIdEnvKey` ;
- la variable nommée par `oauthClientSecretEnvKey` si le fournisseur exige un client confidentiel ;
- `NEXT_PUBLIC_APP_URL`, utilisé pour construire le callback `/api/ai/apps/oauth/callback`.

Un déploiement ne doit pas prétendre qu’un fournisseur est prêt si son serveur n’est pas certifié/configuré dans `DTSC_MCP_SERVERS_JSON`.

## QA

`scripts/qa-assistant-ux-checks.mjs` vérifie :

- le contrat de langage humain et l’interdiction des noms de modules avec underscores ;
- les quatre identifiants Finance observés en régression ;
- la provenance des labels depuis le registre canonique bilingue ;
- le renderer enrichi `Streamdown` ;
- le catalogue et la dérivation de statut MCP ;
- le mode `OAUTH_USER` ;
- PKCE S256 et Resource Indicators ;
- la découverte OAuth ;
- le chiffrement authentifié ;
- l’isolation user/tenant/server ;
- les routes connect/callback/disconnect ;
- l’injection server-only des tokens dans le transport MCP ;
- le copilote collaboratif et l’absence d’auto-envoi implicite.

`scripts/qa-standard-ai-agent-ui.mjs` vérifie aussi que **Mode agent** passe par le hub flottant commun avec un ordre supérieur à la boîte à outils tout en conservant les contrôles du runtime.

## CI/CD

Le workflow reste :

`feature branch → contrôles → PR → Quality Gates → revue → merge main → unique déploiement Production`.

Aucun déploiement Vercel manuel depuis une branche feature n’est autorisé.
