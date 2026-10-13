# Scopes OAuth du runtime MCP — AI-MCP-02 (première tranche)

Le hotfix AI-MCP-01 (#801, PR #809) permet de stocker des credentials personnels avec `organizationId = NULL`. AI-MCP-02 complète cette séparation au niveau des appels MCP certifiés afin que l'exécution utilise **le même scope que la session authentifiée**, sans jamais convertir un token personnel en autorisation entreprise.

## Résolveur unique

`lib/ai/mcp/user-scope.ts` refuse :
- toute discordance entre `context.userId` et `session.userId` ;
- un serveur absent de la liste des contextes qu'il a certifiés ;
- un appel ORGANIZATION ou DTSC_INTERNAL sans identifiant d'organisation égal à `session.activeOrganizationId` ;
- un appel GLOBAL_CLIENT ou COMMUNITY contenant un identifiant d'entreprise ;
- un serveur TENANT utilisé sans contexte ORGANIZATION.

Seuls les serveurs `organizationScope=GLOBAL` sont autorisés à recevoir `userAuth.organizationId = null` dans `callMcpJsonRpc()`. Dans une organisation, même un serveur GLOBAL utilise la connexion OAuth liée à **cette organisation**, jamais la connexion personnelle.

Les adapters d'outils et de ressources partagent le même résolveur et exécutent toujours les contrôles de permissions, de classification, de rate limit, de discovery et des hashes avant les lectures. Les clés et tokens restent chiffrés côté serveur et ne sont jamais transmis au modèle.

## Preuves attendues

- QA `pnpm qa:assistant-ux` avec assertions d'isolation de scope.
- Tests de type, régression, audit, sécurité et build.
- E2E propriétaire #803 pour une lecture MCP READ authentifiée Gmail et Google Calendar, dans une configuration dont endpoints et outils ont été réellement certifiés. Test de refus de réutilisation d'une connexion personnelle depuis une entreprise différente.
- Les états `READY` et `operational` sont interdits sans preuve d'outil certifié et test réussi.

**Rollback :** revert de la PR de runtime si nécessaire, sans rollback des tables OAuth personnelles ni suppression de tokens. La possibilité de se connecter peut subsister, mais l'assistant ne doit pas revendiquer de lecture d'outil en l'absence de confirmation.
