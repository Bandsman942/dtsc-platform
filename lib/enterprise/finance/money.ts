import { Prisma } from "@prisma/client";

export function enterpriseMoney(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

export function enterpriseMoneyZero() {
  return enterpriseMoney(0);
}

export function enterpriseMoneyMin(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value) {
  const left = enterpriseMoney(a);
  const right = enterpriseMoney(b);
  return left.lte(right) ? left : right;
}

export function enterpriseMoneyString(value: Prisma.Decimal.Value) {
  return enterpriseMoney(value).toFixed(2);
}

export function assertSameCurrency(expected: string, actual: string) {
  return expected.trim().toUpperCase() === actual.trim().toUpperCase();
}
