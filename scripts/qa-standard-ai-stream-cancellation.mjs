import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");

const adapter = read("lib/ai/providers/openai-responses.ts");
const stream = read("lib/ai/stream.ts");
const observability = read("lib/ai/observability.ts");

expect(adapter.includes("async cancel(reason)"), "Provider adapter must propagate downstream cancellation");
expect(adapter.includes("reader?.cancel(reason)"), "Provider adapter cancellation must cancel the native response reader");
expect(stream.includes('addEventListener("abort"'), "DTSC text stream must listen to AbortSignal");
expect(stream.includes('reader?.cancel("CLIENT_INTERRUPTED")'), "AbortSignal must cancel the normalized provider stream");
expect(stream.includes('reader.cancel("PROVIDER_ERROR")'), "A normalized provider ERROR must stop the upstream provider stream");
expect(stream.includes("consumerCancelled = true"), "Consumer cancellation state must be tracked");
expect(stream.includes("completedEventSeen"), "Text stream must detect incomplete provider termination");
expect(observability.includes("observeAiProviderAttemptStream"), "Provider attempt lifecycle must observe the returned stream");
expect(observability.includes("let consumerCancelled = false"), "Provider attempt observer must guard cancellation races");
expect(observability.includes('finish("CANCELLED", "STREAM_INTERRUPTED")'), "Observed provider attempt cancellation must persist CANCELLED");

if (failures.length) {
  console.error("AI stream cancellation QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("AI stream cancellation QA passed");
