# Guide utilisateur — DTSC Agent Mode (EN)
> **Contrat de guide DTSC v2** — Bounded interactive Agent Mode, FR/EN interface, server-side permissions, human approval, resume and mobile flow.

## Objectif et périmètre

**DTSC Agent Mode** lets you give DTSC AI a multi-step objective while retaining server-side limits, account permissions and explicit human approval for actions that modify data. It is available from both the **Global Chatbot** and the **Enterprise AI Assistant** through the **Agent mode** button.

To start a run, open the panel, describe the outcome you need and choose **Run agent**. The panel shows the run state, useful execution steps, tools that were actually used, token usage and estimated cost. Visible steps are auditable execution traces only; private chain-of-thought is never displayed.

Agent Mode is an explicit opt-in path. It does not automatically replace regular conversations and does not grant unlimited autonomy. Maximum steps, tool calls, tokens, estimated cost and active duration are enforced by server policy according to plan and data classifications.

## Accès et permissions

- Access depends on the authenticated session, active context, role, permissions, subscription plan and enabled modules.
- In the Enterprise AI Assistant, the active organization is resolved again from the server session; a prompt cannot freely select another tenant.
- The agent receives only tools already authorized for the user and context. Every invocation is then revalidated through the **DTSC Tool Gateway**.
- RAG/CAG documents and tool results are treated as untrusted data, never as instructions that can override DTSC policies.
- For sensitive Health, Finance, HR and Legal domains, the agent is limited to read and prepare capabilities. It cannot autonomously make a final clinical decision, execute a payment or accounting entry, decide payroll or disciplinary action, or create a final legal commitment.

On mobile, the panel respects the device safe area. Closing it returns to the main conversation without replacing the canonical chat history.

## Statuts, validations et traçabilité

Main states include **Analysis in progress**, **Approval required**, **Ready to resume**, **Completed**, **Cancelled**, **Failed** and **Budget reached**. Consumed steps and tool calls are always compared with the run’s server-side limits.

### Approve an action

When a certified mutation requires approval:

1. the run moves to **Approval required**;
2. review the proposed action and its preview;
3. choose **Approve** or **Reject**;
4. after successful approval, choose **Resume after approval** to continue the same run.

Typing “yes”, “ok”, “go ahead” or equivalent language in chat never authorizes a mutation. Approval uses a structural server-side control bound to the proposed action. Rejecting it cancels the proposal and closes the suspended run. An action already approved and executed remains real and auditable even if the run is later cancelled.

### Cancel

Use **Cancel run** to stop an active or suspended run. Cancellation is persisted and propagated to the runtime and provider when execution is still active. It does not pretend to erase a mutation that has already been executed.

Auditability keeps only useful operational metadata such as status, steps, tool code, provider/model when relevant, tokens, estimated cost, duration and reason codes instead of copying the full conversation.

## Sécurité et confidentialité

- Private chain-of-thought, full prompts, secrets and raw tool arguments are not exposed by the run-status interface.
- Organization, run, conversation and confirmation identifiers are revalidated server-side.
- Browser-supplied limits may only reduce server ceilings; they cannot increase them.
- Mutations always pass through the Tool Gateway and, when required, structural human confirmation with the existing idempotency protections.
- `SECRET` and sensitive classifications remain governed by the Policy Router and do not become externally shareable merely because a provider or tool exists.
- MCP connectors are usable only when they are actually configured, certified and authorized; remote discovery never grants a DTSC permission.

Before an important decision, review citations, business results and the relevant canonical source. Agent Mode can analyze, prepare and orchestrate work, but it does not replace professional responsibility or authoritative business workflows.

## Dépannage

- **Budget reached**: reduce the objective or start a more focused run; do not try to increase limits from the browser.
- **Action not authorized**: verify active organization context, role, permissions, plan and enabled modules.
- **Expired approval**: ask the agent to prepare the action again so a fresh valid proposal can be created.
- **Ready to resume but stopped**: use **Resume after approval**; continuation uses the same run and the canonical server-side tool result.
- **Provider unavailable**: retry when the AI service is available. Do not bypass policy through an unsupported direct business mutation.
- **Status appears stale**: refresh the run or reopen the panel; server-side run state remains authoritative.

If an issue persists, keep the run identifier and displayed reason code for support, but do not share secrets, unnecessary sensitive data or private model content.