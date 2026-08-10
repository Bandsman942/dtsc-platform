const parseArray = (raw) => {
  if (!raw?.trim()) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const certified = parseArray(process.env.AI_OPENROUTER_CERTIFIED_MODELS_JSON)
  .filter((model) => model && typeof model === "object" && model.providerCode === "OPENROUTER" && model.providerModelId && model.certificationVersion);

if (!certified.length) {
  console.log("OpenRouter catalog audit skipped: no DTSC-certified OpenRouter models configured.");
  process.exit(0);
}

const baseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const headers = {};
if (process.env.OPENROUTER_API_KEY) headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;

const supportsParameter = (remote, parameter) => Array.isArray(remote?.supported_parameters) && remote.supported_parameters.includes(parameter);

try {
  const response = await fetch(`${baseUrl}/models?zdr=true`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const remoteModels = Array.isArray(payload?.data) ? payload.data : [];
  const remoteById = new Map(remoteModels.map((model) => [model.id, model]));
  const failures = [];

  for (const model of certified) {
    const remote = remoteById.get(model.providerModelId);
    if (!remote) {
      failures.push(`${model.code}: provider model ${model.providerModelId} is missing from the ZDR-compatible OpenRouter catalog`);
      continue;
    }
    if (model.contextWindow && remote.context_length && Number(remote.context_length) < Number(model.contextWindow)) {
      failures.push(`${model.code}: certified context window ${model.contextWindow} exceeds remote ${remote.context_length}`);
    }
    if (model.capabilities?.tools && !supportsParameter(remote, "tools")) {
      failures.push(`${model.code}: tools are certified but not advertised by the current ZDR-compatible catalog entry`);
    }
    if (model.capabilities?.structuredOutput && !supportsParameter(remote, "response_format") && !supportsParameter(remote, "structured_outputs")) {
      failures.push(`${model.code}: structured output is certified but not advertised by the current ZDR-compatible catalog entry`);
    }
  }

  if (failures.length) {
    console.error("OpenRouter certified catalog audit failed:\n- " + failures.join("\n- "));
    process.exit(1);
  }
  console.log(`OpenRouter certified ZDR catalog audit passed for ${certified.length} model(s).`);
} catch (error) {
  const strict = process.env.AI_OPENROUTER_CATALOG_AUDIT_STRICT === "true";
  const message = error instanceof Error ? error.message : String(error);
  if (strict) {
    console.error(`OpenRouter catalog audit unavailable in strict mode: ${message}`);
    process.exit(1);
  }
  console.warn(`OpenRouter catalog audit unavailable; non-strict audit skipped: ${message}`);
}
