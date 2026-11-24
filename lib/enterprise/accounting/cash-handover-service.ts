import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

export type CashHandoverInput =
 | {action:"PROPOSE";targetSessionId:string;amount:string;reason:string;idempotencyKey:string;attest:true}
 | {action:"ACCEPT"|"DECLINE"|"CANCEL";handoverId:string;revision:number;reason:string;attest:true};

async function assertScope(tx:Prisma.TransactionClient,organizationId:string,userId:string,siteId:string|null){
  const scope=await retailFinanceReadSiteScope(organizationId,userId,"CLOSE_CASH",tx);
  if(scope!==null&&(!siteId||!scope.includes(siteId)))throw new EnterpriseAccountingError("RETAIL_SITE_ACCESS_DENIED",403);
}

export async function assertNoPendingCashHandoverTx(tx:Prisma.TransactionClient,organizationId:string,sessionId:string){
  if(await tx.enterpriseCashHandover.findFirst({where:{organizationId,status:"PENDING",OR:[{sourceSessionId:sessionId},{targetSessionId:sessionId}]},select:{id:true}}))throw new EnterpriseAccountingError("CASH_HANDOVER_PENDING",409);
}

export async function changeCashHandover(organizationId:string,sessionId:string,actorUserId:string,input:CashHandoverInput){
  return prisma.$transaction(async tx=>{
    const current=await tx.enterpriseCashSession.findFirst({where:{organizationId,id:sessionId,cashierUserId:actorUserId}});
    if(!current)throw new EnterpriseAccountingError("CASH_SESSION_NOT_OWNED",403);
    await assertScope(tx,organizationId,actorUserId,current.siteId);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseFinancialAccount" WHERE "organizationId"=${organizationId} AND id=${current.financialAccountId} FOR UPDATE`);
    const account=await tx.enterpriseFinancialAccount.findFirst({where:{organizationId,id:current.financialAccountId,accountType:"CASH",status:"ACTIVE",archivedAt:null}});
    if(!account)throw new EnterpriseAccountingError("CASH_ACCOUNT_INVALID",409);
    let existing=null;
    if(input.action!=="PROPOSE"){
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashHandover" WHERE "organizationId"=${organizationId} AND id=${input.handoverId} FOR UPDATE`);
      existing=await tx.enterpriseCashHandover.findFirst({where:{organizationId,id:input.handoverId}});
      if(!existing||existing.status!=="PENDING"||existing.revision!==input.revision)throw new EnterpriseAccountingError("CASH_HANDOVER_CONFLICT",409);
      if((input.action==="CANCEL"?existing.sourceSessionId:existing.targetSessionId)!==sessionId)throw new EnterpriseAccountingError("CASH_HANDOVER_FORBIDDEN",403);
    }
    const sourceId=input.action==="PROPOSE"?sessionId:existing!.sourceSessionId;
    const targetId=input.action==="PROPOSE"?input.targetSessionId:existing!.targetSessionId;
    if(sourceId===targetId)throw new EnterpriseAccountingError("CASH_HANDOVER_INVALID",409);
    for(const id of [sourceId,targetId].sort())await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseCashSession" WHERE "organizationId"=${organizationId} AND id=${id} FOR UPDATE`);
    const sessions=await tx.enterpriseCashSession.findMany({where:{organizationId,id:{in:[sourceId,targetId]}},include:{movements:{select:{direction:true,amount:true}}}});
    const source=sessions.find(s=>s.id===sourceId),target=sessions.find(s=>s.id===targetId);
    if(!source||!target||source.financialAccountId!==account.id||target.financialAccountId!==account.id||source.siteId!==target.siteId||source.siteId!==account.siteId||source.cashierUserId===target.cashierUserId)throw new EnterpriseAccountingError("CASH_HANDOVER_INVALID",409);
    if(input.action==="PROPOSE"||input.action==="ACCEPT"){
      await assertScope(tx,organizationId,source.cashierUserId,source.siteId);
      await assertScope(tx,organizationId,target.cashierUserId,target.siteId);
      if(source.status!=="OPEN"||target.status!=="OPEN")throw new EnterpriseAccountingError("CASH_HANDOVER_CONFLICT",409);
      const amount=input.action==="PROPOSE"?new Prisma.Decimal(input.amount):existing!.amount;
      const sourceBalance=source.movements.reduce((balance,m)=>m.direction==="INBOUND"?balance.plus(m.amount):balance.minus(m.amount),source.openingAmount);
      if(!amount.greaterThan(0)||sourceBalance.lessThan(amount))throw new EnterpriseAccountingError("CASH_HANDOVER_INSUFFICIENT",409);
      if(input.action==="PROPOSE"){
        const replay=await tx.enterpriseCashHandover.findFirst({where:{organizationId,idempotencyKey:input.idempotencyKey}});
        if(replay){
          if(replay.sourceSessionId!==source.id||replay.targetSessionId!==target.id||!replay.amount.equals(amount)||replay.proposedByUserId!==actorUserId||replay.reason!==input.reason)throw new EnterpriseAccountingError("CASH_HANDOVER_CONFLICT",409);
          return replay;
        }
        const pending=await tx.enterpriseCashHandover.findFirst({where:{organizationId,sourceSessionId:source.id,status:"PENDING"},select:{id:true}});
        if(pending)throw new EnterpriseAccountingError("CASH_HANDOVER_PENDING",409);
        const handover=await tx.enterpriseCashHandover.create({data:{organizationId,sourceSessionId:source.id,targetSessionId:target.id,currencyCode:account.currencyCode,amount,reason:input.reason,proposedByUserId:actorUserId,idempotencyKey:input.idempotencyKey}});
        await publishFinanceEvent(tx,{organizationId,entityType:"EnterpriseCashHandover",entityId:handover.id,eventType:"CASH_HANDOVER_PROPOSED",summary:"Cash custody handover proposed",actorUserId,toStatus:"PENDING",metadataJson:{sourceSessionId:source.id,targetSessionId:target.id,amount:amount.toFixed(),currencyCode:account.currencyCode}});
        return handover;
      }
      // Both custodians attest physically; paired movements change session custody only.
      if(existing!.proposedByUserId===actorUserId)throw new EnterpriseAccountingError("CASH_HANDOVER_FORBIDDEN",403);
      const reference="HANDOVER:"+existing!.id;
      await tx.enterpriseCashMovement.createMany({data:[
        {organizationId,cashSessionId:source.id,movementType:"CUSTODY_HANDOVER",direction:"OUTBOUND",amount,currencyCode:account.currencyCode,reference,reason:existing!.reason,createdByUserId:actorUserId},
        {organizationId,cashSessionId:target.id,movementType:"CUSTODY_HANDOVER",direction:"INBOUND",amount,currencyCode:account.currencyCode,reference,reason:existing!.reason,createdByUserId:actorUserId},
      ]});
      await tx.enterpriseCashSession.updateMany({where:{organizationId,id:{in:[source.id,target.id]}},data:{revision:{increment:1}}});
    }
    const status=input.action==="ACCEPT"?"ACCEPTED":input.action==="DECLINE"?"DECLINED":"CANCELLED";
    const updated=await tx.enterpriseCashHandover.update({where:{id:existing!.id},data:{status,decisionReason:input.reason,decidedByUserId:actorUserId,decidedAt:new Date(),revision:{increment:1}}});
    await publishFinanceEvent(tx,{organizationId,entityType:"EnterpriseCashHandover",entityId:updated.id,eventType:"CASH_HANDOVER_"+status,summary:"Cash custody handover "+status.toLowerCase(),actorUserId,fromStatus:"PENDING",toStatus:status,metadataJson:{sourceSessionId:source.id,targetSessionId:target.id,amount:updated.amount.toFixed(),reason:input.reason}});
    return updated;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:30000});
}
