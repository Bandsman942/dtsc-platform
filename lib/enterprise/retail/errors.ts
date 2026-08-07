export class EnterpriseRetailError extends Error {
  constructor(public code: string, public status = 409, public details?: Record<string, unknown>) {
    super(code);
    this.name = "EnterpriseRetailError";
  }
}
