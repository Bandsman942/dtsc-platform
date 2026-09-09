export class ManufacturingDomainError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, statusCode = 400, code = "MANUFACTURING_ERROR") {
    super(message);
    this.name = "ManufacturingDomainError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ManufacturingConflictError extends ManufacturingDomainError {
  constructor(message = "Cette donnée de production a été modifiée. Rechargez puis réessayez.", code = "MANUFACTURING_REVISION_CONFLICT") {
    super(message, 409, code);
  }
}
