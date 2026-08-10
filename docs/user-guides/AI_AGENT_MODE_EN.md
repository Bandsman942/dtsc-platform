# User Guide — DTSC Agent Mode

## What is Agent Mode for?

Agent Mode lets you give DTSC AI a multi-step task while keeping server-side limits, your account permissions and explicit human approval for actions that modify data.

It is available in both the Global Chatbot and the Enterprise AI Assistant through the **Agent mode** button.

## Start a run

1. Open **Agent mode**.
2. Describe the outcome you need rather than a low-level execution script.
3. Start the agent.
4. Follow its status, useful execution steps, tools, token usage and estimated cost.

The agent never displays private chain-of-thought. Visible steps are auditable execution traces only.

## Tools and data

The agent can see only tools already authorized for your user, organization, plan and active context. Every invocation goes back through the DTSC Tool Gateway.

In the Enterprise Assistant, organization context is resolved again from your active authenticated session. A prompt cannot freely select another tenant.

RAG/CAG documents and tool results are treated as data, never as instructions that can override DTSC policies.

## Approve an action

When a mutation requires approval:

1. the run moves to **Approval required**;
2. review the action and its preview;
3. choose **Approve** or **Reject**;
4. after a successful approval, choose **Resume after approval** to continue the same run.

Typing “yes”, “ok”, “go ahead” or equivalent language in chat never authorizes a mutation.

Rejecting an approval closes the suspended run. An action already approved and executed remains real and auditable even if the run is later cancelled.

## Cancel

Use **Cancel run** to stop an active or suspended run. Cancellation propagates to the runtime and to the provider when execution is still in progress.

## Limits and sensitive domains

Steps, tool calls, tokens, estimated cost and active duration are capped server-side according to plan and data classifications.

For sensitive Health, Finance, HR and Legal domains, the agent is limited to read and prepare capabilities. It cannot autonomously make a final clinical decision, execute a payment or accounting entry, decide payroll/disciplinary action, or create a final legal commitment.

## Troubleshooting

- **Budget reached**: reduce the task or start a more focused run.
- **Action not authorized**: verify your role, active context and enabled modules.
- **Expired approval**: ask the agent to prepare the action again.
- **Provider unavailable**: retry when AI service is available; do not bypass policy through an unsupported direct business mutation.

## Recommended practice

- Give the agent a clear, verifiable outcome.
- Review citations and business results before making a decision.
- Use mutation tools only when they are actually necessary.
- Cancel a run that is going in the wrong direction instead of trying to expand its limits.
- For important information or actions, always verify the canonical business source.
