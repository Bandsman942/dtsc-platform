# DTSC Standard AI — MCP Connection & Revocation Runbook

## Scope

This runbook covers DTSC-operated MCP integrations. AI07 does not expose an open customer marketplace and does not auto-certify external servers.

## Connect a server

1. Obtain the real HTTPS MCP endpoint and security/ownership documentation.
2. Confirm that the server supports the DTSC modern baseline, MCP `2026-07-28` Streamable HTTP.
3. Decide `GLOBAL` or `TENANT` scope.
4. Classify the maximum permitted egress as `PUBLIC_ONLY`, `BUSINESS_ALLOWED` or `SENSITIVE_CERTIFIED`.
5. Review authentication. Store bearer credentials only in the deployment secret store and reference the unique environment-variable name via `authEnvKey`.
6. Add the server to `DTSC_MCP_SERVERS_JSON` with status `DISABLED` first.
7. Review exact host allow-list, DNS destination, TLS endpoint, timeout, response-size and rate-limit expectations.
8. Change status to `CERTIFIED` only after security review.
9. Run controlled discovery and review the persisted snapshot. Discovery does not activate tools/resources.
10. Select READ tools only. Record the exact remote name, schemas and SHA-256 hashes.
11. Add `DTSC_MCP_TOOL_BINDINGS_JSON` entries with `enabled: false` first and configure contexts, modules, permissions, plan, assistants/sectors and audit level.
12. Enable a binding only after the current discovery schema hashes match the reviewed values.
13. Configure resources separately through `DTSC_MCP_RESOURCE_BINDINGS_JSON`, also disabled first and with explicit permissions.
14. Run all MCP QA plus the full Standard AI/application quality gates.
15. Perform E2E with a non-production tenant and non-sensitive test data before any Production activation.
16. Promote only through the normal branch → PR → `main` → Production path.

## Protocol compatibility failure

If a server rejects `2026-07-28` or does not support modern Streamable HTTP behavior, keep it disabled. AI07 does not silently downgrade into a legacy initialization/session transport. A future compatibility layer requires a separately reviewed implementation.

## Rotate a credential

1. Issue a new credential at the external provider.
2. Update only the dedicated deployment secret referenced by the server's `authEnvKey`.
3. Validate a controlled READ call.
4. Revoke the old credential at its source.
5. Review `AiMcpAuditEvent` for unexpected authentication/endpoint failures.

Do not reuse the same credential environment key across multiple MCP server definitions.

## Suspend or revoke a server

On suspected compromise, drift or unexpected endpoint behavior:

1. set the server to `SUSPENDED` or remove it from `DTSC_MCP_SERVERS_JSON`;
2. disable/remove all associated tool/resource bindings;
3. revoke/rotate credentials at the external provider;
4. preserve `AiMcpAuditEvent`, `AiMcpDiscoverySnapshot` and canonical `AiToolExecution` evidence;
5. compare the last approved and current discovery snapshots;
6. investigate endpoint, DNS, authentication and schema changes;
7. certify a new explicit binding/hash only when the change is legitimate;
8. never overwrite an old certification silently.

## Schema drift response

`MCP_TOOL_INPUT_SCHEMA_CHANGED`, `MCP_TOOL_OUTPUT_SCHEMA_CHANGED` or `MCP_BOUND_TOOL_NOT_DISCOVERED` means the call stays blocked. Run fresh discovery, review compatibility/security, update the certified binding deliberately, rerun QA and E2E, then re-enable.

## Data-policy incident

If unauthorized egress is suspected:

1. suspend the server and bindings immediately;
2. preserve audit evidence;
3. identify the DTSC classifications involved;
4. determine whether server policy permitted those classifications;
5. rotate credentials if compromise is possible;
6. follow DTSC privacy/security incident procedures;
7. do not re-enable until data minimization and the classification boundary are revalidated.

## Rollback

Application rollback is a normal PR revert. The additive MCP migration may remain in place without activating any remote capability. Empty MCP configuration arrays disable all servers, tools and resources. Discovery/audit records should be preserved rather than destructively removed.


## AI-MCP-02 — Preuves exigées pour Gmail et Google Calendar

**Statut fournisseur vérifié** : les endpoints MCP Google Workspace Gmail et Calendar figurent dans la documentation officielle Google, mais l'accès est indiqué comme **Developer Preview** et requiert l'éligibilité/activation correspondante. Vérifier ce prérequis fournisseur avant d'afficher un statut opérationnel. Références :
- https://developers.google.com/workspace/gmail/api/reference/mcp
- https://developers.google.com/workspace/calendar/api/v3/reference/mcp
- https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server
- https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server

**Sécurité READ** : Google expose aussi des outils distants mutables. DTSC interdit notamment `create_draft`, `label_message`, `create_event`, `update_event` et `delete_event` dans AI-MCP-02. La politique `google-read-tool-policy.ts` restreint les noms d'outils Gmail/Calendar utilisables, même si une configuration les classe accidentellement `READ`. Une entrée allowlistée n'est pas pour autant certifiée utilisable : il faut toujours les scopes, la découverte, les hashes et le parcours E2E authentifié.


Le registre livré contient `GOOGLE_GMAIL_OFFICIAL` et `GOOGLE_CALENDAR_OFFICIAL` comme **définitions certifiées**. Ce statut ne constitue pas une preuve que l'endpoint distant est actif, que Google a accordé l'accès ou qu'un outil READ est utilisable.

### Préflight par connecteur (même règle pour chacun)

1. Vérifier en environnement sécurisé, sans imprimer les valeurs, la présence effective des variables `MCP_GOOGLE_CLIENT_ID`, `MCP_GOOGLE_CLIENT_SECRET`, `DTSC_MCP_OAUTH_ENCRYPTION_KEY`. Une variable manquante empêche la connexion, jamais de statut opérationnel par défaut.
2. Dans `/ai/apps`, utiliser un **compte de test volontaire**, distinguer autorisation personnelle GLOBAL et organisation active. Exécuter OAuth PKCE, vérifier scopes minimaux requis, expiration/refresh et révocation.
3. Confirmer que le vrai fournisseur propose l'endpoint MCP configuré avec Streamable HTTP. Vérifier négociations de protocole, host allow-list, TLS/DNS, timeout et taille réponse. Si le serveur ne répond pas ou ne respecte pas le protocole, stopper sans substituer un faux succès.
4. Exécuter `tools/list` authentifié et enregistrer le snapshot de découverte (version, hashes entrée/sortie) ; `resources/list` facultatif n'autorise aucun outil en plus.
5. Mettre en revue **un vrai outil READ** choisi à partir de cette découverte, avec noms et schémas réellement renvoyés. Préparer son binding sous `DTSC_MCP_TOOL_BINDINGS_JSON` avec `enabled=false`, contexte/assistant/permissions stricts, `inputSchemaHash`, `outputSchemaHash` et `certifiedDiscoveryVersion` exacts. Ne jamais inventer un nom de méthode distante ou un hash.
6. Après revue, n'activer que le READ approuvé, puis exécuter `tools/call` sur des données de test de ce compte. Vérifier `AiMcpAuditEvent` de type `TOOL_CALL`, statut `SUCCESS`, version de discovery et sortie validée Zod.
7. Répéter depuis le contexte entreprise **autorisé**, puis tester utilisateur sans permission, tenant différent et scope personnel non transférable. Simuler une révocation et un schéma changé : l'appel doit échouer fermé.
8. Consigner preuves GitHub/CI, statut OAuth, résultat concret de l'appel READ, anonymisation, refus d'accès croisé et OWNER_E2E. Sans ces éléments, l'application peut être listée/CONNECTÉE, mais jamais dite `operational`.

### Points de contrôle spécifiques

- Gmail : OAuth lecture seule `https://www.googleapis.com/auth/gmail.readonly`. Valider sur un e-mail de test dont l'utilisateur possède l'accès ; ne jamais enregistrer son contenu dans le rapport de supervision.
- Calendar : scopes read-only/freebusy du registre, événement de test volontaire, dates et fuseau horaire exacts. Aucune création de rendez-vous ni action MUTATE dans AI-MCP-02.
- Un serveur `organizationScope=GLOBAL` peut fonctionner en scope PERSONNEL (`organizationId=null`) uniquement si le contexte de session l'autorise. Dans une entreprise, ne jamais réutiliser le jeton personnel.
- Une suspension `AiMcpControlState` stoppe tout RPC (y compris discovery) et sa réactivation ne contourne pas OAuth, schémas, plan ni Tool Gateway.

**Désactivation / rollback :** désactiver le binding à la source, suspendre le serveur en Console si nécessaire, révoquer les grants du compte de test et conserver l'audit. Ne pas supprimer les migrations personnelles ou les traces de sécurité. Toute activation Production d'un nouveau binding exige un cycle PR et E2E distinct, pas un changement secret de configuration.
