import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { transitionRetailProviderOperation } from "@/lib/enterprise/retail/customer-payments";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { finalizeMobileMoneyAccounting } from "@/lib/enterprise/retail/mobile-money-accounting";
import {
  getRetailPaymentProviderAdapter,
  type RetailPaymentIntent,
  type RetailProviderContext,
  type RetailProviderResult,
} from "@/lib/enterprise/retail/payment-provider-adapter";
import { mobileMoneyCreateSchema, telcoTopupCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createMobileMoneyTransaction, createTelcoTopup } from "@/lib/enterprise/retail/service";
import { prisma } from "@/lib/prisma";

type MobileMoneyInput = z.infer<typeof mobileMoneyCreateSchema>;
type TelcoTopupInput = z.infer<typeof telcoTopupCreateSchema>;

type ConnectedProvider = {
  provider: {
    id: string;
    providerCode: string;
    providerType: string;
    label: string;
  };
  integration: {
    id: string;
    adapterCode: string | null;
    credentialReference: string | null;
    webhookSecretReference: string | null;
    settingsJson: Prisma.JsonValue | null;
    connectionStatus: string;
  };
  context: RetailProviderContext;
  adapter: NonNullable<ReturnType<typeof getRetailPaymentProviderAdapter>>;
};

const PENDING_MOBILE_MONEY = "PENDING_MOBILE_MONEY";
const PENDING_TELCO_TOPUP = "PENDING_TELCO_TOPUP";
const ACTUAL_MOBILE_MONEY = "EnterpriseMobileMoneyTransaction";
const ACTUAL_TELCO_TOPUP = "EnterpriseTelcoTopup";

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as unknown as Record<string, unknown>;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function providerTimeoutMs(settingsJson: Prisma.JsonValue | null | undefined) {
  const raw = jsonRecord(settingsJson).timeoutSeconds;
  const seconds = typeof raw === "number" && Number.isFinite(raw) ? Math.min(1800, Math.max(15, raw)) : 120;
  return seconds * 1000;
}

function providerRetryMs(settingsJson: Prisma.JsonValue | null | undefined) {
  const raw = jsonRecord(settingsJson).retrySeconds;
  const seconds = typeof raw === "number" && Number.isFinite(raw) ? Math.min(900, Math.max(10, raw)) : 30;
  return seconds * 1000;
}

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 900);
  return "Provider call failed";
}

async function resolveConnectedProvider(organizationId: string, providerCode: string, allowedTypes: readonly string[]): Promise<ConnectedProvider | null> {
  const provider = await prisma.enterpriseRetailProvider.findFirst({
    where: { organizationId, providerCode, isActive: true },
    select: { id: true, providerCode: true, providerType: true, label: true },
  });
  if (!provider || !allowedTypes.includes(provider.providerType)) {
    throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_FOUND", 409, { providerCode });
  }

  const integration = await prisma.enterpriseRetailProviderIntegration.findFirst({
    where: { organizationId, providerId: provider.id, archivedAt: null },
    select: {
      id: true,
      adapterCode: true,
      credentialReference: true,
      webhookSecretReference: true,
      settingsJson: true,
      integrationMode: true,
      connectionStatus: true,
    },
  });
  if (!integration || integration.integrationMode !== "CONNECTED") return null;
  if (["NOT_CONFIGURED", "DISCONNECTED"].includes(integration.connectionStatus)) {
    throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_CONNECTED", 409, { providerCode, connectionStatus: integration.connectionStatus });
  }

  const adapter = getRetailPaymentProviderAdapter(integration.adapterCode);
  if (!integration.adapterCode || !adapter) {
    throw new EnterpriseRetailError("RETAIL_PROVIDER_ADAPTER_UNAVAILABLE", 501, { providerCode, adapterCode: integration.adapterCode });
  }

  const context: RetailProviderContext = {
    organizationId,
    providerId: provider.id,
    providerCode: provider.providerCode,
    adapterCode: integration.adapterCode,
    credentialReference: integration.credentialReference,
    webhookSecretReference: integration.webhookSecretReference,
    settings: jsonRecord(integration.settingsJson),
  };
  return { provider, integration, context, adapter };
}

async function getOrCreatePendingOperation(args: {
  organizationId: string;
  actorUserId: string;
  providerId: string;
  operationType: string;
  sourceEntityType: typeof PENDING_MOBILE_MONEY | typeof PENDING_TELCO_TOPUP;
  requestPayload: Record<string, unknown>;
  currencyCode: string;
  amount: number;
  idempotencyKey: string;
  timeoutMs: number;
  retryMs: number;
}) {
  const providerKey = `operator:${args.idempotencyKey}`;
  const existing = await prisma.enterpriseRetailProviderOperation.findFirst({
    where: { organizationId: args.organizationId, idempotencyKey: providerKey },
  });
  if (existing) {
    if (existing.providerId !== args.providerId) throw new EnterpriseRetailError("RETAIL_IDEMPOTENCY_CONFLICT", 409);
    return { operation: existing, idempotent: true };
  }

  const now = Date.now();
  const operation = await prisma.enterpriseRetailProviderOperation.create({
    data: {
      organizationId: args.organizationId,
      providerId: args.providerId,
      operationType: args.operationType,
      sourceEntityType: args.sourceEntityType,
      sourceEntityId: `pending:${args.idempotencyKey}`,
      requestPayloadJson: jsonInput(args.requestPayload),
      currencyCode: args.currencyCode,
      amount: new Prisma.Decimal(args.amount),
      idempotencyKey: providerKey,
      timeoutAt: new Date(now + args.timeoutMs),
      nextRetryAt: new Date(now + args.retryMs),
      createdByUserId: args.actorUserId,
    },
  });
  return { operation, idempotent: false };
}

async function applyProviderResult(organizationId: string, operation: { id: string; revision: number; status: string }, result: RetailProviderResult) {
  if (operation.status === result.status) {
    return prisma.enterpriseRetailProviderOperation.update({
      where: { id: operation.id },
      data: {
        externalReference: result.externalReference || undefined,
        lastErrorCode: result.errorCode || null,
        lastErrorMessage: result.errorMessage || null,
      },
    });
  }
  return transitionRetailProviderOperation(organizationId, operation.id, {
    revision: operation.revision,
    status: result.status,
    externalReference: result.externalReference,
    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,
    reconciled: false,
  });
}

async function initiateProviderOperation(args: {
  connected: ConnectedProvider;
  operation: { id: string; revision: number; status: string; idempotencyKey: string };
  amount: number;
  currencyCode: string;
  clientReference: string;
  metadata: Record<string, string | number | boolean | null>;
}) {
  if (args.operation.status !== "INITIATED") return args.operation;
  const intent: RetailPaymentIntent = {
    operationId: args.operation.id,
    paymentTransactionId: null,
    amount: String(args.amount),
    currencyCode: args.currencyCode,
    clientReference: args.clientReference,
    idempotencyKey: args.operation.idempotencyKey,
    metadata: args.metadata,
  };
  try {
    const result = await args.connected.adapter.initiate(args.connected.context, intent);
    return applyProviderResult(args.connected.context.organizationId, args.operation, result);
  } catch (error) {
    return transitionRetailProviderOperation(args.connected.context.organizationId, args.operation.id, {
      revision: args.operation.revision,
      status: "UNKNOWN",
      externalReference: null,
      errorCode: "PROVIDER_CALL_FAILED",
      errorMessage: safeError(error),
      reconciled: false,
    });
  }
}

export async function finalizeConfirmedRetailOperatorOperation(organizationId: string, operationId: string) {
  const operation = await prisma.enterpriseRetailProviderOperation.findFirst({ where: { id: operationId, organizationId } });
  if (!operation) throw new EnterpriseRetailError("RETAIL_PROVIDER_OPERATION_NOT_FOUND", 404);

  if (operation.sourceEntityType === ACTUAL_MOBILE_MONEY) {
    const transaction = await prisma.enterpriseMobileMoneyTransaction.findFirst({ where: { id: operation.sourceEntityId, organizationId } });
    if (!transaction) return null;
    await finalizeMobileMoneyAccounting(organizationId, operation.createdByUserId, transaction.id);
    return { kind: "MOBILE_MONEY" as const, transaction, idempotent: true };
  }
  if (operation.sourceEntityType === ACTUAL_TELCO_TOPUP) {
    const topup = await prisma.enterpriseTelcoTopup.findFirst({ where: { id: operation.sourceEntityId, organizationId } });
    return topup ? { kind: "TELCO_TOPUP" as const, topup, idempotent: true } : null;
  }
  if (operation.status !== "CONFIRMED") return null;

  const payload = jsonRecord(operation.requestPayloadJson);
  if (operation.sourceEntityType === PENDING_MOBILE_MONEY) {
    const parsed = mobileMoneyCreateSchema.safeParse({
      ...payload,
      ...(operation.externalReference ? { externalReference: operation.externalReference } : {}),
    });
    if (!parsed.success) throw new EnterpriseRetailError("RETAIL_PROVIDER_PAYLOAD_INVALID", 409);
    const result = await createMobileMoneyTransaction(organizationId, operation.createdByUserId, parsed.data);
    await finalizeMobileMoneyAccounting(organizationId, operation.createdByUserId, result.transaction.id);
    await prisma.enterpriseRetailProviderOperation.update({
      where: { id: operation.id },
      data: { sourceEntityType: ACTUAL_MOBILE_MONEY, sourceEntityId: result.transaction.id },
    });
    await prisma.enterpriseRetailProviderIntegration.updateMany({
      where: { organizationId, providerId: operation.providerId, archivedAt: null },
      data: { lastSuccessfulSyncAt: new Date() },
    });
    return { kind: "MOBILE_MONEY" as const, transaction: result.transaction, idempotent: result.idempotent };
  }

  if (operation.sourceEntityType === PENDING_TELCO_TOPUP) {
    const parsed = telcoTopupCreateSchema.safeParse({
      ...payload,
      status: "SUCCESS",
      failureReason: null,
      ...(operation.externalReference ? { externalReference: operation.externalReference } : {}),
    });
    if (!parsed.success) throw new EnterpriseRetailError("RETAIL_PROVIDER_PAYLOAD_INVALID", 409);
    const result = await createTelcoTopup(organizationId, operation.createdByUserId, parsed.data);
    await prisma.enterpriseRetailProviderOperation.update({
      where: { id: operation.id },
      data: { sourceEntityType: ACTUAL_TELCO_TOPUP, sourceEntityId: result.topup.id },
    });
    await prisma.enterpriseRetailProviderIntegration.updateMany({
      where: { organizationId, providerId: operation.providerId, archivedAt: null },
      data: { lastSuccessfulSyncAt: new Date() },
    });
    return { kind: "TELCO_TOPUP" as const, topup: result.topup, idempotent: result.idempotent };
  }

  return null;
}

export async function createConnectedMobileMoneyOperation(organizationId: string, actorUserId: string, input: MobileMoneyInput) {
  const connected = await resolveConnectedProvider(organizationId, input.providerCode, ["MOBILE_MONEY", "BOTH"]);
  if (!connected) return null;
  const payload: Record<string, unknown> = {
    ...input,
    ...(input.occurredAt ? { occurredAt: input.occurredAt.toISOString() } : {}),
  };
  const pending = await getOrCreatePendingOperation({
    organizationId,
    actorUserId,
    providerId: connected.provider.id,
    operationType: `MOBILE_MONEY_${input.transactionType}`,
    sourceEntityType: PENDING_MOBILE_MONEY,
    requestPayload: payload,
    currencyCode: input.currencyCode,
    amount: input.principalAmount,
    idempotencyKey: input.idempotencyKey,
    timeoutMs: providerTimeoutMs(connected.integration.settingsJson),
    retryMs: providerRetryMs(connected.integration.settingsJson),
  });
  const operation = pending.idempotent
    ? pending.operation
    : await initiateProviderOperation({
        connected,
        operation: pending.operation,
        amount: input.principalAmount,
        currencyCode: input.currencyCode,
        clientReference: `mobile-money:${input.idempotencyKey}`,
        metadata: {
          kind: "MOBILE_MONEY",
          transactionType: input.transactionType,
          customerPhone: input.customerPhone,
          customerFeeAmount: input.customerFeeAmount,
          feeCollectionMode: input.feeCollectionMode,
        },
      });
  const finalized = await finalizeConfirmedRetailOperatorOperation(organizationId, operation.id);
  return { mode: "CONNECTED" as const, operation, finalized, idempotent: pending.idempotent };
}

export async function createConnectedTelcoTopupOperation(organizationId: string, actorUserId: string, input: TelcoTopupInput) {
  const connected = await resolveConnectedProvider(organizationId, input.providerCode, ["TELCO", "BOTH"]);
  if (!connected) return null;
  const payload: Record<string, unknown> = {
    ...input,
    status: "SUCCESS",
    failureReason: null,
    ...(input.occurredAt ? { occurredAt: input.occurredAt.toISOString() } : {}),
  };
  const pending = await getOrCreatePendingOperation({
    organizationId,
    actorUserId,
    providerId: connected.provider.id,
    operationType: "TELCO_TOPUP",
    sourceEntityType: PENDING_TELCO_TOPUP,
    requestPayload: payload,
    currencyCode: input.currencyCode,
    amount: input.saleAmount,
    idempotencyKey: input.idempotencyKey,
    timeoutMs: providerTimeoutMs(connected.integration.settingsJson),
    retryMs: providerRetryMs(connected.integration.settingsJson),
  });
  const operation = pending.idempotent
    ? pending.operation
    : await initiateProviderOperation({
        connected,
        operation: pending.operation,
        amount: input.saleAmount,
        currencyCode: input.currencyCode,
        clientReference: `telco-topup:${input.idempotencyKey}`,
        metadata: {
          kind: "TELCO_TOPUP",
          destinationPhone: input.destinationPhone,
          offerLabel: input.offerLabel,
          operatorCost: input.operatorCost,
        },
      });
  const finalized = await finalizeConfirmedRetailOperatorOperation(organizationId, operation.id);
  return { mode: "CONNECTED" as const, operation, finalized, idempotent: pending.idempotent };
}

export async function resolveRetailProviderOperationForWebhook(organizationId: string, providerId: string, explicitOperationId: string | null | undefined, externalReference: string | null | undefined) {
  if (explicitOperationId) {
    return prisma.enterpriseRetailProviderOperation.findFirst({ where: { id: explicitOperationId, organizationId, providerId }, select: { id: true } });
  }
  if (!externalReference) return null;
  return prisma.enterpriseRetailProviderOperation.findFirst({ where: { organizationId, providerId, externalReference }, select: { id: true } });
}

export async function reconcileRetailProviderOperations(organizationId: string, operationId?: string | null, limit = 20) {
  const now = new Date();
  const operations = await prisma.enterpriseRetailProviderOperation.findMany({
    where: {
      organizationId,
      sourceEntityType: { in: [PENDING_MOBILE_MONEY, PENDING_TELCO_TOPUP] },
      status: { in: ["PENDING_PROVIDER", "UNKNOWN"] },
      ...(operationId ? { id: operationId } : { OR: [{ nextRetryAt: { lte: now } }, { timeoutAt: { lte: now } }] }),
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
  });

  const results: Array<{ operationId: string; status: string; finalized: boolean; error?: string }> = [];
  for (const operation of operations) {
    try {
      const provider = await prisma.enterpriseRetailProvider.findFirst({
        where: { id: operation.providerId, organizationId, isActive: true },
        select: { id: true, providerCode: true, providerType: true, label: true },
      });
      const integration = await prisma.enterpriseRetailProviderIntegration.findFirst({
        where: { organizationId, providerId: operation.providerId, integrationMode: "CONNECTED", archivedAt: null },
        select: { adapterCode: true, credentialReference: true, webhookSecretReference: true, settingsJson: true, connectionStatus: true },
      });
      if (!provider || !integration || !integration.adapterCode) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_CONNECTED", 409);
      const adapter = getRetailPaymentProviderAdapter(integration.adapterCode);
      const context: RetailProviderContext = {
        organizationId,
        providerId: provider.id,
        providerCode: provider.providerCode,
        adapterCode: integration.adapterCode,
        credentialReference: integration.credentialReference,
        webhookSecretReference: integration.webhookSecretReference,
        settings: jsonRecord(integration.settingsJson),
      };

      await prisma.enterpriseRetailProviderOperation.update({
        where: { id: operation.id },
        data: { retryCount: { increment: 1 }, nextRetryAt: new Date(Date.now() + providerRetryMs(integration.settingsJson)) },
      });

      if (!adapter?.reconcile) {
        if (operation.status === "PENDING_PROVIDER" && operation.timeoutAt && operation.timeoutAt <= now) {
          const unknown = await transitionRetailProviderOperation(organizationId, operation.id, {
            revision: operation.revision,
            status: "UNKNOWN",
            externalReference: operation.externalReference,
            errorCode: "PROVIDER_TIMEOUT",
            errorMessage: "Provider confirmation timeout reached; reconciliation is required.",
            reconciled: false,
          });
          results.push({ operationId: operation.id, status: unknown.status, finalized: false });
        } else {
          results.push({ operationId: operation.id, status: operation.status, finalized: false });
        }
        continue;
      }

      const intent: RetailPaymentIntent = {
        operationId: operation.id,
        paymentTransactionId: null,
        amount: operation.amount?.toFixed() || "0",
        currencyCode: operation.currencyCode || "",
        clientReference: operation.sourceEntityId,
        idempotencyKey: operation.idempotencyKey,
      };
      const providerResult = await adapter.reconcile(context, intent);
      const updated = await applyProviderResult(organizationId, operation, providerResult);
      const finalized = await finalizeConfirmedRetailOperatorOperation(organizationId, updated.id);
      results.push({ operationId: operation.id, status: updated.status, finalized: Boolean(finalized) });
    } catch (error) {
      if (operation.status === "PENDING_PROVIDER" && operation.timeoutAt && operation.timeoutAt <= now) {
        try {
          const unknown = await transitionRetailProviderOperation(organizationId, operation.id, {
            revision: operation.revision,
            status: "UNKNOWN",
            externalReference: operation.externalReference,
            errorCode: "PROVIDER_RECONCILIATION_FAILED",
            errorMessage: safeError(error),
            reconciled: false,
          });
          results.push({ operationId: operation.id, status: unknown.status, finalized: false, error: safeError(error) });
          continue;
        } catch {
          // Preserve the original failure below if a concurrent actor already moved the operation.
        }
      }
      results.push({ operationId: operation.id, status: operation.status, finalized: false, error: safeError(error) });
    }
  }
  return results;
}