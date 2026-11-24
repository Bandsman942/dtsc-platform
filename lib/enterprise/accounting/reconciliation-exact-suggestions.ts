type Amount = { toString(): string };
type Line = { id: string; reference: string | null; transactionDate: Date; currencyCode: string; debit: Amount; credit: Amount; reconciliationStatus: string };
type Transaction = { id: string; reference: string | null; transactionDate: Date; currencyCode: string; direction: string; amount: Amount };
export type ExactReconciliationSuggestion = { bankStatementLineId: string; treasuryTransactionId: string; matchedAmount: string; reference: string; transactionDate: string; currencyCode: string };
function moneyKey(value: Amount) {
  const text = value.toString();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6,"0"));
}
function key(reference: string | null, date: Date, currency: string, direction: string, amount: bigint) {
  // No fuzzy reference normalization: punctuation can identify different transfers.
  const normalized = reference?.trim();
  if (!normalized || amount <= 0n) return null;
  return JSON.stringify([normalized, date.toISOString().slice(0,10), currency, direction, amount.toString()]);
}
/** Read-only, exact and mutually unique proposals. Never silently select ambiguous candidates. */
export function suggestExactReconciliationMatches(lines: Line[], transactions: Transaction[]): ExactReconciliationSuggestion[] {
  const lineIndex = new Map<string, Line[]>();
  const transactionIndex = new Map<string, Transaction[]>();
  for (const line of lines) {
    if (line.reconciliationStatus !== "UNMATCHED") continue;
    const debit = moneyKey(line.debit), credit = moneyKey(line.credit);
    if (debit === null || credit === null || (debit > 0n) === (credit > 0n)) continue;
    const k = key(line.reference, line.transactionDate, line.currencyCode, credit > 0n ? "INBOUND" : "OUTBOUND", credit > 0n ? credit : debit);
    if (k) lineIndex.set(k,[...(lineIndex.get(k) || []),line]);
  }
  for (const transaction of transactions) {
    const amount = moneyKey(transaction.amount);
    if (amount === null || !["INBOUND","OUTBOUND"].includes(transaction.direction)) continue;
    const k = key(transaction.reference, transaction.transactionDate, transaction.currencyCode, transaction.direction, amount);
    if (k) transactionIndex.set(k,[...(transactionIndex.get(k) || []),transaction]);
  }
  const result: ExactReconciliationSuggestion[] = [];
  for (const [k, group] of lineIndex) {
    const candidates = transactionIndex.get(k);
    if (group.length !== 1 || candidates?.length !== 1) continue;
    const line = group[0], transaction = candidates[0];
    result.push({ bankStatementLineId: line.id, treasuryTransactionId: transaction.id, matchedAmount: transaction.amount.toString(), reference: transaction.reference!, transactionDate: transaction.transactionDate.toISOString(), currencyCode: transaction.currencyCode });
  }
  return result;
}
