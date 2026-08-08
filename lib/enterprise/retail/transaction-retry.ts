const RETRIABLE_TRANSACTION_CODES = new Set(["P2034"]);

function prismaErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isRetriableRetailTransactionError(error: unknown) {
  const code = prismaErrorCode(error);
  if (code && RETRIABLE_TRANSACTION_CODES.has(code)) return true;
  if (!(error instanceof Error)) return false;
  return /write conflict|deadlock|could not serialize access/i.test(error.message);
}

export async function withRetailTransactionRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
) {
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, Math.min(250, options.baseDelayMs ?? 20));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetriableRetailTransactionError(error) || attempt === maxAttempts) throw error;
      const delayMs = baseDelayMs * attempt;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
