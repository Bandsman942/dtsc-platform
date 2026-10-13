import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Emergency denial is checked on every MCP RPC, including discovery and tools/call.
 * Missing policy is an unmodified server-registry default; a database failure
 * must never silently re-enable a globally suspended server.
 */
export async function assertMcpServerNotSuspended(serverCode: string) {
  const control = await prisma.aiMcpControlState.findUnique({
    where: { serverCode },
    select: { suspended: true },
  });
  if (control?.suspended) throw new Error("MCP_SERVER_SUSPENDED_BY_DTSC");
}
