/**
 * Independently reviewed READ-only remote tool names for Google Workspace
 * Developer Preview MCP servers. A binding is never approved by name alone:
 * live discovery, pinned schema hashes, OAuth scopes, RBAC and Tool Gateway
 * are required on every real call. Unlisted or mutating tool names are denied.
 *
 * References:
 * https://developers.google.com/workspace/gmail/api/reference/mcp
 * https://developers.google.com/workspace/calendar/api/v3/reference/mcp
 */
const REVIEWED_GOOGLE_MCP_READ_TOOL_NAMES: Record<string, ReadonlySet<string>> = {
  GOOGLE_GMAIL_OFFICIAL: new Set([
    "get_message",
    "get_thread",
    "list_drafts",
    "list_labels",
    "search_threads",
  ]),
  GOOGLE_CALENDAR_OFFICIAL: new Set([
    "get_event",
    "list_calendars",
    "list_events",
    "search_events",
  ]),
};

export function isApprovedMcpReadToolName(serverCode: string, toolName: string): boolean {
  const restricted = REVIEWED_GOOGLE_MCP_READ_TOOL_NAMES[serverCode];
  return restricted ? restricted.has(toolName) : true;
}
