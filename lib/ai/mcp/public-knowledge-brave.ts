import { z } from "zod";

export const braveSearchInput = z.object({
  query: z.string().trim().min(1).max(400).refine((q) => q.split(/\s+/).length <= 50),
  count: z.number().int().min(1).max(10).default(5),
}).strict();

const API_ROOT = "https://api.search.brave.com/res/v1";
type BraveSearchResponse = { web?: { results?: unknown[] }; results?: unknown[] };

async function readBoundedJson(response: Response, maximumBytes: number): Promise<BraveSearchResponse> {
  if (!response.body) throw new Error("MCP_BRAVE_INVALID_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) throw new Error("MCP_BRAVE_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as BraveSearchResponse;
}

export async function searchBrave(kind: "web" | "news", raw: z.input<typeof braveSearchInput>) {
  const { query, count } = braveSearchInput.parse(raw);
  const key = process.env.BRAVE_API_KEY?.trim();
  if (!key) throw new Error("MCP_BRAVE_CREDENTIAL_NOT_CONFIGURED");
  const path = kind === "web" ? "web/search" : "news/search";
  const url = new URL(`${API_ROOT}/${path}`);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal,
      headers: { "x-subscription-token": key, accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) throw new Error("MCP_BRAVE_AUTH_FAILED");
    if (response.status === 429) throw new Error("MCP_BRAVE_RATE_LIMITED");
    if (!response.ok || response.status >= 300 && response.status < 400) throw new Error("MCP_BRAVE_PROVIDER_UNAVAILABLE");
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("MCP_BRAVE_INVALID_RESPONSE");
    if (Number(response.headers.get("content-length") || "0") > 250_000) throw new Error("MCP_BRAVE_RESPONSE_TOO_LARGE");
    const json = await readBoundedJson(response, 250_000);
    const candidates = kind === "web" ? json.web?.results : json.results;
    if (!Array.isArray(candidates)) throw new Error("MCP_BRAVE_INVALID_RESPONSE");
    const results = candidates.slice(0, count).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      if (typeof value.url !== "string" || !/^https?:\/\//.test(value.url)) return [];
      return [{
        title: typeof value.title === "string" ? value.title.slice(0, 400) : "",
        url: value.url.slice(0, 2048),
        description: typeof value.description === "string" ? value.description.slice(0, 1_500) : "",
        age: typeof value.age === "string" ? value.age.slice(0, 80) : null,
      }];
    });
    return { kind, query, results, untrusted: true };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("MCP_BRAVE_TIMEOUT");
    if (error instanceof SyntaxError) throw new Error("MCP_BRAVE_INVALID_RESPONSE");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
