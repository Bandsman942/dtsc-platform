import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseDomainError, EnterpriseDomainConflictError } from "@/lib/enterprise/common/errors";
import { inspectCustodyRecoveryTx, assertCustodyRecoveryReadAccess } from "@/lib/enterprise/inventory/custody-recovery-preflight";
import { applyStockMovementTx, requireInventoryStockAuthorityTx } from "@/lib/enterprise/inventory/service";
import { idempotencyKey, money, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { getPostingPeriod } from "@/lib/enterprise/accounting/periods";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import { resolveEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { assertInventoryApprovalCandidate, assertInventoryApprovalDecision } from "@/lib/enterprise/inventory/approval";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { retailInventoryVisibleSites } from "@/lib/enterprise/retail/site-access";
import { publishEnterpriseEvent } from "@/lib/enterprise/crm-sales/helpers";

export const RECOVERY_ASSESSMENT_TARGET="EnterpriseInventoryReturnRecoveryAssessment";
const amount=z.string().trim().regex(/^\d{1,12}(?:\.\d{1,6})?$/);
export const recoveryAssessmentSchema=z.object({
  custodyId:z.string().trim().min(1).max(191),
  custodyRevision:z.number().int().positive(),
  estimatedSellingAmount:amount,completionCost:amount,sellingCost:amount,
  evidenceReference:z.string().trim().min(5).max(160),
  findings:z.string().trim().min(20).max(2000),
  confirmedPhysicalInspection:z.literal(true),
  approverUserId:z.string().trim().min(1).max(191),
  idempotencyKey:z.string().trim().min(8).max(180),
}).strict();
type AssessmentInput=z.infer<typeof recoveryAssessmentSchema>;
type Participant={requestedByUserId:string;approverUserId:string};
const conflict=()=>new EnterpriseDomainConflictError("INVENTORY_RETURN_RECOVERY_CONFLICT");
const forbidden=()=>new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_PERMISSION_REQUIRED",403);

export function recoveryProposal(input:{estimatedSellingAmount:Prisma.Decimal.Value;completionCost:Prisma.Decimal.Value;sellingCost:Prisma.Decimal.Value}, ceiling:Prisma.Decimal.Value){
  const gross=new Prisma.Decimal(input.estimatedSellingAmount), completion=new Prisma.Decimal(input.completionCost),selling=new Prisma.Decimal(input.sellingCost),limit=new Prisma.Decimal(ceiling);
  if([gross,completion,selling,limit].some(v=>!v.isFinite()||v.lt(0)||v.decimalPlaces()>6)||!limit.gt(0))throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_AMOUNT_INVALID",400);
  const estimatedNetValue=Prisma.Decimal.max(0,gross.minus(completion).minus(selling));
  const proposedRecoveryAmount=Prisma.Decimal.min(limit,estimatedNetValue);
  if(!proposedRecoveryAmount.gt(0))throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_AMOUNT_INVALID",400);
  return {estimatedNetValue,proposedRecoveryAmount};
}

async function wideScope(tx:Prisma.TransactionClient,org:string,user:string){
  try{if((await retailInventoryVisibleSites(org,user,tx)).isolationEnabled)throw forbidden();}catch{throw forbidden();}
}
export async function requireRecoveryParticipantAccess(org:string,user:string,review:boolean){
  await assertCustodyRecoveryReadAccess(org,user);
  const [stock,finance,validations]=await Promise.all([
    resolveEnterpriseModuleCapabilities({organizationId:org,userId:user,moduleCode:"INVENTORY_LOGISTICS"}),
    resolveEnterpriseModuleCapabilities({organizationId:org,userId:user,moduleCode:"FINANCE_INVENTORY"}),
    resolveEnterpriseModuleCapabilities({organizationId:org,userId:user,moduleCode:"VALIDATIONS"}),
  ]);
  if(!(review?stock.canManage:stock.canCreate||stock.canManage)||!(review?finance.canManage:finance.canRead)||!validations.canRead||!validations.canSubmit)throw forbidden();
  await wideScope(prisma,org,user);
}
export async function assertRecoveryReviewAccess(org:string,user:string,approval:Participant){
  if(![approval.requestedByUserId,approval.approverUserId].includes(user))throw forbidden();
  await requireRecoveryParticipantAccess(org,user,user===approval.approverUserId);
}
export async function lockRecoveryCustodyTx(tx:Prisma.TransactionClient,org:string,id:string){
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "EnterpriseInventoryReturnCustody" WHERE "organizationId"=${org} AND id=${id} FOR UPDATE`);
}
async function custodyParties(tx:Prisma.TransactionClient,org:string,id:string){
  const custody=await tx.enterpriseInventoryReturnCustody.findFirst({where:{organizationId:org,id},select:{inspectedByUserId:true,registeredByUserId:true,originalMovement:{select:{warehouseId:true}}}});
  if(!custody)throw new EnterpriseDomainError("INVENTORY_RETURN_CUSTODY_NOT_FOUND",404);
  return custody;
}
export async function recoveryApprovalCandidates(org:string,user:string,custodyId:string){
  await requireRecoveryParticipantAccess(org,user,false);
  const custody=await custodyParties(prisma,org,custodyId);
  await requireInventoryStockAuthorityTx(prisma,org,user,custody.originalMovement.warehouseId);
  if([custody.inspectedByUserId,custody.registeredByUserId].includes(user))throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED",403);
  const result=await listEnterpriseApprovalCandidates({organizationId:org,requesterUserId:user,moduleCode:"INVENTORY_LOGISTICS"});
  const candidates=await Promise.all(result.candidates.filter(c=>![user,custody.inspectedByUserId,custody.registeredByUserId].includes(c.userId)).map(async c=>{
    try{await requireRecoveryParticipantAccess(org,c.userId,true);return c;}catch{return null;}
  }));
  return {candidates:candidates.filter(c=>c!==null),selfApprovalOverrideAvailable:false};
}
async function serial<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>){
  try{return await prisma.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});}
  catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&["P2002","P2034"].includes(error.code))throw conflict();throw error;}
}
export async function submitRecoveryAssessment(org:string,user:string,input:AssessmentInput){
  if(user===input.approverUserId)throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED",403);
  await requireRecoveryParticipantAccess(org,user,false);
  await requireRecoveryParticipantAccess(org,input.approverUserId,true);
  await assertInventoryApprovalCandidate({organizationId:org,requesterUserId:user,approverUserId:input.approverUserId});
  return serial(async tx=>{
    await wideScope(tx,org,user);await wideScope(tx,org,input.approverUserId);
    await lockRecoveryCustodyTx(tx,org,input.custodyId);
    const parties=await custodyParties(tx,org,input.custodyId);
    await requireInventoryStockAuthorityTx(tx,org,user,parties.originalMovement.warehouseId);
    await requireInventoryStockAuthorityTx(tx,org,input.approverUserId,parties.originalMovement.warehouseId);
    if([parties.inspectedByUserId,parties.registeredByUserId].some(id=>id===user||id===input.approverUserId))throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED",403);
    const prior=await tx.enterpriseInventoryReturnRecoveryAssessment.findFirst({where:{organizationId:org,idempotencyKey:input.idempotencyKey}});
    if(prior){
      const approval=await tx.enterpriseApproval.findFirst({where:{organizationId:org,targetEntityType:RECOVERY_ASSESSMENT_TARGET,targetEntityId:prior.id,archivedAt:null}});
      if(!approval||prior.assessedByUserId!==user||prior.custodyId!==input.custodyId||prior.custodyRevision!==input.custodyRevision||prior.evidenceReference!==input.evidenceReference||prior.findings!==input.findings||!prior.estimatedSellingAmount.equals(input.estimatedSellingAmount)||!prior.completionCost.equals(input.completionCost)||!prior.sellingCost.equals(input.sellingCost)||approval.approverUserId!==input.approverUserId)throw conflict();
      return {assessment:prior,approval,idempotent:true};
    }
    const check=await inspectCustodyRecoveryTx(tx,org,user,input.custodyId);
    if(check.revision!==input.custodyRevision)throw conflict();
    if(await tx.enterpriseInventoryReturnRecoveryAssessment.count({where:{organizationId:org,custodyId:input.custodyId,status:{in:["PENDING_APPROVAL","APPROVED"]}}}))throw conflict();
    const proposal=recoveryProposal(input,check.historicalCostCeiling);
    const assessment=await tx.enterpriseInventoryReturnRecoveryAssessment.create({data:{
      organizationId:org,custodyId:input.custodyId,custodyRevision:check.revision,reference:"RVA-"+randomUUID().slice(0,12).toUpperCase(),
      quantity:check.quantity,historicalCostCeiling:check.historicalCostCeiling,estimatedSellingAmount:input.estimatedSellingAmount,completionCost:input.completionCost,sellingCost:input.sellingCost,...proposal,
      currencyCode:check.currencyCode,originalIssueEventId:check.originalIssueEventId,originalIssueJournalId:check.originalIssueJournalId,
      evidenceReference:input.evidenceReference,findings:input.findings,assessedByUserId:user,idempotencyKey:input.idempotencyKey,
    }});
    const approval=await tx.enterpriseApproval.create({data:{organizationId:org,targetEntityType:RECOVERY_ASSESSMENT_TARGET,targetEntityId:assessment.id,requestedByUserId:user,approverUserId:input.approverUserId,status:"PENDING"}});
    await tx.enterpriseApprovalSubmissionVersion.create({data:{organizationId:org,approvalId:approval.id,versionNumber:1,submittedByUserId:user,snapshotJson:{
      reference:assessment.reference,returnReference:check.returnReference,lotNumber:check.lotNumber,quantity:assessment.quantity.toFixed(),
      historicalCostCeiling:assessment.historicalCostCeiling.toFixed(),estimatedSellingAmount:assessment.estimatedSellingAmount.toFixed(),completionCost:assessment.completionCost.toFixed(),sellingCost:assessment.sellingCost.toFixed(),estimatedNetValue:assessment.estimatedNetValue.toFixed(),totalAmount:assessment.proposedRecoveryAmount.toFixed(),currency:assessment.currencyCode,evidenceReference:assessment.evidenceReference,reason:assessment.findings,revision:assessment.revision,
    }}});
    await tx.enterpriseEntityLink.create({data:{organizationId:org,sourceModule:"INVENTORY_LOGISTICS",sourceEntityType:RECOVERY_ASSESSMENT_TARGET,sourceEntityId:assessment.id,targetModule:"VALIDATIONS",targetEntityType:"EnterpriseApproval",targetEntityId:approval.id,linkType:"REQUIRES_APPROVAL",createdById:user}});
    await publishEnterpriseEvent(tx,{organizationId:org,entityType:RECOVERY_ASSESSMENT_TARGET,entityId:assessment.id,eventType:"INVENTORY_RETURN_RECOVERY_ASSESSED",summary:assessment.reference,actorUserId:user,toStatus:"PENDING_APPROVAL",metadataJson:{custodyId:assessment.custodyId,approvalId:approval.id,physicalReleaseAuthorized:false,accountingRecognitionAuthorized:false}});
    return {assessment,approval,idempotent:false};
  });
}

export async function decideRecoveryAssessment(args:{organizationId:string;approvalId:string;actorUserId:string;action:"APPROVE"|"REJECT"|"CANCEL";revision:number;decisionComment?:string|null;reviewedVersionId?:string|null}){
  const {organizationId:org,actorUserId:user,approvalId}=args;
  const candidate=await prisma.enterpriseApproval.findFirst({where:{organizationId:org,id:approvalId,targetEntityType:RECOVERY_ASSESSMENT_TARGET,status:"PENDING",archivedAt:null}});
  if(!candidate)throw conflict();
  if(args.action==="CANCEL"?candidate.requestedByUserId!==user:candidate.approverUserId!==user||candidate.requestedByUserId===user)throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED",403);
  await assertRecoveryReviewAccess(org,user,candidate);
  if(args.action!=="CANCEL")await assertInventoryApprovalDecision({organizationId:org,requesterUserId:candidate.requestedByUserId,approverUserId:candidate.approverUserId,actorUserId:user});
  if(args.action==="REJECT"&&!args.decisionComment?.trim())throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_REASON_REQUIRED",400);
  return serial(async tx=>{
    await wideScope(tx,org,user);
    const approval=await tx.enterpriseApproval.findFirst({where:{organizationId:org,id:approvalId,targetEntityType:RECOVERY_ASSESSMENT_TARGET,status:"PENDING",archivedAt:null,revision:args.revision}});
    if(!approval|| (args.action==="CANCEL"?approval.requestedByUserId!==user:approval.approverUserId!==user||approval.requestedByUserId===user))throw conflict();
    const assessment=await tx.enterpriseInventoryReturnRecoveryAssessment.findFirst({where:{organizationId:org,id:approval.targetEntityId,status:"PENDING_APPROVAL",assessedByUserId:approval.requestedByUserId}});
    const version=await tx.enterpriseApprovalSubmissionVersion.findFirst({where:{organizationId:org,approvalId,versionNumber:1}});
    if(!assessment||!version||(args.action!=="CANCEL"&&version.id!==args.reviewedVersionId))throw conflict();
    await lockRecoveryCustodyTx(tx,org,assessment.custodyId);
    const parties=await custodyParties(tx,org,assessment.custodyId);
    await requireInventoryStockAuthorityTx(tx,org,user,parties.originalMovement.warehouseId);
    if([parties.inspectedByUserId,parties.registeredByUserId].includes(user))throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_INDEPENDENT_REQUIRED",403);
    if(args.action==="APPROVE"){
      const check=await inspectCustodyRecoveryTx(tx,org,user,assessment.custodyId);
      const proposal=recoveryProposal(assessment,check.historicalCostCeiling);
      if(check.revision!==assessment.custodyRevision||check.currencyCode!==assessment.currencyCode||check.originalIssueEventId!==assessment.originalIssueEventId||check.originalIssueJournalId!==assessment.originalIssueJournalId||!assessment.quantity.equals(check.quantity)||!assessment.historicalCostCeiling.equals(check.historicalCostCeiling)||!assessment.proposedRecoveryAmount.equals(proposal.proposedRecoveryAmount)||!assessment.estimatedNetValue.equals(proposal.estimatedNetValue))throw conflict();
    }
    const status=args.action==="APPROVE"?"APPROVED":args.action==="REJECT"?"REJECTED":"CANCELLED",now=new Date();
    const [updated,decided]=await Promise.all([
      tx.enterpriseInventoryReturnRecoveryAssessment.updateMany({where:{organizationId:org,id:assessment.id,status:"PENDING_APPROVAL",revision:assessment.revision},data:{status,decidedAt:now,revision:{increment:1}}}),
      tx.enterpriseApproval.updateMany({where:{organizationId:org,id:approvalId,status:"PENDING",revision:args.revision},data:{status,decidedAt:now,decisionComment:args.decisionComment||null,revision:{increment:1}}}),
    ]);
    if(updated.count!==1||decided.count!==1)throw conflict();
    if(args.action!=="CANCEL")await tx.enterpriseApprovalDecision.create({data:{organizationId:org,approvalId,submissionVersionId:version.id,actorUserId:user,decision:args.action,reason:args.decisionComment||null,idempotencyKey:"custody-recovery:"+approvalId+":"+version.id}});
    await publishEnterpriseEvent(tx,{organizationId:org,entityType:RECOVERY_ASSESSMENT_TARGET,entityId:assessment.id,eventType:"INVENTORY_RETURN_RECOVERY_"+status,summary:assessment.reference,actorUserId:user,fromStatus:"PENDING_APPROVAL",toStatus:status,metadataJson:{custodyId:assessment.custodyId,approvalId,physicalReleaseAuthorized:false,accountingRecognitionAuthorized:false}});
    return {requestId:assessment.id,status};
  });
}

export const recoveryWithdrawalSchema=z.object({custodyId:z.string().trim().min(1).max(191),assessmentId:z.string().trim().min(1).max(191),revision:z.number().int().positive(),reason:z.string().trim().min(8).max(2000),confirmedNotReleased:z.literal(true)}).strict();
export async function withdrawRecoveryAssessment(org:string,user:string,input:z.infer<typeof recoveryWithdrawalSchema>){
  await requireRecoveryParticipantAccess(org,user,false);
  return serial(async tx=>{
    await wideScope(tx,org,user);
    await lockRecoveryCustodyTx(tx,org,input.custodyId);
    const parties=await custodyParties(tx,org,input.custodyId);
    await requireInventoryStockAuthorityTx(tx,org,user,parties.originalMovement.warehouseId);
    const assessment=await tx.enterpriseInventoryReturnRecoveryAssessment.findFirst({where:{organizationId:org,id:input.assessmentId,custodyId:input.custodyId,assessedByUserId:user}});
    if(!assessment)throw forbidden();
    const approval=await tx.enterpriseApproval.findFirst({where:{organizationId:org,targetEntityType:RECOVERY_ASSESSMENT_TARGET,targetEntityId:assessment.id,requestedByUserId:user,status:"APPROVED",archivedAt:null}});
    if(!approval||approval.approverUserId===user)throw conflict();
    if(assessment.status==="CANCELLED"&&assessment.withdrawnByUserId===user&&assessment.withdrawalReason===input.reason&&assessment.revision===input.revision+1)return {assessment,approval,idempotent:true};
    if(assessment.status!=="APPROVED"||assessment.revision!==input.revision)throw conflict();
    const decision=await tx.enterpriseApprovalDecision.findFirst({where:{organizationId:org,approvalId:approval.id,actorUserId:approval.approverUserId,decision:"APPROVE"}});
    if(!decision)throw conflict();
    if(await tx.enterpriseStockMovement.count({where:{organizationId:org,sourceEntityType:RECOVERY_ASSESSMENT_TARGET,sourceEntityId:assessment.id}}))throw conflict();
    const changed=await tx.enterpriseInventoryReturnRecoveryAssessment.updateMany({where:{organizationId:org,id:assessment.id,status:"APPROVED",revision:input.revision},data:{status:"CANCELLED",withdrawnAt:new Date(),withdrawnByUserId:user,withdrawalReason:input.reason,revision:{increment:1}}});
    if(changed.count!==1)throw conflict();
    await publishEnterpriseEvent(tx,{organizationId:org,entityType:RECOVERY_ASSESSMENT_TARGET,entityId:assessment.id,eventType:"INVENTORY_RETURN_RECOVERY_WITHDRAWN",summary:assessment.reference,actorUserId:user,fromStatus:"APPROVED",toStatus:"CANCELLED",metadataJson:{custodyId:assessment.custodyId,approvalId:approval.id,decisionId:decision.id,reason:input.reason,physicalReleaseAuthorized:false,accountingRecognitionAuthorized:false}});
    return {assessment:await tx.enterpriseInventoryReturnRecoveryAssessment.findFirstOrThrow({where:{organizationId:org,id:assessment.id}}),approval,idempotent:false};
  });
}

export const recoveryExecutionSchema=z.object({
  custodyId:z.string().trim().min(1).max(191),assessmentId:z.string().trim().min(1).max(191),revision:z.number().int().positive(),
  releaseEvidence:z.string().trim().min(8).max(2000),confirmedSaleableAndRepaired:z.literal(true),
}).strict();

/** Restricted, full-quantity recovery. No new refund, credit or receivable.
 * The expert records the final physical quality release after independent
 * approval, with Finance valuation rights, and only at the exact approved cost. */
export async function executeRecoveryAssessment(org:string,user:string,input:z.infer<typeof recoveryExecutionSchema>){
  await requireRecoveryParticipantAccess(org,user,true);
  return serial(async tx=>{
    await wideScope(tx,org,user);
    await lockRecoveryCustodyTx(tx,org,input.custodyId);
    const assessment=await tx.enterpriseInventoryReturnRecoveryAssessment.findFirst({where:{organizationId:org,id:input.assessmentId,custodyId:input.custodyId,assessedByUserId:user},include:{custody:{include:{originalMovement:true}}}});
    if(!assessment)throw forbidden();
    const custody=assessment.custody,source=custody.originalMovement;
    await requireInventoryStockAuthorityTx(tx,org,user,source.warehouseId);
    const approval=await tx.enterpriseApproval.findFirst({where:{organizationId:org,targetEntityType:RECOVERY_ASSESSMENT_TARGET,targetEntityId:assessment.id,status:"APPROVED",requestedByUserId:user,archivedAt:null}});
    if(!approval||approval.approverUserId===user||[custody.inspectedByUserId,custody.registeredByUserId].some(id=>id===user||id===approval.approverUserId))throw forbidden();
    if(assessment.status==="EXECUTED"&&assessment.executedByUserId===user&&assessment.releaseEvidence===input.releaseEvidence&&assessment.revision===input.revision+1&&custody.status==="RECOVERED"&&assessment.recoveryMovementId&&assessment.recoveryAccountingEventId&&assessment.recoveryJournalEntryId)return {assessment,idempotent:true};
    if(assessment.status!=="APPROVED"||assessment.revision!==input.revision||custody.status!=="QUARANTINED"||custody.revision!==assessment.custodyRevision)throw conflict();
    const version=await tx.enterpriseApprovalSubmissionVersion.findFirst({where:{organizationId:org,approvalId:approval.id,versionNumber:1}});
    const decision=version?await tx.enterpriseApprovalDecision.findFirst({where:{organizationId:org,approvalId:approval.id,submissionVersionId:version.id,actorUserId:approval.approverUserId,decision:"APPROVE"}}):null;
    if(!decision)throw conflict();
    const check=await inspectCustodyRecoveryTx(tx,org,user,input.custodyId);
    const proposal=recoveryProposal(assessment,check.historicalCostCeiling);
    if(check.revision!==assessment.custodyRevision||check.currencyCode!==assessment.currencyCode||check.originalIssueEventId!==assessment.originalIssueEventId||check.originalIssueJournalId!==assessment.originalIssueJournalId||!assessment.quantity.equals(check.quantity)||!assessment.historicalCostCeiling.equals(check.historicalCostCeiling)||!assessment.proposedRecoveryAmount.equals(proposal.proposedRecoveryAmount)||!assessment.estimatedNetValue.equals(proposal.estimatedNetValue)||!source.stockLotId)throw conflict();
    // Cost layers store 6 decimals; physical movement input is a JS number.
    // Fail closed instead of silently changing the reviewed value/quantity.
    const qty=Number(assessment.quantity.toFixed()),unitCost=money(assessment.proposedRecoveryAmount.dividedBy(assessment.quantity));
    if(!Number.isFinite(qty)||!assessment.quantity.equals(qty)||!unitCost.gt(0)||!unitCost.times(assessment.quantity).equals(assessment.proposedRecoveryAmount))throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_PRECISION_UNSUPPORTED",409);
    const [physical,layers]=await Promise.all([
      tx.enterpriseInventoryBalance.findMany({where:{organizationId:org,inventoryItemId:source.inventoryItemId,warehouseId:source.warehouseId},select:{quantityOnHand:true}}),
      tx.enterpriseInventoryCostLayer.findMany({where:{organizationId:org,inventoryItemId:source.inventoryItemId,warehouseId:source.warehouseId,remainingQuantity:{gt:0}},select:{remainingQuantity:true,currencyCode:true,valuationMethod:true}}),
    ]);
    if(physical.some(row=>row.quantityOnHand.lt(0))||layers.some(row=>row.currencyCode!==assessment.currencyCode||row.valuationMethod!=="WEIGHTED_AVERAGE")||!physical.reduce((sum,row)=>sum.plus(row.quantityOnHand),new Prisma.Decimal(0)).equals(layers.reduce((sum,row)=>sum.plus(row.remainingQuantity),new Prisma.Decimal(0))))throw new EnterpriseDomainError("INVENTORY_RETURN_RECOVERY_VALUATION_REQUIRED",409);
    const day=await resolveEnterpriseBusinessDate(tx,org);
    await getPostingPeriod(tx,org,new Date(day+"T00:00:00.000Z"));
    const movement=await applyStockMovementTx(tx,org,user,{inventoryItemId:source.inventoryItemId,warehouseId:source.warehouseId,storageLocationId:source.storageLocationId,stockLotId:source.stockLotId,
      direction:"IN",movementType:"CUSTODY_RECOVERY_IN",quantity:qty,sourceEntityType:RECOVERY_ASSESSMENT_TARGET,sourceEntityId:assessment.id,sourceLineId:custody.id,
      idempotencyKey:"custody-recovery:"+assessment.id+":execute",reason:input.releaseEvidence},{approvedRecoveryAssessmentId:assessment.id});
    if(movement.idempotent)throw conflict();
    await tx.enterpriseInventoryCostLayer.create({data:{organizationId:org,inventoryItemId:source.inventoryItemId,warehouseId:source.warehouseId,sourceMovementId:movement.movement.id,
      valuationMethod:"WEIGHTED_AVERAGE",quantity:assessment.quantity,remainingQuantity:assessment.quantity,unitCost,totalCost:assessment.proposedRecoveryAmount,currencyCode:assessment.currencyCode,effectiveAt:movement.movement.occurredAt}});
    const postingEvent="INVENTORY_CUSTODY_RECOVERY_VALUED" as const;
    const event=await tx.enterpriseInventoryAccountingEvent.create({data:{organizationId:org,inventoryItemId:source.inventoryItemId,stockMovementId:movement.movement.id,eventType:"CUSTODY_RECOVERY",quantity:assessment.quantity,unitCost,totalCost:assessment.proposedRecoveryAmount,currencyCode:assessment.currencyCode,status:"APPROVED",idempotencyKey:idempotencyKey({organizationId:org,sourceEntityType:"EnterpriseStockMovement",sourceEntityId:movement.movement.id,postingEvent,postingVersion:1})}});
    const posting=await postBusinessEventTx(tx,org,user,{postingEvent,sourceEntityType:"EnterpriseInventoryAccountingEvent",sourceEntityId:event.id});
    await tx.enterpriseInventoryAccountingEvent.update({where:{id:event.id},data:{status:"POSTED",journalEntryId:posting.entry.id}});
    const released=await tx.enterpriseInventoryReturnCustody.updateMany({where:{organizationId:org,id:custody.id,status:"QUARANTINED",revision:custody.revision},data:{status:"RECOVERED",revision:{increment:1}}});
    const completed=await tx.enterpriseInventoryReturnRecoveryAssessment.updateMany({where:{organizationId:org,id:assessment.id,status:"APPROVED",revision:input.revision},data:{status:"EXECUTED",executedAt:event.createdAt,executedByUserId:user,releaseEvidence:input.releaseEvidence,recoveryMovementId:movement.movement.id,recoveryAccountingEventId:event.id,recoveryJournalEntryId:posting.entry.id,revision:{increment:1}}});
    if(released.count!==1||completed.count!==1)throw conflict();
    await publishFinanceEvent(tx,{organizationId:org,entityType:RECOVERY_ASSESSMENT_TARGET,entityId:assessment.id,eventType:postingEvent,summary:assessment.reference,actorUserId:user,fromStatus:"APPROVED",toStatus:"EXECUTED",metadataJson:{custodyId:custody.id,approvalId:approval.id,stockMovementId:movement.movement.id,journalEntryId:posting.entry.id,total:assessment.proposedRecoveryAmount.toFixed(),currency:assessment.currencyCode,releaseEvidence:input.releaseEvidence}});
    return {assessment:await tx.enterpriseInventoryReturnRecoveryAssessment.findFirstOrThrow({where:{organizationId:org,id:assessment.id}}),idempotent:false};
  });
}
