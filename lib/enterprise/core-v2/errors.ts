import { Prisma } from "@prisma/client";

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
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        status: 409,
        code: "ENTERPRISE_CORE_V2_CONFLICT",
        message: "Cette opération entre en conflit avec une modification déjà enregistrée. Actualisez puis réessayez.",
      };
    }
    if (error.code === "P2034") {
      return {
        status: 409,
        code: "ENTERPRISE_CORE_V2_TRANSACTION_CONFLICT",
        message: "Une autre opération a modifié les mêmes données simultanément. Actualisez puis réessayez.",
      };
    }
  }
  return {
    status: 500,
    code: "ENTERPRISE_CORE_V2_INTERNAL_ERROR",
    message: "Une erreur interne empêche le traitement de cette opération.",
  };
}
