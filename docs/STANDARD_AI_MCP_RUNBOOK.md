# DTSC Standard AI — MCP Connection & Revocation Runbook

## Scope

This runbook is for DTSC-operated MCP integrations. AI07 does not expose an open customer MCP marketplace and does not auto-certify external servers.

## Connect a server

1. Obtain the real MCP HTTPS endpoint and its ownership/security documentation.
2. Decide DTSC scope: `GLOBAL` or `TENANT`.
3. Classify the maximum data category permitted: `PUBLIC_ONLY`, `BUSINESS_ALLOWED` or `SENSITIVE_CERTIFIED`.
4. Review authentication. If the server needs a bearer credential, store the secret only in the deployment secret store and reference its environment-variable name through `authEnvKey`.
5. Add a `DTSC_MCP_SERVERS_JSON` entry with status `DISABLED` first.
6. Verify the endpoint host allow-list, DNS destination, TLS endpoint, timeout and response-size limits.
7. Change the server to `CERTIFIED` only after the security review is complete.
8. Run controlled discovery and review the persisted snapshot. Discovery alone does not activate tools or resources.
9. Select only READ tools for AI07. Record the exact remote name, input/output schemas and SHA-256 hashes.
10. Add `DTSC_MCP_TOOL_BINDINGS_JSON` entries with `enabled: false` first. Configure DTSC contexts, module requirements, exact permissions where needed, minimum plan, assistants/sectors and audit level.
11. Enable a binding only after its schema hashes match the reviewed discovery snapshot.
12. For resources, use `DTSC_MCP_RESOURCE_BINDINGS_JSON`. Keep resources disabled until URI/provenance/data-policy review is complete.
13. Run MCP registry/binding/auth/SSRF/data-policy/tenant-isolation/discovery QA plus the full Standard AI and application quality gates.
14. Perform controlled E2E using a non-production tenant and non-sensitive test data.
15. Promote through the repository's normal CI/CD path only after validation. Never deploy this stacked feature branch directly to production.

## Rotate a credential

1. Issue a new credential at the external authorization server/provider.
2. Update only the referenced deployment secret value; do not place the token in MCP JSON config.
3. Validate a controlled READ call.
4. Revoke the previous credential at its source.
5. Review `AiMcpAuditEvent` for unexpected authentication or endpoint failures.

A credential environment key belongs to one certified server definition. Do not intentionally reuse one server's token for another server.

## Suspend or revoke a server

For a suspected compromise or unexpected schema/endpoint behavior:

1. set the server status to `SUSPENDED` or remove it from `DTSC_MCP_SERVERS_JSON`;
2. disable/remove all associated tool and resource bindings;
3. revoke/rotate credentials at the external provider;
4. inspect `AiMcpAuditEvent`, `AiMcpDiscoverySnapshot` and canonical `AiToolExecution` records;
5. compare the last approved and latest discovery snapshots;
6. investigate endpoint/DNS/auth/schema changes;
7. create a new reviewed binding/hashes if the change is legitimate;
8. never overwrite an old certification silently.

## Schema drift response

`MCP_TOOL_INPUT_SCHEMA_CHANGED`, `MCP_TOOL_OUTPUT_SCHEMA_CHANGED` or `MCP_BOUND_TOOL_NOT_DISCOVERED` means the call must remain blocked. Do not bypass the check. Review fresh discovery, assess compatibility/security, update the certified binding deliberately, then rerun QA/E2E.

## Data-policy incident

If an MCP call is suspected of receiving unauthorized data:

1. suspend the server and bindings immediately;
2. preserve audit evidence;
3. identify the DTSC data classifications involved;
4. determine whether the server policy permitted those classifications;
5. rotate credentials if compromise is possible;
6. follow DTSC privacy/security incident procedures;
7. do not re-enable until the data boundary and minimization are revalidated.

## Current protocol baseline

DTSC targets MCP `2026-07-28` over stateless Streamable HTTP. Requests carry `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` where applicable, and per-request client metadata. The baseline intentionally does not implement legacy session IDs or the retired initialize/initialized handshake.
