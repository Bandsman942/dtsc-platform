import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");

const events = read("lib/ai/provider-events.ts");
const provider = read("lib/ai/provider.ts");
const adapter = read("lib/ai/providers/openai-responses.ts");
const stream = read("lib/ai/stream.ts");
const orchestrator = read("lib/ai/orchestrator.ts");

for (const eventType of ["TEXT_DELTA", "TOOL_CALL_DELTA", "TOOL_CALL_COMPLETED", "USAGE", "COMPLETED", "ERROR"]) {
  expect(events.includes(eventType), `Normalized provider contract must include ${eventType}`);
}
expect(provider.includes("createProviderEventStream"), "Provider facade must expose normalized event streams");
expect(adapter.includes("response.output_text.delta"), "OpenAI native event parsing must live in the OpenAI adapter");
expect(adapter.includes("response.completed"), "OpenAI completion parsing must live in the OpenAI adapter");
expect(!stream.includes("response.output_text.delta"), "DTSC stream consumer must not parse OpenAI native text events");
expect(!stream.includes("response.completed"), "DTSC stream consumer must not parse OpenAI native completion events");
expect(stream.includes('value.type === "TEXT_DELTA"'), "DTSC stream consumer must consume normalized TEXT_DELTA events");
expect(stream.includes('value.type === "USAGE"'), "DTSC stream consumer must consume normalized USAGE events");
expect(orchestrator.includes("createProviderEventStream"), "Orchestrator must use the provider adapter facade");

if (failures.length) {
  console.error("Normalized AI stream QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Normalized AI stream QA passed");
