import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");

const events = read("lib/ai/provider-events.ts");
const adapter = read("lib/ai/providers/openai-responses.ts");
const stream = read("lib/ai/stream.ts");
const orchestrator = read("lib/ai/orchestrator.ts");

for (const eventType of ["TEXT_DELTA", "TOOL_CALL_DELTA", "TOOL_CALL_COMPLETED", "USAGE", "COMPLETED", "ERROR"]) {
  expect(events.includes(eventType), `Normalized provider contract must include ${eventType}`);
}

expect(adapter.includes("response.output_text.delta"), "Native OpenAI text parsing must stay inside the adapter");
expect(adapter.includes("response.completed"), "Native OpenAI completion parsing must stay inside the adapter");
expect(!stream.includes("response.output_text.delta"), "DTSC stream consumer must not parse native OpenAI text events");
expect(!stream.includes("response.completed"), "DTSC stream consumer must not parse native OpenAI completion events");
expect(stream.includes('value.type === "TEXT_DELTA"'), "Text stream must consume normalized TEXT_DELTA events");
expect(stream.includes('value.type === "USAGE"'), "Text stream must consume normalized USAGE events");
expect(stream.includes('value.type === "ERROR"'), "Text stream must consume normalized ERROR events");
expect(stream.includes('value.type === "COMPLETED"'), "Text stream must consume normalized COMPLETED events");
expect(stream.includes("completedEventSeen"), "Text stream must distinguish a complete provider stream from an incomplete transport close");
expect(stream.includes('reasonCode: "STREAM_INTERRUPTED"'), "Incomplete stream must be classified explicitly");
expect(orchestrator.includes("createProviderEventStream"), "Orchestrator must route through the provider adapter facade");

if (failures.length) {
  console.error("Normalized AI stream QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Normalized AI stream QA passed");
