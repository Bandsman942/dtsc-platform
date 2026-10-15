// Execution ownership is server-only, including in mutation responses.
export function publicWorkflowRun<T extends { executionToken?: string | null; executionLeaseUntil?: Date | null }>(run: T): Omit<T, "executionToken" | "executionLeaseUntil"> {
  const visible = { ...run };
  delete visible.executionToken;
  delete visible.executionLeaseUntil;
  return visible;
}
