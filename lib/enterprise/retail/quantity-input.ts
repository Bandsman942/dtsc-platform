import { inventoryQuantityMicrounits, isInventoryQuantityInputValid } from "@/lib/enterprise/inventory/quantity-display";

export function isRetailQuantityInputValid(quantity: string, decimalScale: number | undefined) {
  return isInventoryQuantityInputValid(quantity, decimalScale) && Number(quantity) <= 1_000_000;
}

/** Validated Retail quantities fit in a safe integer number of micro-units. */
export function incrementRetailQuantity(quantity: string) {
  return Number(inventoryQuantityMicrounits(quantity) + BigInt(1_000_000)) / 1_000_000;
}
