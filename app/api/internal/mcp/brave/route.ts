import { handlePublicBraveMcp } from "@/lib/ai/mcp/public-knowledge-brave-handler";

// Stateless MCP Streamable HTTP via mcp-handler. No public Brave API key.
// Trusted DTSC agents call this exact handler in-process without external WAF.
export const GET = handlePublicBraveMcp;
export const POST = handlePublicBraveMcp;
