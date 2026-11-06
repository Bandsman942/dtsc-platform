import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { CONSOLE_SECTION_ADMIN_BLOCK } from "@/lib/console/console-routes";
import {
  getInternalRegisterPage,
  isAllowedInternalRegister,
  isInternalRegisterSection,
} from "@/lib/console/internal-register-page";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ section: string; datasetId: string }> };

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(12),
  search: z.string().trim().max(120).optional(),
  status: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function isValidCalendarDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request, { params }: Params) {
  const { section, datasetId } = await params;
  if (!isInternalRegisterSection(section) || !isAllowedInternalRegister(section, datasetId)) {
    return NextResponse.json({ error: "REGISTER_NOT_FOUND", message: "Registre introuvable." }, { status: 404 });
  }

  const access = await requireAdminBlockAccess(CONSOLE_SECTION_ADMIN_BLOCK[section]!);
  if (!access.session) return access.response;

  const limited = await rateLimit(getRateLimitKey(request, `internal-register:${access.session.userId}`), 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de recherches. Réessayez dans une minute." }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success || (parsed.data.from && !isValidCalendarDate(parsed.data.from)) ||
      (parsed.data.to && !isValidCalendarDate(parsed.data.to)) ||
      (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to)) {
    return NextResponse.json({ error: "INVALID_FILTERS", message: "Vérifiez la page, le statut et les dates demandées." }, { status: 400 });
  }

  try {
    const result = await getInternalRegisterPage({ section, datasetId, ...parsed.data });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[internal-register-page]", section, datasetId, error);
    return NextResponse.json({ error: "REGISTER_READ_FAILED", message: "La consultation de ce registre est momentanément indisponible." }, { status: 500 });
  }
}
