export class EnterpriseSectorConvergenceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "EnterpriseSectorConvergenceError";
  }
}

export function asSectorConvergenceError(error: unknown) {
  if (error instanceof EnterpriseSectorConvergenceError) return error;
  return new EnterpriseSectorConvergenceError("SECTOR_CONVERGENCE_FAILED", 500);
}
