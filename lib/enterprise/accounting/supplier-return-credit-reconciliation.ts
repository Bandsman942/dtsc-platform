import { Prisma, type EnterpriseSupplierInvoiceItem, type EnterpriseSupplierCreditNoteItem, type EnterpriseSupplierReturnRequest } from "@prisma/client";
import { allocateHistoricalCreditLines } from "@/lib/enterprise/accounting/historical-credit-tax";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { resolveSemanticPostingAccount } from "@/lib/enterprise/accounting/semantic-account-resolver";
import { formatEnterpriseBusinessDate, getEnterpriseBusinessContext } from "@/lib/enterprise/business-context";

const fail = () => { throw new EnterpriseAccountingError("SUPPLIER_RETURN_CREDIT_RECONCILIATION_REQUIRED", 409); };

/** All payable-changing paths serialize on the same parent invoice, including
 * dispatch. The original debt remains legally open until the credit posts. */
export async function lockSupplierReturnInvoiceTx(tx: Prisma.TransactionClient, organizationId: string, invoiceId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
}

type PayableCapacityInput = { outstandingAmount: Prisma.Decimal; currencyCode: string };
type ReservedReturn = { totalCost: Prisma.Decimal; recoverableTaxAmount: Prisma.Decimal; currencyCode: string; settlementPayableAmount?: Prisma.Decimal|null; settlementClaimAmount?: Prisma.Decimal|null };

export function supplierReturnPayableCapacity(payable: PayableCapacityInput, pending: ReservedReturn[]) {
  if (pending.some(row => row.currencyCode !== payable.currencyCode)) return fail();
  const reserved = pending.reduce((sum,row) => {
    const gross=row.totalCost.plus(row.recoverableTaxAmount);
    if(row.settlementClaimAmount?.gt(0)){
      if(!row.settlementPayableAmount || row.settlementPayableAmount.lt(0) || !row.settlementPayableAmount.plus(row.settlementClaimAmount).equals(gross)) return fail();
      return sum.plus(row.settlementPayableAmount);
    }
    return sum.plus(gross);
  },new Prisma.Decimal(0));
  return { reserved, available:Prisma.Decimal.max(0,payable.outstandingAmount.minus(reserved)) };
}

/** Page-bounded summary, never expose return motives or approval identities
 * to a Finance-only reader. Call inside the same snapshot as the balances. */
export async function supplierReturnFinanceProjectionTx(tx: Prisma.TransactionClient, organizationId: string, invoiceIds: string[]) {
  if (!invoiceIds.length) return new Map<string, { id:string; reference:string; status:string; purchaseId:string; sourceMovementId:string; totalCost:Prisma.Decimal; recoverableTaxAmount:Prisma.Decimal; currencyCode:string; supplierCreditNoteId:string|null; settlementPayableAmount:Prisma.Decimal|null; settlementClaimAmount:Prisma.Decimal|null }>();
  const rows = await tx.enterpriseSupplierReturnRequest.findMany({where:{organizationId,supplierInvoiceId:{in:invoiceIds},status:{in:["DISPATCHED","RECONCILED"]}},
    orderBy:[{status:"asc"},{dispatchedAt:"desc"},{id:"desc"}],
    select:{id:true,supplierInvoiceId:true,reference:true,status:true,purchaseId:true,sourceMovementId:true,totalCost:true,recoverableTaxAmount:true,currencyCode:true,supplierCreditNoteId:true,settlementPayableAmount:true,settlementClaimAmount:true}});
  // DISPATCHED sorts before RECONCILED; retain the active reservation or latest closed return.
  return new Map(rows.slice().reverse().map(row=>[row.supplierInvoiceId,row]));
}

export async function assertSupplierPaymentCapacityTx(tx: Prisma.TransactionClient, organizationId: string, payable: { supplierInvoiceId: string; outstandingAmount: Prisma.Decimal; currencyCode: string }, amount: Prisma.Decimal) {
  const pending = await tx.enterpriseSupplierReturnRequest.findMany({ where: { organizationId, supplierInvoiceId: payable.supplierInvoiceId, status: "DISPATCHED" }, select: { totalCost: true, recoverableTaxAmount: true, currencyCode: true, settlementPayableAmount:true, settlementClaimAmount:true } });
  if (!pending.length) return;
  const { reserved, available } = supplierReturnPayableCapacity(payable, pending);
  if (amount.gt(available)) throw new EnterpriseAccountingError("SUPPLIER_RETURN_PAYABLE_RESERVED", 409, { reservedAmount: reserved.toFixed(), allocatableAmount: available.toFixed(), currencyCode: payable.currencyCode });
}


type PriorCreditCoordinates = {
  supplierInvoiceId: string; sourceMovementId: string; originCostLayerId: string;
  receiptAccountingEventId: string; original: EnterpriseSupplierInvoiceItem; currencyCode: string;
  currentCreditId?: string;
  // Optional only for ordinary, same-cost sibling lots of the SAME receipt line.
  receiptScope?: { receiptId: string; receiptItemId: string; purchaseId: string; inventoryItemId: string; warehouseId: string; supplierId: string };
};

/** Only sequential returns against the SAME proven receipt and invoice line
 * can reopen this workflow. An ordinary sibling lot additionally requires its
 * own immutable origin movement, cost layer, receipt valuation and journal.
 * Capitalized and unrelated receipt lines remain excluded from that extension.
 * A generic credit, reversed evidence or uncredited dispatch is not proof.
 * All consumers use the same
 * Serializable/RepeatableRead transaction and the invoice lock on writes. */
export async function readPriorReconciledSupplierReturnCreditsTx(
  tx: Prisma.TransactionClient, organizationId: string, input: PriorCreditCoordinates,
  existing?: EnterpriseSupplierReturnRequest[],
): Promise<EnterpriseSupplierCreditNoteItem[]> {
  const prior = existing || await tx.enterpriseSupplierReturnRequest.findMany({
    where:{organizationId,supplierInvoiceId:input.supplierInvoiceId,status:"RECONCILED"},
    orderBy:[{dispatchedAt:"asc"},{id:"asc"}],
  });
  if (!prior.length) return [];
  // Claim history needs cumulative settlement provenance; fail closed for now.
  if (prior.some(row=>row.settlementClaimAmount?.gt(0))) return fail();
  if (prior.some(r=>r.organizationId!==organizationId || r.status!=="RECONCILED" ||
      r.supplierInvoiceId!==input.supplierInvoiceId || r.supplierInvoiceItemId!==input.original.id ||
      (!input.receiptScope && (r.sourceMovementId!==input.sourceMovementId || r.originCostLayerId!==input.originCostLayerId ||
        r.receiptAccountingEventId!==input.receiptAccountingEventId)) ||
      (input.receiptScope && (r.receiptId!==input.receiptScope.receiptId || r.receiptItemId!==input.receiptScope.receiptItemId ||
        r.purchaseId!==input.receiptScope.purchaseId || r.inventoryItemId!==input.receiptScope.inventoryItemId ||
        r.warehouseId!==input.receiptScope.warehouseId || r.supplierId!==input.receiptScope.supplierId)) || r.currencyCode!==input.currencyCode ||
      !r.dispatchedAt || !r.dispatchMovementId || !r.dispatchAccountingEventId || !r.supplierCreditNoteId ||
      !r.supplierCreditReference || !r.creditJournalEntryId || !r.reconciledAt || !r.quantity.gt(0))) return fail();
  const siblings=prior.filter(r=>r.sourceMovementId!==input.sourceMovementId);
  if(prior.some(r=>r.sourceMovementId===input.sourceMovementId &&
    (r.originCostLayerId!==input.originCostLayerId || r.receiptAccountingEventId!==input.receiptAccountingEventId))) return fail();
  if(siblings.length){
    if(!input.receiptScope || (input.original.taxAmount.gt(0) && !input.original.taxRecoveryRequested))return fail();
    const scope=input.receiptScope;
    // Read all prior sibling origins once, and preserve per-movement quantity
    // caps independently from the cumulative invoice-line tax/credit cap.
    const sourceIds=[...new Set(siblings.map(r=>r.sourceMovementId))];
    const [origins,originLayers,originEvents,receiptLine]=await Promise.all([
      tx.enterpriseStockMovement.findMany({where:{organizationId,id:{in:sourceIds},sourceEntityType:"EnterprisePurchaseReceipt",sourceEntityId:scope.receiptId,sourceLineId:scope.receiptItemId,inventoryItemId:scope.inventoryItemId,warehouseId:scope.warehouseId,movementType:"PURCHASE_RECEIPT",direction:"IN"}}),
      tx.enterpriseInventoryCostLayer.findMany({where:{organizationId,sourceMovementId:{in:sourceIds},inventoryItemId:scope.inventoryItemId,warehouseId:scope.warehouseId}}),
      tx.enterpriseInventoryAccountingEvent.findMany({where:{organizationId,stockMovementId:{in:sourceIds},inventoryItemId:scope.inventoryItemId,eventType:"RECEIPT",status:"POSTED",journalEntryId:{not:null}}}),
      tx.enterprisePurchaseReceiptItem.findFirst({where:{organizationId,id:scope.receiptItemId,receiptId:scope.receiptId}}),
    ]);
    if(!receiptLine || !receiptLine.quantityReceived.equals(input.original.quantity) ||
      [origins,originLayers,originEvents].some(rows=>rows.length!==sourceIds.length))return fail();
    const originJournals=await tx.enterpriseJournalEntry.findMany({where:{organizationId,id:{in:originEvents.flatMap(e=>e.journalEntryId?[e.journalEntryId]:[])}}});
    const [supplements,reversed]=await Promise.all([
      tx.enterpriseInventoryAcquisitionCostSupplement.count({where:{organizationId,costLayerId:{in:originLayers.map(l=>l.id)}}}),
      tx.enterpriseJournalReversal.count({where:{organizationId,originalEntryId:{in:originJournals.map(j=>j.id)}}}),
    ]);
    if(supplements||reversed||originJournals.length!==sourceIds.length)return fail();
    for(const origin of origins){
      const rows=siblings.filter(r=>r.sourceMovementId===origin.id);
      const layer=originLayers.find(l=>l.sourceMovementId===origin.id);
      const event=originEvents.find(e=>e.stockMovementId===origin.id);
      const journal=originJournals.find(j=>j.id===event?.journalEntryId);
      const returned=rows.reduce((sum,r)=>sum.plus(r.quantity),new Prisma.Decimal(0));
      if(!layer||!event||!journal||!origin.stockLotId||!origin.quantity.gt(0)||returned.gt(origin.quantity)||
        rows.some(r=>r.originCostLayerId!==layer.id||r.receiptAccountingEventId!==event.id||
          r.stockLotId!==origin.stockLotId||r.storageLocationId!==origin.storageLocationId||
          !r.unitCost.equals(input.original.unitPrice))||
        layer.valuationMethod!=="WEIGHTED_AVERAGE"||layer.currencyCode!==input.currencyCode||
        !layer.quantity.equals(origin.quantity)||!layer.unitCost.equals(input.original.unitPrice)||
        !layer.totalCost.equals(origin.quantity.times(layer.unitCost).toDecimalPlaces(6,Prisma.Decimal.ROUND_HALF_UP))||
        event.currencyCode!==input.currencyCode||!event.quantity.equals(origin.quantity)||
        !event.unitCost.equals(layer.unitCost)||!event.totalCost.equals(layer.totalCost)||
        journal.status!=="POSTED"||!journal.postedAt||journal.reversedAt||journal.reversalOfEntryId||
        journal.sourceEntityType!=="EnterpriseInventoryAccountingEvent"||journal.sourceEntityId!==event.id||
        journal.postingEvent!=="INVENTORY_RECEIPT_VALUED"||journal.postingVersion!==1||
        journal.functionalCurrencyCode!==input.currencyCode||!journal.totalDebit.equals(event.totalCost)||!journal.totalCredit.equals(event.totalCost))return fail();
    }
  }
  const creditIds=prior.map(r=>r.supplierCreditNoteId!);
  const [invoice,payable,notes,lines,movements,events,creditJournals,allocations] = await Promise.all([
    tx.enterpriseSupplierInvoice.findFirst({where:{organizationId,id:input.supplierInvoiceId}}),
    tx.enterprisePayable.findFirst({where:{organizationId,supplierInvoiceId:input.supplierInvoiceId}}),
    tx.enterpriseSupplierCreditNote.findMany({where:{organizationId,supplierInvoiceId:input.supplierInvoiceId,
      status:{notIn:["REJECTED","CANCELLED"]},...(input.currentCreditId?{id:{not:input.currentCreditId}}:{})}}),
    tx.enterpriseSupplierCreditNoteItem.findMany({where:{organizationId,supplierCreditNoteId:{in:creditIds}}}),
    tx.enterpriseStockMovement.findMany({where:{organizationId,id:{in:prior.map(r=>r.dispatchMovementId!)}}}),
    tx.enterpriseInventoryAccountingEvent.findMany({where:{organizationId,id:{in:prior.map(r=>r.dispatchAccountingEventId!)}}}),
    tx.enterpriseJournalEntry.findMany({where:{organizationId,id:{in:prior.map(r=>r.creditJournalEntryId!)}}}),
    tx.enterprisePayableAllocation.findMany({where:{organizationId,sourceType:"SUPPLIER_CREDIT_NOTE",sourceId:{in:creditIds}}}),
  ]);
  if (!invoice || !payable || invoice.currencyCode!==input.currencyCode || payable.currencyCode!==input.currencyCode ||
      !invoice.outstandingAmount.equals(payable.outstandingAmount) ||
      [notes,lines,movements,events,creditJournals,allocations].some(list=>list.length!==prior.length)) return fail();
  const dispatchJournals=await tx.enterpriseJournalEntry.findMany({where:{organizationId,id:{in:events.flatMap(e=>e.journalEntryId?[e.journalEntryId]:[])}}});
  const reversals=await tx.enterpriseJournalReversal.count({where:{organizationId,originalEntryId:{in:[...creditJournals,...dispatchJournals].map(j=>j.id)}}});
  if(dispatchJournals.length!==prior.length || reversals) return fail();
  const taxRows=await tx.enterpriseTaxLine.findMany({where:{organizationId,sourceEntityType:"EnterpriseSupplierCreditNoteItem",sourceEntityId:{in:lines.map(l=>l.id)}}});
  const accumulated:EnterpriseSupplierCreditNoteItem[]=[];
  let credited=new Prisma.Decimal(0);
  const validJournal=(j:typeof creditJournals[number]|undefined,type:string,id:string,postingEvent:string,amount:Prisma.Decimal)=>
    j && j.status==="POSTED" && j.postedAt && !j.reversedAt && !j.reversalOfEntryId &&
    j.sourceEntityType===type && j.sourceEntityId===id && j.postingEvent===postingEvent && j.postingVersion===1 &&
    j.functionalCurrencyCode===input.currencyCode && j.totalDebit.equals(amount) && j.totalCredit.equals(amount);
  for(const r of prior){
    const note=notes.find(n=>n.id===r.supplierCreditNoteId), line=lines.find(l=>l.supplierCreditNoteId===note?.id);
    const movement=movements.find(m=>m.id===r.dispatchMovementId), event=events.find(e=>e.id===r.dispatchAccountingEventId);
    const gross=r.totalCost.plus(r.recoverableTaxAmount);
    const allocation=allocations.find(a=>a.sourceId===note?.id);
    if(!note || note.status!=="POSTED" || !note.postedAt || !note.approvedByUserId || note.approvedByUserId===note.createdByUserId ||
      note.currencyCode!==input.currencyCode || !line || line.sourceInvoiceItemId!==input.original.id ||
      line.catalogItemId!==input.original.catalogItemId || !line.quantity.equals(r.quantity) || !line.unitPrice.equals(input.original.unitPrice) ||
      !note.grandTotal.equals(gross) || !line.totalAmount.equals(gross) ||
      !note.subtotal.equals(line.netAmount) || !note.taxTotal.equals(line.taxAmount) ||
      !movement || movement.sourceEntityType!=="EnterpriseSupplierReturnRequest" || movement.sourceEntityId!==r.id ||
      movement.movementType!=="SUPPLIER_RETURN_OUT" || movement.direction!=="OUT" ||
      movement.inventoryItemId!==r.inventoryItemId || movement.warehouseId!==r.warehouseId ||
      movement.stockLotId!==r.stockLotId || movement.storageLocationId!==r.storageLocationId || !movement.quantity.equals(r.quantity) ||
      !event || event.status!=="POSTED" || event.eventType!=="SUPPLIER_RETURN" || event.stockMovementId!==movement.id ||
      event.inventoryItemId!==r.inventoryItemId || event.currencyCode!==input.currencyCode || !event.quantity.equals(r.quantity) ||
      !event.unitCost.equals(r.unitCost) || !event.totalCost.equals(r.totalCost) ||
      !validJournal(dispatchJournals.find(j=>j.id===event.journalEntryId),"EnterpriseInventoryAccountingEvent",event.id,"INVENTORY_SUPPLIER_RETURN_VALUED",r.totalCost) ||
      !validJournal(creditJournals.find(j=>j.id===r.creditJournalEntryId),"EnterpriseSupplierCreditNote",note.id,"SUPPLIER_CREDIT_NOTE_POSTED",gross) ||
      !allocation || allocation.payableId!==payable.id || allocation.status!=="CONFIRMED" || allocation.reversedAt || !allocation.amount.equals(gross)) return fail();
    const [expected]=allocateHistoricalCreditLines([input.original],accumulated,[{sourceInvoiceItemId:input.original.id,description:input.original.description,quantity:r.quantity.toFixed(),unitPrice:input.original.unitPrice.toFixed()}],note.creditDate);
    if (!line.netAmount.equals(expected.netAmount)||!line.taxAmount.equals(expected.taxAmount)||!line.totalAmount.equals(expected.totalAmount)||
        line.taxRecoveryRequested!==expected.taxRecoveryRequested ||
        (line.taxRecoveryRequested ? !r.totalCost.equals(line.netAmount)||!r.recoverableTaxAmount.equals(line.taxAmount) :
          !r.totalCost.equals(line.totalAmount)||!r.recoverableTaxAmount.isZero())) return fail();
    const postedTax=taxRows.filter(t=>t.sourceEntityId===line.id);
    if(postedTax.length!==expected.taxBreakdown.length) return fail();
    if(expected.taxBreakdown.length){
      if(!Array.isArray(line.taxBreakdownJson)||line.taxBreakdownJson.length!==expected.taxBreakdown.length) return fail();
      for(const [index,expectedTax] of expected.taxBreakdown.entries()){
        const actual=line.taxBreakdownJson[index];
        const tax=postedTax.find(t=>t.taxCodeId===expectedTax.taxCodeId&&t.applicationOrder===expectedTax.applicationOrder);
        if(!actual||typeof actual!=="object"||Array.isArray(actual)||Object.entries(expectedTax).some(([key,value])=>actual[key]!==value)||
          !tax||tax.direction!==(line.taxRecoveryRequested?"INPUT_REVERSAL":"INPUT_NONRECOVERABLE_REVERSAL")||
          tax.currencyCode!==input.currencyCode||!tax.taxAmount.equals(expectedTax.amount)||!tax.taxableAmount.equals(expectedTax.base)||
          !tax.taxRate.equals(expectedTax.rate)||tax.effectiveAt?.toISOString()!==expectedTax.effectiveAt) return fail();
      }
    }
    accumulated.push(line);
    credited=credited.plus(gross);
  }
  if(!invoice.amountCredited.equals(credited)||!payable.creditedAmount.equals(credited)) return fail();
  return accumulated;
}

/** Financial document dates are civil dates stored at UTC midnight, while
 * physical handover is an instant. Never slice the UTC instant as a business day. */
export async function assertSupplierReturnCreditDateTx(tx: Prisma.TransactionClient, organizationId: string, creditDate: Date, dispatchedAt: Date) {
  const { timezone } = await getEnterpriseBusinessContext(tx, organizationId);
  const date = formatEnterpriseBusinessDate(creditDate, "UTC");
  if (creditDate.getTime() !== new Date(date + "T00:00:00.000Z").getTime() ||
      date < formatEnterpriseBusinessDate(dispatchedAt, timezone) ||
      date > formatEnterpriseBusinessDate(new Date(), timezone)) return fail();
  return date;
}

/** Independent standard recoverable VAT applications on the net base.
 * Match each original snapshot to one posted INPUT row. Reject ambiguous
 * duplicates, compound calculations and mixed/nonrecoverable tax treatment.
 * The historical allocation engine, not today's catalog, determines the credit. */
export async function deriveSupplierReturnTaxTx(tx: Prisma.TransactionClient, organizationId: string, original: EnterpriseSupplierInvoiceItem, currencyCode: string, quantity: Prisma.Decimal, date: Date, previous: Parameters<typeof allocateHistoricalCreditLines>[1] = []) {
  return deriveHistoricalSupplierVatTx(tx, organizationId, original, currencyCode, quantity, date, "INPUT", previous);
}

async function deriveHistoricalSupplierVatTx(tx: Prisma.TransactionClient, organizationId: string, original: EnterpriseSupplierInvoiceItem, currencyCode: string, quantity: Prisma.Decimal, date: Date, direction: "INPUT" | "INPUT_NONRECOVERABLE", previous: Parameters<typeof allocateHistoricalCreditLines>[1] = []) {
  if (original.taxAmount.isZero() && direction === "INPUT") return { amount: new Prisma.Decimal(0), breakdown: [] };
  if (!original.taxAmount.gt(0) || original.taxRecoveryRequested !== (direction === "INPUT") || !Array.isArray(original.taxBreakdownJson) ||
      !original.taxBreakdownJson.length || original.taxBreakdownJson.length>(direction === "INPUT" ? 20 : 1) || original.taxCalculationMode !== "NET") return fail();
  const applications = await tx.enterpriseTaxLine.findMany({where:{organizationId,sourceEntityType:"EnterpriseSupplierInvoiceItem",sourceEntityId:original.id},include:{taxCode:{select:{category:true}}}});
  if (applications.length!==original.taxBreakdownJson.length) return fail();
  const byCode=new Map(applications.map(row=>[row.taxCodeId,row]));
  const seen=new Set<string>();
  if(byCode.size!==applications.length)return fail();
  let sourceTax=new Prisma.Decimal(0);
  for(const [index,snapshot] of original.taxBreakdownJson.entries()){
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || typeof snapshot.taxCodeId !== "string" ||
        !snapshot.taxCodeId || seen.has(snapshot.taxCodeId) ||
        typeof snapshot.rate !== "string" || typeof snapshot.amount !== "string" || typeof snapshot.base !== "string" ||
        ![snapshot.rate,snapshot.amount,snapshot.base].every(value=>/^\d+(?:\.\d+)?$/.test(value)) ||
        snapshot.treatment !== "STANDARD" || snapshot.basisMode !== "NET" || typeof snapshot.effectiveAt !== "string" ||
        snapshot.applicationOrder!==index) return fail();
    seen.add(snapshot.taxCodeId);
    const posted=byCode.get(snapshot.taxCodeId);
    if (!posted || posted.direction!==direction || posted.taxCode.category!=="VAT" ||
        posted.currencyCode!==currencyCode || posted.taxTreatment!=="STANDARD" || posted.basisMode!=="NET" ||
        posted.jurisdiction!==snapshot.jurisdiction || posted.templateVersion!==snapshot.templateVersion ||
        posted.evidenceReference!==snapshot.evidenceReference || posted.applicationOrder!==snapshot.applicationOrder ||
        !posted.effectiveAt || posted.effectiveAt.toISOString()!==snapshot.effectiveAt ||
        !posted.taxAmount.gt(0) || !posted.taxAmount.equals(snapshot.amount) ||
        !posted.taxableAmount.equals(original.netAmount) || !posted.taxableAmount.equals(snapshot.base) || !posted.taxRate.equals(snapshot.rate)) return fail();
    sourceTax=sourceTax.plus(posted.taxAmount);
  }
  if(!sourceTax.equals(original.taxAmount))return fail();
  const [credit]=allocateHistoricalCreditLines([original],previous,[{sourceInvoiceItemId:original.id,description:original.description,quantity:quantity.toFixed(),unitPrice:original.unitPrice.toFixed()}],date);
  return {amount:credit.taxAmount,breakdown:credit.taxBreakdown};
}

/**
 * Read-only proof for a prospective cost supplement. The posted tax evidence
 * must already exist in the same transaction as the supplier invoice posting.
 * This is not permission to change a cost layer or dispatch a supplier return:
 * the caller must separately prove receipt provenance, physical quantities,
 * period, journals, absence of consumption and exclusive access to the pool.
 * Do not use a current tax rate or round away an unrepresentable acquisition cost.
 */
export async function deriveNonRecoverableInventoryCostTx(
  tx: Prisma.TransactionClient, organizationId: string, original: EnterpriseSupplierInvoiceItem,
  currencyCode: string, receipt: { quantity: Prisma.Decimal; unitCost: Prisma.Decimal; totalCost: Prisma.Decimal }, date: Date,
) {
  const max = new Prisma.Decimal("99999999999999.999999");
  const validPositive = (value: Prisma.Decimal) => value.isFinite() && value.gt(0) && value.lte(max) && value.decimalPlaces() <= 6;
  if (!validPositive(receipt.quantity) || !validPositive(receipt.unitCost) || !validPositive(receipt.totalCost) ||
      !validPositive(original.netAmount) || !validPositive(original.taxAmount) ||
      !original.quantity.equals(receipt.quantity) || !original.unitPrice.equals(receipt.unitCost) ||
      !receipt.quantity.times(receipt.unitCost).equals(receipt.totalCost) ||
      !receipt.totalCost.equals(original.netAmount)) return fail();
  const tax = await deriveHistoricalSupplierVatTx(tx, organizationId, original, currencyCode, receipt.quantity, date, "INPUT_NONRECOVERABLE");
  if (!tax.amount.equals(original.taxAmount)) return fail();
  const totalCost = receipt.totalCost.plus(tax.amount);
  const unitCost = totalCost.div(receipt.quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  if (!validPositive(totalCost) || !validPositive(unitCost) || !receipt.quantity.times(unitCost).equals(totalCost)) return fail();
  return { quantity: receipt.quantity, originalUnitCost: receipt.unitCost, originalTotalCost: receipt.totalCost,
    capitalizedTaxAmount: tax.amount, unitCost, totalCost };
}

/** A partial return of an original capitalized layer must exactly allocate
 * both the historical net and tax. No current rate, rounding residual or
 * second inventory credit is permitted. Bind every proof to the original
 * invoice line, receipt accounting event, cost layer and invoice journal. */
export async function deriveCapitalizedSupplierReturnTx(
  tx: Prisma.TransactionClient, organizationId: string, original: EnterpriseSupplierInvoiceItem,
  proof: import("@prisma/client").EnterpriseInventoryAcquisitionCostSupplement,
  coordinates: { originCostLayerId: string; receiptAccountingEventId: string; invoiceJournalEntryId: string; currencyCode: string; quantity: Prisma.Decimal },
  date: Date,
  previous: Parameters<typeof allocateHistoricalCreditLines>[1] = [],
) {
  if (proof.organizationId !== organizationId || proof.supplierInvoiceItemId !== original.id ||
      proof.costLayerId !== coordinates.originCostLayerId || proof.receiptAccountingEventId !== coordinates.receiptAccountingEventId ||
      proof.invoiceJournalEntryId !== coordinates.invoiceJournalEntryId || proof.currencyCode !== coordinates.currencyCode ||
      !proof.quantity.equals(original.quantity) || !proof.originalUnitCost.equals(original.unitPrice) ||
      !proof.originalTotalCost.equals(original.netAmount) || !proof.capitalizedTaxAmount.equals(original.taxAmount) ||
      !proof.originalTotalCost.plus(proof.capitalizedTaxAmount).equals(proof.totalCost) ||
      !proof.quantity.times(proof.unitCost).equals(proof.totalCost) || original.taxRecoveryRequested ||
      !coordinates.quantity.gt(0) || coordinates.quantity.gt(proof.quantity)) return fail();
  const fiscal = await tx.enterpriseTaxLine.findFirst({ where: { organizationId, id: proof.taxLineId, sourceEntityType: "EnterpriseSupplierInvoiceItem",
    sourceEntityId: original.id, currencyCode: proof.currencyCode, direction: "INPUT_NONRECOVERABLE" }, select: { id: true, effectiveAt: true } });
  if (!fiscal?.effectiveAt || fiscal.effectiveAt.getTime() !== proof.effectiveAt.getTime()) return fail();
  const tax = await deriveHistoricalSupplierVatTx(tx, organizationId, original, proof.currencyCode, coordinates.quantity, date, "INPUT_NONRECOVERABLE", previous);
  const net = coordinates.quantity.times(proof.originalUnitCost);
  const gross = coordinates.quantity.times(proof.unitCost);
  if (!tax.amount.gt(0) || net.decimalPlaces() > 6 || gross.decimalPlaces() > 6 ||
      !net.plus(tax.amount).equals(gross)) return fail();
  return { unitPrice: proof.originalUnitCost, net, tax, gross };
}

/** A generic finance-only credit may not change a capitalized invoice.
 * Linked credits are permitted only by the dispatch verifier below. */
export async function assertNoCapitalizedSupplierCreditTx(tx: Prisma.TransactionClient, organizationId: string, supplierInvoiceId: string) {
  const evidence = await tx.enterpriseInventoryAcquisitionCostSupplement.findFirst({
    where: { organizationId, supplierInvoiceItem: { organizationId, supplierInvoiceId } }, select: { id: true },
  });
  if (evidence) throw new EnterpriseAccountingError("INVENTORY_ACQUISITION_COST_DOMAIN_CORRECTION_REQUIRED", 409);
}

type CreditEvidence = {
  id: string; supplierInvoiceId: string; currencyCode: string; grandTotal: Prisma.Decimal; subtotal: Prisma.Decimal; taxTotal: Prisma.Decimal;
  creditDate: Date; createdByUserId: string; approvedByUserId: string | null;
};
type CreditLine = { sourceInvoiceItemId: string | null; catalogItemId: string | null; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal; taxRecoveryRequested: boolean; taxBreakdownJson: Prisma.JsonValue | null };

/** The restricted workflow matches one supplier-issued credit to the exact
 * dispatch value, line, quantity, original accounts and posted source journal.
 * It never treats an unrelated commercial discount as a stock reversal. */
export async function verifySupplierReturnCreditTx(tx: Prisma.TransactionClient, organizationId: string, credit: CreditEvidence, items: CreditLine[]) {
  const dispatched = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, supplierInvoiceId: credit.supplierInvoiceId, status: "DISPATCHED" } });
  if (!dispatched) {
    // Finalized return evidence cannot be posted again at a new posting version.
    const finalized = await tx.enterpriseSupplierReturnRequest.findFirst({where:{organizationId,supplierInvoiceId:credit.supplierInvoiceId,status:"RECONCILED"}});
    if (finalized) return fail();
    await assertNoCapitalizedSupplierCreditTx(tx, organizationId, credit.supplierInvoiceId);
    return null;
  }
  if (dispatched.supplierCreditNoteId !== credit.id || !dispatched.supplierCreditReference || !dispatched.dispatchedAt || !dispatched.dispatchMovementId || !dispatched.dispatchAccountingEventId ||
      !credit.approvedByUserId || credit.createdByUserId === credit.approvedByUserId ||
      credit.currencyCode !== dispatched.currencyCode || !credit.grandTotal.equals(dispatched.totalCost.plus(dispatched.recoverableTaxAmount)) ||
      items.length !== 1) return fail();
  const creditBusinessDate = await assertSupplierReturnCreditDateTx(tx, organizationId, credit.creditDate, dispatched.dispatchedAt);
  if (dispatched.settlementClaimAmount?.gt(0)) {
    const invoice=await tx.enterpriseSupplierInvoice.findFirst({where:{organizationId,id:credit.supplierInvoiceId}});
    if (!invoice) return fail();
    await assertSupplierReturnClaimCreditReadyTx(tx,organizationId,invoice,credit.grandTotal,credit.currencyCode,credit.creditDate,dispatched);
  }
  const item = items[0];
  const [original, movement, event, invoiceJournal, supplement] = await Promise.all([
    tx.enterpriseSupplierInvoiceItem.findFirst({ where: { organizationId, supplierInvoiceId: credit.supplierInvoiceId, id: dispatched.supplierInvoiceItemId } }),
    tx.enterpriseStockMovement.findFirst({ where: { organizationId, id: dispatched.dispatchMovementId, sourceEntityType: "EnterpriseSupplierReturnRequest", sourceEntityId: dispatched.id, direction: "OUT", movementType: "SUPPLIER_RETURN_OUT" } }),
    tx.enterpriseInventoryAccountingEvent.findFirst({ where: { organizationId, id: dispatched.dispatchAccountingEventId, stockMovementId: dispatched.dispatchMovementId, eventType: "SUPPLIER_RETURN", status: "POSTED", journalEntryId: { not:null } } }),
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, sourceEntityType:"EnterpriseSupplierInvoice", sourceEntityId:credit.supplierInvoiceId, postingEvent:"SUPPLIER_INVOICE_POSTED",status:"POSTED" }, include: { lines:true } }),
    tx.enterpriseInventoryAcquisitionCostSupplement.findFirst({ where: { organizationId, supplierInvoiceItem: { organizationId, supplierInvoiceId:credit.supplierInvoiceId } } }),
  ]);
  if (!original || !movement || !event || !event.journalEntryId || !invoiceJournal ||
      item.sourceInvoiceItemId !== original.id || item.catalogItemId !== original.catalogItemId || !item.quantity.equals(dispatched.quantity) || !item.totalAmount.equals(credit.grandTotal) ||
      movement.stockLotId !== dispatched.stockLotId || movement.inventoryItemId !== dispatched.inventoryItemId || movement.warehouseId !== dispatched.warehouseId || !movement.quantity.equals(dispatched.quantity) ||
      event.inventoryItemId !== dispatched.inventoryItemId || !event.quantity.equals(dispatched.quantity) || !event.unitCost.equals(dispatched.unitCost) || !event.totalCost.equals(dispatched.totalCost) || event.currencyCode !== dispatched.currencyCode) return fail();
  const priorReturns=await tx.enterpriseSupplierReturnRequest.findMany({where:{organizationId,supplierInvoiceId:credit.supplierInvoiceId,status:"RECONCILED"},orderBy:[{dispatchedAt:"asc"},{id:"asc"}]});
  const prior=await readPriorReconciledSupplierReturnCreditsTx(tx,organizationId,{supplierInvoiceId:credit.supplierInvoiceId,sourceMovementId:dispatched.sourceMovementId,originCostLayerId:dispatched.originCostLayerId,receiptAccountingEventId:dispatched.receiptAccountingEventId,original,currencyCode:credit.currencyCode,currentCreditId:credit.id,
    ...(supplement?{}:{receiptScope:{receiptId:dispatched.receiptId,receiptItemId:dispatched.receiptItemId,purchaseId:dispatched.purchaseId,inventoryItemId:dispatched.inventoryItemId,warehouseId:dispatched.warehouseId,supplierId:dispatched.supplierId}})},priorReturns);
  const capitalized = supplement ? await deriveCapitalizedSupplierReturnTx(tx, organizationId, original, supplement, {
    originCostLayerId: dispatched.originCostLayerId, receiptAccountingEventId: dispatched.receiptAccountingEventId,
    invoiceJournalEntryId: invoiceJournal.id, currencyCode: credit.currencyCode, quantity: dispatched.quantity,
  }, credit.creditDate, prior) : null;
  const tax = capitalized?.tax || await deriveSupplierReturnTaxTx(tx, organizationId, original, credit.currencyCode, dispatched.quantity, credit.creditDate, prior);
  const net = capitalized?.net || dispatched.totalCost;
  if (!credit.subtotal.equals(net) || !item.netAmount.equals(net) || !credit.taxTotal.equals(tax.amount) ||
      !item.taxAmount.equals(tax.amount) || !item.unitPrice.equals(capitalized?.unitPrice || dispatched.unitCost) ||
      (capitalized ? !dispatched.recoverableTaxAmount.isZero() || !capitalized.gross.equals(dispatched.totalCost) ||
        !supplement!.unitCost.equals(dispatched.unitCost) : !tax.amount.equals(dispatched.recoverableTaxAmount))) return fail();
  if (tax.amount.gt(0) || original.taxAmount.gt(0)) {
    if (item.taxRecoveryRequested !== !capitalized || !Array.isArray(item.taxBreakdownJson) || item.taxBreakdownJson.length!==tax.breakdown.length) return fail();
    for(const [index,expected] of tax.breakdown.entries()){
      const actual=item.taxBreakdownJson[index];
      if (!actual || typeof actual!=="object" || Array.isArray(actual) || Object.entries(expected).some(([key,value])=>actual[key]!==value)) return fail();
    }
  }
  const [journal, clearing, stock, payable] = await Promise.all([
    tx.enterpriseJournalEntry.findFirst({ where: { organizationId, id:event.journalEntryId, sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:event.id,postingEvent:"INVENTORY_SUPPLIER_RETURN_VALUED", status:"POSTED" }, include:{lines:true} }),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"GOODS_RECEIVED_CLEARING",accountingDate:credit.creditDate}),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"INVENTORY",accountingDate:credit.creditDate}),
    resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"ACCOUNTS_PAYABLE",accountingDate:credit.creditDate}),
  ]);
  if (!journal || creditBusinessDate < formatEnterpriseBusinessDate(journal.accountingDate, "UTC") ||
      journal.functionalCurrencyCode !== credit.currencyCode || invoiceJournal.functionalCurrencyCode !== credit.currencyCode ||
      journal.lines.length !== 2 || !journal.lines.some(l=>l.ledgerAccountId===clearing.id&&l.debit.equals(dispatched.totalCost)&&l.credit.isZero()) ||
      !journal.lines.some(l=>l.ledgerAccountId===stock.id&&l.credit.equals(dispatched.totalCost)&&l.debit.isZero()) ||
      !invoiceJournal.lines.some(l=>l.ledgerAccountId===payable.id&&l.credit.gte(credit.grandTotal)&&l.debit.isZero()) ||
      !invoiceJournal.lines.some(l=>l.ledgerAccountId===clearing.id&&l.debit.gte(net)&&l.credit.isZero())) return fail();
  if (original.taxAmount.gt(0)) {
    const taxAccount=capitalized ? stock : await resolveSemanticPostingAccount(tx,{organizationId,mappingKey:"TAX_RECEIVABLE",accountingDate:credit.creditDate});
    if (new Set([taxAccount.id,stock.id,clearing.id,payable.id]).size!==(capitalized ? 3 : 4) ||
        invoiceJournal.lines.length!==3 ||
        !invoiceJournal.lines.some(l=>l.ledgerAccountId===taxAccount.id&&l.debit.equals(original.taxAmount)&&l.credit.isZero()) ||
        !invoiceJournal.lines.some(l=>l.ledgerAccountId===clearing.id&&l.debit.equals(original.netAmount)&&l.credit.isZero()) ||
        !invoiceJournal.lines.some(l=>l.ledgerAccountId===payable.id&&l.credit.equals(original.netAmount.plus(original.taxAmount))&&l.debit.isZero())) return fail();
  }
  return dispatched;
}

/** Called only after the real credit, journal and payable allocation have
 * been posted in the same transaction. */
export async function completeSupplierReturnCreditTx(tx: Prisma.TransactionClient, organizationId: string, credit: CreditEvidence, journalEntryId: string, actorUserId: string) {
  const linked = await tx.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, supplierCreditNoteId: credit.id, supplierInvoiceId:credit.supplierInvoiceId } });
  if (!linked) return;
  if (linked.status !== "DISPATCHED") return fail();
  if(linked.settlementClaimAmount?.gt(0)){
    const journal=await tx.enterpriseJournalEntry.findFirst({where:{organizationId,id:journalEntryId,status:"POSTED",sourceEntityType:"EnterpriseSupplierCreditNote",sourceEntityId:credit.id,postingEvent:"SUPPLIER_CREDIT_NOTE_POSTED",postingVersion:1},include:{lines:true}});
    if(!journal||!journal.postedAt||journal.reversedAt||journal.reversalOfEntryId||journal.functionalCurrencyCode!==credit.currencyCode||
      !journal.totalDebit.equals(credit.grandTotal)||!journal.totalCredit.equals(credit.grandTotal)||
      !journal.lines.some(line=>line.ledgerAccountId===linked.settlementClaimAccountId&&line.debit.equals(linked.settlementClaimAmount!)&&line.credit.isZero()))return fail();
  }
  const updated = await tx.enterpriseSupplierReturnRequest.updateMany({ where:{organizationId,id:linked.id,status:"DISPATCHED",revision:linked.revision,supplierCreditNoteId:credit.id},
    data:{status:"RECONCILED",reconciledAt:new Date(),reconciledByUserId:actorUserId,creditJournalEntryId:journalEntryId,revision:{increment:1}} });
  if (updated.count !== 1) return fail();
}

/** Finance boundary: recheck the frozen financial plan in the credit date. */
export async function assertSupplierReturnClaimCreditReadyTx(tx: Prisma.TransactionClient, organizationId: string,
  invoice: import("@prisma/client").EnterpriseSupplierInvoice, amount: Prisma.Decimal, currencyCode: string, date: Date,
  linked: EnterpriseSupplierReturnRequest) {
  const { assertFrozenSupplierReturnClaimPlanTx }=await import("@/lib/enterprise/accounting/supplier-return-settlement");
  const { EnterpriseDomainError }=await import("@/lib/enterprise/common/errors");
  try { await assertFrozenSupplierReturnClaimPlanTx(tx,organizationId,invoice,amount,currencyCode,date,linked); }
  catch(error) { if(error instanceof EnterpriseDomainError && error.status===409) return fail(); throw error; }
}
