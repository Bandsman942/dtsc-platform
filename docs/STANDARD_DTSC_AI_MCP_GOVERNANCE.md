# Centre IA DTSC — Gouvernance des serveurs MCP et assistants (AI-CONSOLE-03)

## Accès et autorité
La sous-section « Serveurs MCP et assistants » de `/admin/ai-control-center` hérite de la consultation `CONSOLE_AI_READ`, après contrôle du contexte `DTSC_INTERNAL`. La suspension/réactivation est autorisée séparément par `CONSOLE_AI_MCP_MANAGE` ; `CONSOLE_AI_MANAGE` seul ne la remplace pas. Seul l'administrateur global ou un utilisateur interne explicitement habilité peut modifier ces contrôles.

## Sources
- `MCP_SERVER_REGISTRY` : identité/certification/autorisations/transport et configuration locale serveur.
- `MCP_TOOL_BINDINGS` : bindings certifiés, mode READ, hash et version de découverte épinglés ; `enabled` ne vaut pas résultat E2E.
- `AiMcpDiscoverySnapshot` : dernière version de découverte et compatibilité enregistrées ; absence = inconnu.
- `AiMcpAuditEvent` : nombre agrégé de succès, refus et échecs sur sept jours ; absence d'audit ≠ santé garantie.
- `McpUserOAuthConnection` : simple comptage agrégé des grants non révoqués, sans lecture des credentials ni preuve d'outil utilisable.
- `getAssistantProfiles()` : assistants canoniques et politiques visibles.
- `AiMcpControlState` : suspension globale additive et révision optimiste, sans nouvelle source de certification.

## Niveaux d'état
Le fait d’être **enregistré** signifie uniquement qu'une définition serveur figure au registre. **Certifié** signifie que DTSC a autorisé cette définition. **Configuré** signifie que les prérequis locaux identifiés sont présents. **OAuth connecté** décrit des autorisations du compte et leur portée (dans cette console, compte agrégé des grants, jamais statut d'un utilisateur donné). **Outil activé** décrit un binding autorisé ; **joignable** n'est pas inféré du statut de registre. Les droits et la disponibilité utilisateur sont toujours revérifiés par le Tool Gateway.

Les modifications de discovery et de schémas ne peuvent pas activer un outil, modifier la certification ou élargir des permissions. Le hash et la version du binding restent épinglés. Une découverte incompatible reste visible pour révision manuelle, jamais automatiquement approuvée.

## Suspension d'urgence et audit
La route `PATCH /api/admin/ai/mcp/control` exige la même origine, session interne, permission `CONSOLE_AI_MCP_MANAGE`, serveur existant, justification de 8–500 caractères et `expectedRevision`. Elle ne prend **que** `serverCode`, `suspended`, `reason` et `expectedRevision`. Une version concurrente retourne `409 REVISION_CONFLICT`.

L’écriture et `PlatformSettingHistory` sont transactionnelles, puis un `AuditLog` à risque élevé est émis. Le transport `callMcpJsonRpc` consulte toujours `AiMcpControlState` avant la résolution DNS et les appels au fournisseur. En cas de suspension, il refuse l’appel. En cas d’erreur de base de données, il échoue fermé ; il ne réactive jamais automatiquement un serveur.

**Réactivation** : retour à l'état du registre et des bindings existants seulement, sans approuver de nouvel outil, de schéma ou de permission. Une nouvelle révision auditée est toujours produite.

## Sécurité et confidentialité
Jamais de clé API, jeton OAuth, schéma distant brut, contenu de ressource, message, ID utilisateur ou ID d'organisation renvoyé au navigateur. Les agrégats peuvent être indisponibles : afficher « non disponible », et non « 0 » ou « healthy ». L’API de mutation ne contourne pas les exigences de gestion des plans et du Tool Gateway.

## Validation
`pnpm qa:console-mcp`, `pnpm qa:standard-dtsc-console`, `pnpm qa:regression`, `pnpm type-check`, lint, build, migration SQL additive.

E2E propriétaire #802 : permissions lecture vs gestion, utilisateur externe refusé, suspension du serveur suivie d'un refus de découverte/appel MCP, restauration auditée avec version incrémentée, conflit simultané 409, états OAuth et reachability clairement distincts, absence de secrets dans la réponse, FR/EN, mobile 320–1024 px, maintien des barrières multi-tenant.

**Rollback** : revert applicatif après validation et conserver la table additive `AiMcpControlState` pour préserver les suspensions de sécurité et l'historique ; ne pas supprimer des contrôles actifs sans procédure de re-certification.
