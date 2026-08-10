import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const env = read("lib/env.ts");
const example = read("env.example");
const provider = read("lib/ai/provider.ts");
const adapter = read("lib/ai/providers/openrouter-chat-completions.ts");
const catalog = read("lib/ai/catalog.ts");

expect(env.includes("OPENROUTER_API_KEY"), "OpenRouter API key must be server configuration");
expect(example.includes("OPENROUTER_API_KEY="), "env.example must document OpenRouter key without a secret value");
expect(provider.includes("OPENROUTER_CHAT_COMPLETIONS"), "Provider facade must dispatch OpenRouter protocol");
expect(adapter.includes("/chat/completions"), "OpenRouter adapter must use chat completions endpoint");
expect(adapter.includes("stream: true"), "OpenRouter adapter must request streaming");
expect(adapter.includes("stream_options: { include_usage: true }"), "OpenRouter streaming must request terminal usage metadata");
expect(adapter.includes('data === "[DONE]"'), "OpenRouter adapter must emit completion only from the provider DONE sentinel");
expect(adapter.includes("allow_fallbacks: false"), "OpenRouter internal provider fallbacks must stay disabled so DTSC owns fallback policy");
expect(adapter.includes('data_collection: "deny"'), "OpenRouter request must deny provider data collection");
expect(adapter.includes("zdr: true"), "OpenRouter request must require a Zero Data Retention endpoint");
expect(adapter.includes("async cancel(reason)"), "OpenRouter adapter must propagate downstream cancellation");
expect(adapter.includes("reader?.cancel(reason)"), "OpenRouter cancellation must cancel the native response reader");
expect(adapter.includes("TOOL_CALL_COMPLETED"), "OpenRouter adapter must normalize completed tool calls");
expect(adapter.includes("RATE_LIMITED") && adapter.includes("PROVIDER_UNAVAILABLE"), "OpenRouter stream errors must map to DTSC reason codes");
expect(catalog.includes('code: "OPENROUTER"'), "Canonical OpenRouter provider must exist in DTSC catalog");

if (failures.length) {
  console.error("OpenRouter provider QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("OpenRouter provider QA passed");
