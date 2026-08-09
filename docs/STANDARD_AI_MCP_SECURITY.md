# DTSC Standard AI — MCP Security

## Trust model

Every remote MCP server, tool description, resource, prompt, response and schema is external untrusted input. Certification means DTSC has approved a specific server configuration and binding policy; it does not make remote content authoritative.

## SSRF controls

Before transport, DTSC requires:

- HTTPS only;
- no URL user/password credentials;
- exact hostname allow-list;
- rejection of localhost, `.local`, `.internal` and known metadata hostnames;
- rejection of private, loopback, link-local, CGNAT and multicast/reserved literal IPs;
- DNS resolution before the request and rejection if any resolved address is private/reserved;
- manual redirects only, with all redirects rejected in the AI07 baseline;
- request timeout;
- content-type validation;
- declared and actual response-size limits.

The allow-list is controlled server configuration. It is not derived from model output or from MCP discovery.

## Authentication

AI07 supports `NONE` and `BEARER_ENV`. Bearer tokens are resolved server-side from the environment variable named by the certified server definition. Tokens are never placed in browser configuration, discovery snapshots, tool bindings, tool arguments, Tool Gateway results or MCP audit metadata.

A token is resolved only from the target server definition. A binding cannot supply or override a token, which prevents using one server's credential for another endpoint.

OAuth/resource-indicator support is not claimed in this baseline. A protected server requiring MCP OAuth must remain disabled until its resource-scoped OAuth flow and rotation/revocation lifecycle are implemented and validated.

## Authorization

MCP authorization is subordinate to DTSC authorization. The remote server is never consulted to decide whether a DTSC user may invoke a tool.

For every invocation:

1. `executeAiTool()` validates the canonical tool and arguments;
2. Tool Gateway verifies DTSC context/assistant/tenant/module/plan policy;
3. tenant-scoped MCP verifies the exact active organization;
4. configured exact binding permissions are verified from DTSC membership/role/position permissions;
5. the data boundary is evaluated;
6. current remote tool schemas are compared with the certified binding;
7. only then is `tools/call` allowed.

## Data egress

`SECRET` is always denied. DTSC restricted or sector-sensitive classifications are treated as SENSITIVE. Sensitive egress requires a server explicitly certified with `SENSITIVE_CERTIFIED`. Public-only servers reject internal/confidential/sensitive inputs.

Tool arguments should contain only the minimum fields required by the certified schema. Adding broad context objects, raw session data, credentials, cookies or arbitrary retrieved documents to MCP arguments is prohibited.

## Prompt injection and MCP resources

Remote tool descriptions, prompts and resources are data. They must never be promoted to system/developer instructions. Discovery of `prompts/list` is inventory-only in this baseline. No remote prompt is executed as assistant policy.

MCP resources are not automatically sent to the LLM or RAG index. A future resource binding must enforce DTSC access, provenance, classification, size/type limits and untrusted-content treatment before ingestion.

## Schema drift

Bindings pin SHA-256 hashes for input and output schemas. Immediately before a bound call, DTSC performs fresh discovery and rejects missing or changed schemas with stable errors such as:

- `MCP_BOUND_TOOL_NOT_DISCOVERED`;
- `MCP_TOOL_INPUT_SCHEMA_CHANGED`;
- `MCP_TOOL_OUTPUT_SCHEMA_CHANGED`.

Discovery snapshots are persisted for review and incompatible changes are audited. Changes never auto-update or auto-enable a binding.

## Mutations

AI07 is READ-only. Server registry integrity rejects non-READ modes, and binding validation accepts only `mode: READ` with `requiresConfirmation: false`. A remote server advertising a mutation-like tool does not make it executable.

Any future MCP mutation must still use the Tool Gateway confirmation, idempotency and audit contracts established in AI06 and requires a separate explicit product/security decision.

## Audit and incident response

`AiToolExecution` records the canonical DTSC tool execution. `AiMcpAuditEvent` records MCP-specific discovery/tool events and stable reason codes. `AiMcpDiscoverySnapshot` preserves capability snapshots without storing authentication secrets.

On suspected compromise:

1. set the server status to `SUSPENDED` or remove it from `DTSC_MCP_SERVERS_JSON`;
2. disable/remove associated bindings;
3. revoke/rotate the server credential at its source;
4. review MCP audit events and Tool Gateway executions;
5. re-run controlled discovery only after the endpoint is trusted again;
6. create new bindings/hashes rather than silently accepting changed schemas.
