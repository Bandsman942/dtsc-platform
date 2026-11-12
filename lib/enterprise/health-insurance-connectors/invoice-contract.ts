import { z } from "zod";

/** Exact HSL field spellings from the partner's 12 Nov 2026 JSON examples.
 * These are shapes, not a certification of which fields HSL makes mandatory.
 * No automatic defaults for clinical facts, approvals or payments.
 */
const hslString = z.string().max(2000);
const hslNonempty = z.string().trim().min(1).max(300);
const money = z.number().finite().nonnegative();
const qty = z.number().finite().positive();
const integerId = z.number().int().nonnegative();
const timestamp = z.string().datetime({ offset: true });

export const hirmsCptSchema = z.object({
  AutoAssess: hslString,
  Conclusion: hslString,
  ApprovedAmount: money,
  RejectionReason: hslString,
  Description: hslString,
  CPTCode: hslNonempty,
  Benefit: hslString,
  BenefitName: hslString,
  PreAuth: hslString,
  Amount: money,
  Units: qty,
  Date: timestamp,
  DueToClient: money,
  DueToInsurer: money,
  DueToMember: money,
}).strict();

export const hirmsInvoiceItemSchema = z.object({
  Description: hslNonempty,
  Qty: qty,
  Amount: money,
  AssignedTo: hslString,
  ItemId: hslNonempty,
  CPTCode: z.array(hirmsCptSchema).min(1).max(100),
  MemberNumber: hslNonempty,
  IcD10: hslString,
  CPTCode_Code: hslString,
  TreatmentDate: hslString,
  AdmissionDays: integerId,
  PreAuthNo: hslString,
  Notes: hslString,
  AdmissionDate: timestamp,
  DischargeDate: timestamp,
  IsOutPatient: z.boolean(),
  ProviderServiceId: integerId,
  ConsulationId: integerId,
  IsComplete: z.boolean(),
  BenefitId: integerId,
  DocumentId: hslString,
}).strict();

export const hirmsInvoiceSchema = z.object({
  InvoiceID: hslNonempty,
  InvoiceNumber: hslNonempty,
  Currency: z.string().regex(/^[A-Z]{3}$/),
  ConversionRate: z.number().finite().positive(),
  ServiceProviderID: z.number().int().positive(),
  ClaimAmount: z.number().finite().positive(),
  AdjustedAmount: money,
  ApprovedAmount: money,
  PaymentStatus: hslNonempty,
  InvoiceDate: timestamp,
  AssessmentDate: timestamp,
  PaymentDate: timestamp,
  CreatedAt: timestamp,
  SubmitedBy: hslString,
  RecievedBy: hslString,
  SubmitedByEmail: hslString,
  DocumentId: hslString,
  Consultations: hslString,
  NumAuto: hslString,
  Site: hslString,
  JournalizedDate: hslString,
  Type: hslString,
  InvoiceItems: z.array(hirmsInvoiceItemSchema).min(1).max(500),
  ServiceProviders: hslString,
  ScanId: hslString,
  Notes: hslString,
}).strict().superRefine((v,ctx)=>{
  if(v.ApprovedAmount > v.ClaimAmount) ctx.addIssue({code:"custom",path:["ApprovedAmount"],message:"Un montant approuvé ne peut dépasser le montant réclamé sans justificatif."});
  if(new Set(v.InvoiceItems.map(i=>i.ItemId)).size !== v.InvoiceItems.length) ctx.addIssue({code:"custom",path:["InvoiceItems"],message:"ItemId dupliqué."});
  for(const [idx,item] of v.InvoiceItems.entries()){
    if(item.CPTCode.some(code=>code.ApprovedAmount > code.Amount)) ctx.addIssue({code:"custom",path:["InvoiceItems",idx,"CPTCode"],message:"Le montant approuvé de l'acte excède son montant."});
  }
});

export const hirmsInvoiceBulkSchema = z.array(hirmsInvoiceSchema).min(1).max(500)
  .superRefine((invoices,ctx)=>{
    if(new Set(invoices.map(i=>i.InvoiceID)).size !== invoices.length) ctx.addIssue({code:"custom",message:"Une facture apparaît plusieurs fois.",path:[]});
  });
export type HirmsInvoice = z.infer<typeof hirmsInvoiceSchema>;
export type HirmsInvoiceBulk = z.infer<typeof hirmsInvoiceBulkSchema>;

export function parseHirmsInvoicePayload(value: unknown, bulk: boolean) {
  return bulk ? hirmsInvoiceBulkSchema.safeParse(value) : hirmsInvoiceSchema.safeParse(value);
}
