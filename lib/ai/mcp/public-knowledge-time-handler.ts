import { createMcpHandler } from "mcp-handler";
import { withPublicMcpBearer } from "@/lib/ai/mcp/public-knowledge-route-auth";
import { convertTime, convertTimeInput, currentTimeInput, getCurrentTime } from "@/lib/ai/mcp/public-knowledge-time";

// Single source for both the external authenticated MCP route and the local
// in-process MCP dispatch used by DTSC agents on Vercel.
const timeMcp = createMcpHandler((server) => {
  server.registerTool("get_current_time", {
    title: "Current Time",
    description: "Current time in a verified IANA timezone.",
    inputSchema: currentTimeInput,
  }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(getCurrentTime(args)) }],
  }));

  server.registerTool("convert_time", {
    title: "Convert Time",
    description: "Timezone conversion; optionally specify the source date to resolve daylight-saving rules.",
    inputSchema: convertTimeInput,
  }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(convertTime(args)) }],
  }));
});

// Always verify the bearer even on the in-process path. In-process dispatch
// prevents the platform's external bot challenge from blocking itself.
export const handlePublicTimeMcp = withPublicMcpBearer(timeMcp, "MCP_PUBLIC_TIME_TOKEN");
