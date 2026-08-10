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
