import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");

const types = read("lib/ai/types.ts");
const catalog = read("lib/ai/catalog.ts");
const provider = read("lib/ai/provider.ts");
const adapter = read("lib/ai/providers/openai-responses.ts");
const errors = read("lib/ai/errors.ts");
const globalRoute = read("app/api/chat/v2/route.ts");
const enterpriseRoute = read("app/api/enterprise/ai/chat/route.ts");

for (const protocol of ["OPENAI_RESPONSES", "OPENAI_CHAT_COMPLETIONS", "OPENROUTER_CHAT_COMPLETIONS"]) {
  expect(types.includes(protocol), `AiProviderDefinition must prepare protocol ${protocol}`);
  expect(catalog.includes(protocol), `Provider catalog must validate protocol ${protocol}`);
}

expect(provider.includes("createProviderEventStream"), "Provider facade must expose createProviderEventStream");
expect(provider.includes("createOpenAiResponsesEventStream"), "OpenAI Responses must be delegated to its adapter");
expect(provider.includes("Unsupported AI provider protocol"), "Unimplemented protocols must fail closed");
expect(!provider.includes("/responses"), "Provider facade must not contain provider-specific HTTP paths");
expect(adapter.includes("/responses"), "OpenAI Responses HTTP call must live in its adapter");
expect(adapter.includes("classifyProviderHttpError"), "OpenAI adapter must normalize HTTP errors");
expect(errors.includes("status === 429"), "429 provider errors must remain RATE_LIMITED/retryable");
expect(errors.includes("status >= 500"), "5xx provider errors must remain provider-unavailable/retryable");
expect(!globalRoute.includes("response.output_text.delta"), "Global chat route must not parse native provider events");
expect(!enterpriseRoute.includes("response.output_text.delta"), "Enterprise chat route must not parse native provider events");

if (failures.length) {
  console.error("AI provider adapter QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("AI provider adapter QA passed");
