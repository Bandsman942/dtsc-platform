export class EnterpriseAccountingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "EnterpriseAccountingError";
  }
}

export function assertAccounting(condition: unknown, code: string, status = 400, details?: Record<string, unknown>): asserts condition {
  if (!condition) throw new EnterpriseAccountingError(code, status, details);
}
