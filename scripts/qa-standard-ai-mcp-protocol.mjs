import fs from "node:fs";

const transport = fs.readFileSync("lib/ai/mcp/transport.ts", "utf8");
const schema = fs.readFileSync("lib/ai/mcp/schema.ts", "utf8");
const adapter = fs.readFileSync("lib/ai/mcp/tool-adapter.ts", "utf8");
const failures = [];

for (const marker of [
  'DTSC_MCP_PROTOCOL_VERSION = "2026-07-28"',
  '"MCP-Protocol-Version"',
  '"Mcp-Method"',
  '"Mcp-Name"',
  '"io.modelcontextprotocol/protocolVersion"',
  '"io.modelcontextprotocol/clientInfo"',
  '"io.modelcontextprotocol/clientCapabilities"',
]) {
  if (!transport.includes(marker)) failures.push(`missing current MCP protocol marker ${marker}`);
}
if (transport.includes("Mcp-Session-Id")) failures.push("2026-07-28 baseline must not use retired MCP session IDs");
if (transport.includes('method: "initialize"') || transport.includes("notifications/initialized")) failures.push("2026-07-28 baseline must not use retired initialize handshake");
if (!schema.includes("x-mcp-header") || !schema.includes("Mcp-Param-")) failures.push("MCP tool parameter routing headers must be validated and generated");
if (!adapter.includes("buildMcpParameterHeaders")) failures.push("MCP tools/call must mirror certified x-mcp-header parameters");

if (failures.length) {
  console.error("Standard AI MCP protocol QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Standard AI MCP protocol QA passed");
}
