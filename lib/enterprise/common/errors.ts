export class EnterpriseDomainError extends Error {
  constructor(public readonly code: string, public readonly status = 400, message = code) {
    super(message);
    this.name = "EnterpriseDomainError";
  }
}

export class EnterpriseDomainConflictError extends EnterpriseDomainError {
  constructor(code = "REVISION_CONFLICT", message = "La donnée a été modifiée par un autre utilisateur.") {
    super(code, 409, message);
    this.name = "EnterpriseDomainConflictError";
  }
}
