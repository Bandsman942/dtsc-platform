import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";

export function enterpriseDomainErrorResponse(error: unknown, fallbackCode = "ENTERPRISE_OPERATION_FAILED") {
  if (error instanceof EnterpriseDomainError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "DUPLICATE", message: "Une donnée portant la même clé existe déjà." }, { status: 409 });
  }
  return NextResponse.json({ error: fallbackCode, message: "L’opération n’a pas pu être terminée." }, { status: 400 });
}
