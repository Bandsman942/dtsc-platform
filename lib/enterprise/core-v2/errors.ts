export class EnterpriseCoreV2Error extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "ENTERPRISE_CORE_V2_ERROR") {
    super(message);
    this.name = "EnterpriseCoreV2Error";
    this.status = status;
    this.code = code;
  }
}

export function normalizeEnterpriseCoreV2Error(error: unknown) {
  if (error instanceof EnterpriseCoreV2Error) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "ENTERPRISE_CORE_V2_INTERNAL_ERROR",
    message: "Une erreur interne empêche le traitement de cette opération.",
  };
}
