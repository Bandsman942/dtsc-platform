# DTSC Standard AI — MCP Security

## Trust model

Every remote MCP server, tool description, resource, prompt, response and schema is external untrusted input. Certification approves one exact DTSC configuration/binding; it does not make remote content authoritative.

## SSRF and transport controls

Before every remote call DTSC requires:

- HTTPS only;
- no URL credentials;
- exact hostname allow-list;
- rejection of localhost, `.local`, `.internal` and known metadata names;
- rejection of private, loopback, link-local, CGNAT, multicast/reserved literal IP ranges;
- DNS resolution and rejection when any resolved address is private/reserved;
- manual redirects with redirects rejected;
- request timeout;
- response content-type validation;
- declared and actual response-size limits;
- per-user/server rate limiting before remote egress.

The allow-list is server configuration, never model output or discovery output.

## MCP 2026-07-28 Streamable HTTP

The client sends one POST per JSON-RPC request. It advertises `application/json, text/event-stream` and handles both allowed response forms. Request-scoped SSE is buffered only within the configured response-size limit; notification events are ignored as authority and the final response matching the request id is required.

Every request mirrors protocol metadata in both the body and required MCP headers. `Mcp-Name` and `Mcp-Param-*` use the protocol Base64 sentinel encoding whenever the original value cannot be represented safely as a plain header value.

## Authentication

AI07 supports `NONE` and `BEARER_ENV`. Bearer tokens are resolved only from server-side environment variables named by the certified server definition. Tokens are never stored in:

- MCP JSON configuration;
- browser state;
- discovery snapshots;
- tool bindings;
- tool arguments/results;
- audit metadata.

A configured auth environment key is exclusive to one MCP server definition. OAuth/resource-indicator support is not claimed by AI07; a server that requires a stronger flow remains disabled until that flow is explicitly implemented and validated.

## Authorization

MCP authorization is subordinate to DTSC authorization:

1. `executeAiTool()` resolves the canonical tool, schemas and executor;
2. Tool Gateway checks session context, assistant, tenant, sector, plan and modules;
3. tenant-scoped MCP verifies exact active organization;
4. binding-specific DTSC permissions are revalidated from active membership/roles/position;
5. data classification is evaluated;
6. current remote schemas are compared with certified hashes;
7. only then can `tools/call` occur.

The remote server never decides DTSC access.

## Data egress

`SECRET` always fails closed. Restricted and sector-sensitive classifications are normalized to `SENSITIVE`, which requires a `SENSITIVE_CERTIFIED` server. `PUBLIC_ONLY` rejects internal/confidential/sensitive inputs.

If a caller does not supply a classification, DTSC does not assume public data: organization and DTSC-internal contexts default to `CONFIDENTIAL`, while other contexts default to `INTERNAL`.

Arguments must be limited to the fields required by the certified schema. Broad session objects, cookies, credentials, arbitrary retrieved documents, or hidden prompt state must not be attached to MCP requests.

## Prompt injection and resources

Remote descriptions, prompts and resources are data. They never become system/developer authority. Resource bindings return `UNTRUSTED_EXTERNAL_CONTENT` with `instructionAuthority: NONE` and do not auto-ingest into RAG/CAG.

## Schema drift

Input/output JSON Schemas are pinned by SHA-256. The current `tools/list` schema is rechecked before every bound tool call. A removed tool or hash mismatch blocks execution with a stable reason code; the binding must be reviewed and re-certified rather than silently updated.

Unsupported JSON Schema composition (`oneOf`, `anyOf`, `allOf`, `$ref`, conditional schemas, `not`) fails closed in the first delivery. The empty schema `{}` is treated as an unconstrained value only where the remote protocol legitimately provides no output schema.

## AI07 mutation boundary

AI07 accepts only READ tools. Registry and binding validation reject PREPARE, MUTATE and SENSITIVE_MUTATE. No payment, accounting posting, clinical mutation, HR sanction/payroll decision, legal commitment, or other sensitive side effect is introduced through MCP.

## Residual infrastructure consideration

DNS is validated before the request and private/reserved results are rejected. The deployment network should additionally use egress controls where available because application-level DNS validation alone cannot eliminate every DNS-rebinding/time-of-check/time-of-use risk on hostile infrastructure.
