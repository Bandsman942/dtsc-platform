import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PHARMACY_CURRENCY_OPTIONS = [
  { code: "USD", label: "Dollar américain", symbol: "$" },
  { code: "CDF", label: "Franc congolais", symbol: "FC" },
  { code: "EUR", label: "Euro", symbol: "€" },
] as const;

type CurrencyInput = { code: string; label?: string; symbol?: string; rateToBase?: number; active?: boolean; isBase?: boolean; reason?: string };

const usdValue: Record<string, number> = { USD: 1, CDF: 1 / 2850, EUR: 1.08 };
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function defaultRateToBase(code: string, baseCurrency: string) {
  if (code === baseCurrency) return 1;
  const from = usdValue[code] || 1;
  const base = usdValue[baseCurrency] || 1;
  return Number((from / base).toFixed(6));
}

export async function ensurePharmacyCurrencyRates(organizationId: string, actorId = "system") {
  const setting = await prisma.pharmacySetting.findUnique({ where: { organizationId }, select: { currency: true } });
  const baseCurrency = setting?.currency || "USD";
  await prisma.$transaction(async (tx) => {
    for (const option of PHARMACY_CURRENCY_OPTIONS) {
      await tx.pharmacyCurrencyRate.upsert({
        where: { organizationId_code: { organizationId, code: option.code } },
        create: { organizationId, code: option.code, label: option.label, symbol: option.symbol, isBase: option.code === baseCurrency, rateToBase: defaultRateToBase(option.code, baseCurrency), updatedById: actorId },
        update: { label: option.label, symbol: option.symbol, isBase: option.code === baseCurrency, rateToBase: option.code === baseCurrency ? 1 : undefined },
      });
    }
  });
  return prisma.pharmacyCurrencyRate.findMany({ where: { organizationId }, orderBy: [{ isBase: "desc" }, { code: "asc" }] });
}

export async function convertPharmacyMoneyToBase(organizationId: string, amount: number, currency?: string | null) {
  const rates = await ensurePharmacyCurrencyRates(organizationId);
  const base = rates.find((rate) => rate.isBase) || rates.find((rate) => rate.code === "USD");
  const requestedCurrency = currency || base?.code || "USD";
  const rate = rates.find((item) => item.code === requestedCurrency && item.active) || rates.find((item) => item.code === base?.code);
  const exchangeRateToBase = Number(rate?.rateToBase || 1);
  return {
    amount: roundMoney(amount),
    currency: requestedCurrency,
    baseCurrency: base?.code || requestedCurrency,
    exchangeRateToBase,
    baseAmount: roundMoney(amount * exchangeRateToBase),
  };
}

export async function updatePharmacyCurrencyRate(organizationId: string, actorId: string, values: CurrencyInput) {
  const code = values.code.trim().toUpperCase();
  const option = PHARMACY_CURRENCY_OPTIONS.find((item) => item.code === code);
  if (!option) throw new Error("UNKNOWN_CURRENCY");
  const rateToBase = values.isBase ? 1 : Number(values.rateToBase || 0);
  if (!Number.isFinite(rateToBase) || rateToBase <= 0) throw new Error("INVALID_RATE");
  return prisma.$transaction(async (tx) => {
    const previous = await tx.pharmacyCurrencyRate.findUnique({ where: { organizationId_code: { organizationId, code } } });
    if (previous?.isBase && !values.isBase) throw new Error("BASE_CURRENCY_REQUIRED");
    if (values.isBase) {
      await tx.pharmacyCurrencyRate.updateMany({ where: { organizationId }, data: { isBase: false } });
      await tx.pharmacySetting.update({ where: { organizationId }, data: { currency: code, updatedById: actorId } });
    }
    const rate = await tx.pharmacyCurrencyRate.upsert({
      where: { organizationId_code: { organizationId, code } },
      create: { organizationId, code, label: values.label?.trim() || option.label, symbol: values.symbol?.trim() || option.symbol, isBase: Boolean(values.isBase), rateToBase, active: values.active ?? true, updatedById: actorId },
      update: { label: values.label?.trim() || option.label, symbol: values.symbol?.trim() || option.symbol, isBase: Boolean(values.isBase), rateToBase, active: values.active ?? true, updatedById: actorId },
    });
    if (values.isBase) {
      for (const available of PHARMACY_CURRENCY_OPTIONS) {
        if (available.code === code) continue;
        await tx.pharmacyCurrencyRate.upsert({
          where: { organizationId_code: { organizationId, code: available.code } },
          create: { organizationId, code: available.code, label: available.label, symbol: available.symbol, isBase: false, rateToBase: defaultRateToBase(available.code, code), updatedById: actorId },
          update: { isBase: false, rateToBase: defaultRateToBase(available.code, code), updatedById: actorId },
        });
      }
    }
    await tx.pharmacySettingsAuditLog.create({
      data: {
        organizationId,
        actorId,
        section: "currencies",
        settingKey: code,
        oldValueJson: json(previous || null),
        newValueJson: json(rate),
        changeReason: values.reason || null,
        criticality: values.isBase ? "CRITICAL" : "NORMAL",
      },
    });
    return rate;
  });
}
