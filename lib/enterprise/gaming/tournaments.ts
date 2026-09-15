import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertAccountingApprovalCandidate, createAccountingApprovalAssignment } from "@/lib/enterprise/accounting/accounting-approval-service";
import { assertEnterpriseCurrencyActiveTx } from "@/lib/enterprise/accounting/currency-service";
import { financeReference, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import type {
  gamingTournamentCommandSchema,
  gamingTournamentCreateSchema,
  gamingTournamentRegistrationCommandSchema,
  gamingTournamentRegistrationSchema,
  gamingTournamentStationSchema,
  gamingTournamentUpdateSchema,
} from "@/lib/enterprise/gaming/tournament-schemas";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type CreateInput = z.infer<typeof gamingTournamentCreateSchema>;
type UpdateInput = z.infer<typeof gamingTournamentUpdateSchema>;
type CommandInput = z.infer<typeof gamingTournamentCommandSchema>;
type RegisterInput = z.infer<typeof gamingTournamentRegistrationSchema>;
type RegistrationCommandInput = z.infer<typeof gamingTournamentRegistrationCommandSchema>;
type StationInput = z.infer<typeof gamingTournamentStationSchema>;
type Tx = Prisma.TransactionClient;

export class EnterpriseGamingTournamentError extends Error {
  constructor(public code: string, public status = 409, public details?: Record<string, unknown>) {
    super(code);
    this.name = "EnterpriseGamingTournamentError";
  }
}

function reference() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `GT-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  return trimmed || null;
}

function assertDates(startsAt: Date, endsAt: Date, opensAt?: Date | null, closesAt?: Date | null) {
  if (endsAt <= startsAt) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_DATES_INVALID", 400);
  if (closesAt && closesAt > startsAt) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_CLOSE_INVALID", 400);
  if (opensAt && closesAt && opensAt >= closesAt) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_WINDOW_INVALID", 400);
}

async function validateReferencesTx(tx: Tx, organizationId: string, siteId?: string | null, entryCatalogItemId?: string | null) {
  if (siteId) {
    const site = await tx.enterpriseSite.findFirst({ where: { id: siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!site) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_SITE_INVALID", 409);
  }
  if (entryCatalogItemId) {
    const item = await tx.enterpriseCatalogItem.findFirst({ where: { id: entryCatalogItemId, organizationId, status: "ACTIVE", archivedAt: null, itemType: "SERVICE" }, select: { id: true } });
    if (!item) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_ENTRY_ITEM_INVALID", 409);
  }
}

async function loadEntryFeeTx(tx: Tx, organizationId: string, catalogItemId: string) {
  const now = new Date();
  const item = await tx.enterpriseCatalogItem.findFirst({
    where: { id: catalogItemId, organizationId, status: "ACTIVE", archivedAt: null, itemType: "SERVICE" },
    include: {
      prices: {
        where: { status: "ACTIVE", archivedAt: null, priceType: "SALE", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
        orderBy: { effectiveFrom: "desc" },
      },
    },
  });
  if (!item) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_ENTRY_ITEM_INVALID", 409);
  const preferredCurrency = item.currency?.trim().toUpperCase() || null;
  const price = preferredCurrency ? item.prices.find((candidate) => candidate.currency === preferredCurrency) : item.prices[0];
  if (!price) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_ENTRY_PRICE_MISSING", 409);
  if (!preferredCurrency && new Set(item.prices.map((candidate) => candidate.currency)).size > 1) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_ENTRY_CURRENCY_AMBIGUOUS", 409);
  await assertEnterpriseCurrencyActiveTx(tx, organizationId, price.currency);
  let taxCodeId: string | null = null;
  if (price.taxRate && price.taxRate.gt(0)) {
    if (!item.taxCode) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_TAX_CONFIGURATION_REQUIRED", 409);
    const taxCode = await tx.enterpriseTaxCode.findFirst({ where: { organizationId, code: item.taxCode, isActive: true }, select: { id: true } });
    if (!taxCode) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_TAX_CONFIGURATION_REQUIRED", 409);
    taxCodeId = taxCode.id;
  }
  const unitPrice = money(price.amount);
  const taxRate = new Prisma.Decimal(price.taxRate || 0);
  const net = price.taxIncluded && taxRate.gt(0) ? money(unitPrice.div(new Prisma.Decimal(1).plus(taxRate))) : unitPrice;
  const tax = taxRate.gt(0) ? money(net.times(taxRate)) : money(0);
  const total = price.taxIncluded ? unitPrice : money(net.plus(tax));
  return { item, price, taxCodeId, net, tax, total };
}

export async function createGamingTournament(organizationId: string, actorUserId: string, input: CreateInput) {
  const existing = await prisma.enterpriseGamingTournament.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
  if (existing) return { tournament: existing, idempotent: true };
  assertDates(input.startsAt, input.endsAt, input.registrationOpensAt, input.registrationClosesAt);
  try {
    const tournament = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:gaming-tournament:${input.idempotencyKey}`})::bigint)`);
      const retry = await tx.enterpriseGamingTournament.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
      if (retry) return retry;
      await validateReferencesTx(tx, organizationId, clean(input.siteId), clean(input.entryCatalogItemId));
      return tx.enterpriseGamingTournament.create({
        data: {
          organizationId,
          reference: reference(),
          title: input.title,
          description: clean(input.description),
          siteId: clean(input.siteId),
          entryCatalogItemId: clean(input.entryCatalogItemId),
          tournamentFormat: input.tournamentFormat,
          registrationOpensAt: input.registrationOpensAt || null,
          registrationClosesAt: input.registrationClosesAt || null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          maxParticipants: input.maxParticipants || null,
          notes: clean(input.notes),
          idempotencyKey: input.idempotencyKey,
          createdByUserId: actorUserId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { tournament, idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingTournament.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
      if (retry) return { tournament: retry, idempotent: true };
    }
    throw error;
  }
}

export async function listGamingTournaments(organizationId: string, input: { page: number; pageSize: number; status?: string; search?: string }) {
  const page = Math.max(1, Math.trunc(input.page || 1));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(input.pageSize || 20)));
  const where: Prisma.EnterpriseGamingTournamentWhereInput = {
    organizationId,
    archivedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { OR: [{ reference: { contains: input.search, mode: "insensitive" } }, { title: { contains: input.search, mode: "insensitive" } }] } : {}),
  };
  const [items, total, grouped] = await Promise.all([
    prisma.enterpriseGamingTournament.findMany({ where, orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { registrations: true, stationAssignments: true } } } }),
    prisma.enterpriseGamingTournament.count({ where }),
    prisma.enterpriseGamingTournament.groupBy({ by: ["status"], where: { organizationId, archivedAt: null }, _count: { _all: true } }),
  ]);
  return { items, metrics: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])), pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function getGamingTournamentDetail(organizationId: string, tournamentId: string, options: { includeFinance?: boolean } = {}) {
  const tournament = await prisma.enterpriseGamingTournament.findFirst({
    where: { id: tournamentId, organizationId, archivedAt: null },
    include: { registrations: { orderBy: [{ resultRank: "asc" }, { createdAt: "asc" }] }, stationAssignments: { include: { station: true }, orderBy: { slotStartAt: "asc" } }, transitions: { orderBy: { occurredAt: "desc" }, take: 50 } },
  });
  if (!tournament) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_FOUND", 404);
  const partyIds = tournament.registrations.map((row) => row.businessPartyId);
  const invoiceIds = tournament.registrations.map((row) => row.salesInvoiceId).filter((id): id is string => Boolean(id));
  const assetIds = tournament.stationAssignments.map((row) => row.station.assetId);
  const [parties, invoices, assets, site, entryItem] = await Promise.all([
    partyIds.length ? prisma.enterpriseBusinessParty.findMany({ where: { organizationId, id: { in: partyIds } }, select: { id: true, code: true, legalName: true, displayName: true } }) : [],
    options.includeFinance && invoiceIds.length ? prisma.enterpriseSalesInvoice.findMany({ where: { organizationId, id: { in: invoiceIds } }, select: { id: true, number: true, status: true, currencyCode: true, grandTotal: true, outstandingAmount: true } }) : [],
    assetIds.length ? prisma.enterpriseAsset.findMany({ where: { organizationId, id: { in: assetIds } }, select: { id: true, code: true, name: true, status: true, condition: true, siteId: true } }) : [],
    tournament.siteId ? prisma.enterpriseSite.findFirst({ where: { id: tournament.siteId, organizationId }, select: { id: true, code: true, name: true, timezone: true } }) : null,
    tournament.entryCatalogItemId ? prisma.enterpriseCatalogItem.findFirst({ where: { id: tournament.entryCatalogItemId, organizationId }, select: { id: true, code: true, name: true, currency: true } }) : null,
  ]);
  const partyById = new Map(parties.map((party) => [party.id, party]));
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const registrations = tournament.registrations.map((registration) => {
    const invoice = registration.salesInvoiceId ? invoiceById.get(registration.salesInvoiceId) : null;
    const paymentStatus = !registration.salesInvoiceId ? "FREE" : !options.includeFinance ? "RESTRICTED" : invoice?.status === "PAID" ? "PAID" : invoice?.status === "PARTIALLY_PAID" ? "PARTIAL" : ["CANCELLED", "VOIDED"].includes(invoice?.status || "") ? "CANCELLED" : "PENDING";
    return { ...registration, participant: partyById.get(registration.businessPartyId) || null, paymentStatus, invoice: options.includeFinance ? invoice || null : null };
  });
  return {
    tournament: { ...tournament, registrations: undefined, stationAssignments: undefined, transitions: undefined },
    site,
    entryItem,
    registrations,
    stations: tournament.stationAssignments.map((assignment) => ({ ...assignment, asset: assetById.get(assignment.station.assetId) || null })),
    transitions: tournament.transitions,
  };
}

export async function updateGamingTournament(organizationId: string, tournamentId: string, actorUserId: string, input: UpdateInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingTournament" WHERE id = ${tournamentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseGamingTournament.findFirst({ where: { id: tournamentId, organizationId, archivedAt: null } });
    if (!current) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_FOUND", 404);
    if (current.revision !== input.revision) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REVISION_CONFLICT", 409, { currentRevision: current.revision });
    if (!["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(current.status)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_EDITABLE", 409);
    const startsAt = input.startsAt || current.startsAt;
    const endsAt = input.endsAt || current.endsAt;
    const opensAt = input.registrationOpensAt === undefined ? current.registrationOpensAt : input.registrationOpensAt;
    const closesAt = input.registrationClosesAt === undefined ? current.registrationClosesAt : input.registrationClosesAt;
    assertDates(startsAt, endsAt, opensAt, closesAt);
    const siteId = input.siteId === undefined ? current.siteId : clean(input.siteId);
    const entryCatalogItemId = input.entryCatalogItemId === undefined ? current.entryCatalogItemId : clean(input.entryCatalogItemId);
    await validateReferencesTx(tx, organizationId, siteId, entryCatalogItemId);
    return tx.enterpriseGamingTournament.update({ where: { id: tournamentId }, data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: clean(input.description) } : {}),
      ...(input.siteId !== undefined ? { siteId } : {}),
      ...(input.entryCatalogItemId !== undefined ? { entryCatalogItemId } : {}),
      ...(input.tournamentFormat !== undefined ? { tournamentFormat: input.tournamentFormat } : {}),
      ...(input.registrationOpensAt !== undefined ? { registrationOpensAt: input.registrationOpensAt } : {}),
      ...(input.registrationClosesAt !== undefined ? { registrationClosesAt: input.registrationClosesAt } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.maxParticipants !== undefined ? { maxParticipants: input.maxParticipants } : {}),
      ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
      updatedByUserId: actorUserId,
      revision: { increment: 1 },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function commandGamingTournament(organizationId: string, tournamentId: string, actorUserId: string, input: CommandInput) {
  const key = `TOURNAMENT:${tournamentId}:${input.revision}:${input.action}`;
  return prisma.$transaction(async (tx) => {
    const replay = await tx.enterpriseGamingTournamentTransition.findFirst({ where: { organizationId, idempotencyKey: key }, include: { tournament: true } });
    if (replay) return { tournament: replay.tournament, idempotent: true };
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingTournament" WHERE id = ${tournamentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseGamingTournament.findFirst({ where: { id: tournamentId, organizationId, archivedAt: null } });
    if (!current) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_FOUND", 404);
    if (current.revision !== input.revision) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REVISION_CONFLICT", 409, { currentRevision: current.revision });
    const transitions: Record<string, { from: string[]; to: string }> = {
      OPEN_REGISTRATION: { from: ["DRAFT"], to: "REGISTRATION_OPEN" },
      CLOSE_REGISTRATION: { from: ["REGISTRATION_OPEN"], to: "REGISTRATION_CLOSED" },
      START: { from: ["REGISTRATION_OPEN", "REGISTRATION_CLOSED"], to: "IN_PROGRESS" },
      COMPLETE: { from: ["IN_PROGRESS"], to: "COMPLETED" },
      CANCEL: { from: ["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "IN_PROGRESS"], to: "CANCELLED" },
    };
    if (input.action === "ARCHIVE") {
      if (!["COMPLETED", "CANCELLED"].includes(current.status)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_ARCHIVE_FORBIDDEN", 409);
      const archived = await tx.enterpriseGamingTournament.update({ where: { id: current.id }, data: { archivedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
      return { tournament: archived, idempotent: false };
    }
    if (input.action === "UPDATE") throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_UPDATE_PAYLOAD_REQUIRED", 400);
    const transition = transitions[input.action];
    if (!transition || !transition.from.includes(current.status)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_TRANSITION_INVALID", 409);
    if (input.action === "CANCEL" && !clean(input.reason)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_CANCEL_REASON_REQUIRED", 400);
    const updated = await tx.enterpriseGamingTournament.update({ where: { id: current.id }, data: { status: transition.to, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    await tx.enterpriseGamingTournamentTransition.create({ data: { organizationId, tournamentId: current.id, action: input.action, idempotencyKey: key, fromStatus: current.status, toStatus: transition.to, actorUserId, metadataJson: input.reason ? { reason: input.reason } : undefined } });
    return { tournament: updated, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function registerGamingTournamentParticipant(organizationId: string, tournamentId: string, actorUserId: string, input: RegisterInput) {
  const initial = await prisma.enterpriseGamingTournament.findFirst({ where: { id: tournamentId, organizationId, archivedAt: null }, select: { id: true, entryCatalogItemId: true } });
  if (!initial) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_FOUND", 404);
  if (initial.entryCatalogItemId) {
    if (!clean(input.invoiceApproverUserId)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_INVOICE_APPROVER_REQUIRED", 400);
    await assertAccountingApprovalCandidate({ organizationId, targetEntityType: "EnterpriseSalesInvoice", requesterUserId: actorUserId, approverUserId: input.invoiceApproverUserId! });
  }
  const existing = await prisma.enterpriseGamingTournamentRegistration.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey } });
  if (existing) return { registration: existing, idempotent: true };
  try {
    const registration = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:gaming-tournament-registration:${tournamentId}:${input.businessPartyId}`})::bigint)`);
      const retry = await tx.enterpriseGamingTournamentRegistration.findFirst({ where: { organizationId, OR: [{ idempotencyKey: input.idempotencyKey }, { tournamentId, businessPartyId: input.businessPartyId }] } });
      if (retry) return retry;
      const tournament = await tx.enterpriseGamingTournament.findFirst({ where: { id: tournamentId, organizationId, archivedAt: null } });
      if (!tournament) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_FOUND", 404);
      const now = new Date();
      if (tournament.status !== "REGISTRATION_OPEN") throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_CLOSED", 409);
      if (tournament.registrationOpensAt && now < tournament.registrationOpensAt) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_NOT_OPEN_YET", 409);
      if (tournament.registrationClosesAt && now > tournament.registrationClosesAt) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_CLOSED", 409);
      const participant = await tx.enterpriseBusinessParty.findFirst({ where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } }, select: { id: true } });
      if (!participant) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_PARTICIPANT_INVALID", 409);
      if (tournament.maxParticipants) {
        const count = await tx.enterpriseGamingTournamentRegistration.count({ where: { organizationId, tournamentId, status: { notIn: ["WITHDRAWN"] } } });
        if (count >= tournament.maxParticipants) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_FULL", 409);
      }
      let salesInvoiceId: string | null = null;
      if (tournament.entryCatalogItemId) {
        const fee = await loadEntryFeeTx(tx, organizationId, tournament.entryCatalogItemId);
        const invoice = await tx.enterpriseSalesInvoice.create({
          data: {
            organizationId,
            number: financeReference("INV"),
            businessPartyId: participant.id,
            status: "PENDING_APPROVAL",
            invoiceDate: now,
            dueDate: tournament.startsAt,
            currencyCode: fee.price.currency,
            subtotal: fee.net,
            discountTotal: money(0),
            taxTotal: fee.tax,
            grandTotal: fee.total,
            outstandingAmount: fee.total,
            paymentTerms: "Tournament registration",
            notes: `Gaming tournament ${tournament.reference}`,
            createdByUserId: actorUserId,
            items: { create: [{ catalogItemId: fee.item.id, description: fee.item.name, quantity: money(1), unitPrice: fee.net, discountAmount: money(0), netAmount: fee.net, taxCodeId: fee.taxCodeId, taxAmount: fee.tax, totalAmount: fee.total }] },
          },
        });
        salesInvoiceId = invoice.id;
        await createAccountingApprovalAssignment(tx, { organizationId, targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, requesterUserId: actorUserId, approverUserId: input.invoiceApproverUserId! });
        await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: "SALES_INVOICE_SUBMIT", summary: `Customer invoice ${invoice.number}: SUBMIT`, actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL", metadataJson: { source: "GAMING_TOURNAMENT", tournamentId, businessPartyId: participant.id, approverUserId: input.invoiceApproverUserId! } });
      }
      return tx.enterpriseGamingTournamentRegistration.create({ data: { organizationId, tournamentId, businessPartyId: participant.id, salesInvoiceId, seedNumber: input.seedNumber || null, idempotencyKey: input.idempotencyKey, createdByUserId: actorUserId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
    return { registration, idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.enterpriseGamingTournamentRegistration.findFirst({ where: { organizationId, OR: [{ idempotencyKey: input.idempotencyKey }, { tournamentId, businessPartyId: input.businessPartyId }] } });
      if (retry) return { registration: retry, idempotent: true };
    }
    throw error;
  }
}

export async function commandGamingTournamentRegistration(organizationId: string, tournamentId: string, registrationId: string, actorUserId: string, input: RegistrationCommandInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingTournamentRegistration" WHERE id = ${registrationId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const registration = await tx.enterpriseGamingTournamentRegistration.findFirst({ where: { id: registrationId, organizationId, tournamentId } });
    if (!registration) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_NOT_FOUND", 404);
    if (registration.revision !== input.revision) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_REVISION_CONFLICT", 409, { currentRevision: registration.revision });
    const tournament = await tx.enterpriseGamingTournament.findFirst({ where: { id: tournamentId, organizationId, archivedAt: null } });
    if (!tournament) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_FOUND", 404);
    if (input.action === "CHECK_IN") {
      if (registration.status !== "REGISTERED") throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_CHECKIN_INVALID", 409);
      if (registration.salesInvoiceId) {
        const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: registration.salesInvoiceId, organizationId }, select: { status: true } });
        if (invoice?.status !== "PAID") throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_ENTRY_FEE_UNPAID", 409);
      }
      return tx.enterpriseGamingTournamentRegistration.update({ where: { id: registration.id }, data: { status: "CHECKED_IN", checkedInAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    }
    if (input.action === "WITHDRAW") {
      if (!["REGISTERED", "CHECKED_IN"].includes(registration.status)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_WITHDRAW_INVALID", 409);
      return tx.enterpriseGamingTournamentRegistration.update({ where: { id: registration.id }, data: { status: "WITHDRAWN", withdrawnAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    }
    if (input.action === "DISQUALIFY") {
      if (registration.status !== "CHECKED_IN") throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_DISQUALIFY_INVALID", 409);
      return tx.enterpriseGamingTournamentRegistration.update({ where: { id: registration.id }, data: { status: "DISQUALIFIED", disqualifiedAt: new Date(), resultLabel: clean(input.reason) || registration.resultLabel, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    }
    if (input.action === "SET_RESULT") {
      if (!["CHECKED_IN", "DISQUALIFIED"].includes(registration.status)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_RESULT_INVALID", 409);
      return tx.enterpriseGamingTournamentRegistration.update({ where: { id: registration.id }, data: { status: "COMPLETED", resultRank: input.resultRank || null, resultLabel: clean(input.resultLabel), completedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    }
    throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_REGISTRATION_ACTION_INVALID", 400);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assignGamingTournamentStation(organizationId: string, tournamentId: string, actorUserId: string, input: StationInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:gaming-tournament-station:${input.stationId}`})::bigint)`);
    const tournament = await tx.enterpriseGamingTournament.findFirst({ where: { id: tournamentId, organizationId, archivedAt: null } });
    if (!tournament) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_NOT_FOUND", 404);
    if (["COMPLETED", "CANCELLED"].includes(tournament.status)) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_ASSIGNMENT_CLOSED", 409);
    if (input.slotStartAt < tournament.startsAt || input.slotEndAt > tournament.endsAt) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_SLOT_OUTSIDE_EVENT", 409);
    const station = await tx.enterpriseGamingStationProfile.findFirst({ where: { id: input.stationId, organizationId, archivedAt: null }, select: { id: true, assetId: true, status: true } });
    if (!station) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_INVALID", 409);
    const asset = await tx.enterpriseAsset.findFirst({ where: { id: station.assetId, organizationId, archivedAt: null }, select: { id: true, status: true, incidents: { where: { archivedAt: null, status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } }, take: 1, select: { id: true } }, maintenanceRecords: { where: { archivedAt: null, status: "IN_PROGRESS" }, take: 1, select: { id: true } } } });
    if (!asset || asset.status === "DISPOSED" || station.status === "OUT_OF_SERVICE" || asset.incidents.length || asset.maintenanceRecords.length) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_UNAVAILABLE", 409);
    const [otherTournament, booking, liveSession] = await Promise.all([
      tx.enterpriseGamingTournamentStation.findFirst({ where: { organizationId, stationId: station.id, status: "ASSIGNED", tournamentId: { not: tournamentId }, slotStartAt: { lt: input.slotEndAt }, slotEndAt: { gt: input.slotStartAt } }, select: { id: true } }),
      tx.enterpriseGamingBooking.findFirst({ where: { organizationId, stationId: station.id, archivedAt: null, status: { in: ["CONFIRMED", "CHECKED_IN", "CONVERTED"] }, scheduledStartAt: { lt: input.slotEndAt }, scheduledEndAt: { gt: input.slotStartAt } }, select: { id: true } }),
      tx.enterpriseGamingSession.findFirst({ where: { organizationId, stationId: station.id, archivedAt: null, status: { in: ["ACTIVE", "PAUSED"] } }, select: { id: true } }),
    ]);
    if (otherTournament || booking || liveSession) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_CONFLICT", 409);
    const existing = await tx.enterpriseGamingTournamentStation.findFirst({ where: { organizationId, tournamentId, stationId: station.id } });
    if (existing) {
      if (existing.slotStartAt.getTime() === input.slotStartAt.getTime() && existing.slotEndAt.getTime() === input.slotEndAt.getTime() && existing.status === "ASSIGNED") return { assignment: existing, idempotent: true };
      throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_ALREADY_ASSIGNED", 409);
    }
    const assignment = await tx.enterpriseGamingTournamentStation.create({ data: { organizationId, tournamentId, stationId: station.id, slotStartAt: input.slotStartAt, slotEndAt: input.slotEndAt, label: clean(input.label), createdByUserId: actorUserId } });
    return { assignment, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function releaseGamingTournamentStation(organizationId: string, tournamentId: string, assignmentId: string, actorUserId: string, revision: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingTournamentStation" WHERE id = ${assignmentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const assignment = await tx.enterpriseGamingTournamentStation.findFirst({ where: { id: assignmentId, organizationId, tournamentId } });
    if (!assignment) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_ASSIGNMENT_NOT_FOUND", 404);
    if (assignment.revision !== revision) throw new EnterpriseGamingTournamentError("GAMING_TOURNAMENT_STATION_REVISION_CONFLICT", 409, { currentRevision: assignment.revision });
    if (assignment.status === "RELEASED") return { assignment, idempotent: true };
    const updated = await tx.enterpriseGamingTournamentStation.update({ where: { id: assignment.id }, data: { status: "RELEASED", updatedByUserId: actorUserId, revision: { increment: 1 } } });
    return { assignment: updated, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}