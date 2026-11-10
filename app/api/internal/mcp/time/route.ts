import { handlePublicTimeMcp } from "@/lib/ai/mcp/public-knowledge-time-handler";

// Stateless MCP Streamable HTTP via mcp-handler, protected by its own bearer.
// The same handler is dispatched in-process for trusted DTSC agents.
export const GET = handlePublicTimeMcp;
export const POST = handlePublicTimeMcp;
