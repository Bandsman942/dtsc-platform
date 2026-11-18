import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { businessDateKey } from "@/lib/enterprise/retail/inventory-policy";

/** A bounded, lease-fenced daily digest; it never alters physical stock.
 * Claim order uses the oldest due tenant (including new tenants) so an
 * organization without alerts cannot permanently occupy the first page.
 */
export async function processInventoryQualityAlerts({batchSize=8}: {batchSize?:number}={}) {
  const now=new Date();
  const leaseToken=randomUUID();
  const leaseUntil=new Date(now.getTime()+5*60_000);
  const take=Math.max(1,Math.min(20,Math.trunc(batchSize)||8));
  const claimed=await prisma.$queryRaw<Array<{organizationId:string}>>(Prisma.sql`
    INSERT INTO "EnterpriseInventoryQualityScan" ("organizationId","nextScanAt","leaseUntil","leaseToken","updatedAt")
    SELECT o.id,${now},${leaseUntil},${leaseToken},${now}
    FROM "Organization" o
    LEFT JOIN "EnterpriseInventoryQualityScan" s ON s."organizationId"=o.id
    WHERE o.status='ACTIVE' AND o."organizationType"='CLIENT' AND o."deletedAt" IS NULL
      AND EXISTS(SELECT 1 FROM "EnterpriseModule" m WHERE m."organizationId"=o.id AND m."moduleCode"='INVENTORY_LOGISTICS' AND m."isEnabled"=TRUE)
      AND (s."organizationId" IS NULL OR (s."nextScanAt"<=${now} AND (s."leaseUntil" IS NULL OR s."leaseUntil"<=${now})))
    ORDER BY COALESCE(s."nextScanAt",o."createdAt"),o.id
    LIMIT ${take}
    ON CONFLICT ("organizationId") DO UPDATE
    SET "leaseUntil"=EXCLUDED."leaseUntil","leaseToken"=EXCLUDED."leaseToken","updatedAt"=EXCLUDED."updatedAt"
    WHERE "EnterpriseInventoryQualityScan"."nextScanAt"<=${now}
      AND ("EnterpriseInventoryQualityScan"."leaseUntil" IS NULL OR "EnterpriseInventoryQualityScan"."leaseUntil"<=${now})
    RETURNING "organizationId"`);
  let scanned=0,withAlerts=0,notified=0,failed=0;
  for(const {organizationId} of claimed){
    let next=new Date(now.getTime()+24*60*60_000);
    try{
      const org=await prisma.organization.findFirst({where:{id:organizationId,status:"ACTIVE",organizationType:"CLIENT",deletedAt:null},select:{timezone:true}});
      if(org){
        const businessDate=businessDateKey(now,org.timezone||"UTC");
        const horizon=new Date(new Date(businessDate+"T00:00:00.000Z").getTime()+30*86400000);
        const [lot,custody]=await Promise.all([
          prisma.enterpriseStockLot.findFirst({where:{organizationId,archivedAt:null,balances:{some:{organizationId,quantityOnHand:{gt:0}}},OR:[
            {expiryDate:{lte:horizon}},{expiryDate:null,inventoryItem:{expiryTracking:true}},{status:{in:["BLOCKED","QUARANTINED"]}},{recallReference:{not:null}},
          ]},select:{id:true}}),
          prisma.enterpriseInventoryReturnCustody.findFirst({where:{organizationId,status:"DISPOSAL_PENDING",returnLine:{request:{status:"COMPLETED"}}},select:{id:true}}),
        ]);
        if(lot||custody){
          withAlerts++;
          // Only globally authorized enterprise administrators, never a
          // store-scoped collaborator or a global DTSC account by role alone.
          const recipients=await prisma.organizationMember.findMany({
            where:{organizationId,status:"ACTIVE",removedAt:null,role:{in:["OWNER","ADMIN_ENTREPRISE","ADMIN_ENTERPRISE"]},user:{status:"ACTIVE"}},
            select:{userId:true,user:{select:{locale:true}}},orderBy:{id:"asc"},
          });
          for(const recipient of recipients){
            if(!(await prisma.enterpriseInventoryQualityScan.findFirst({where:{organizationId,leaseToken,leaseUntil:{gt:new Date()}},select:{organizationId:true}})))throw new Error("QUALITY_SCAN_LEASE_LOST");
            const access=await resolveEnterpriseModuleAccess({userId:recipient.userId,organizationId,moduleCode:"INVENTORY_LOGISTICS",action:"read"});
            if(!access.allowed)continue;
            // The push payload must not reveal article, lot, health or stock
            // quantities on the lock screen. Details require a fresh ERP login.
            const en=recipient.user.locale==="en";
            await notifyUser({userId:recipient.userId,organizationId,type:"ENTERPRISE_INVENTORY_ALERT",
              title:en?"Inventory review needed":"Contrôle de stock nécessaire",
              body:en?"Open Inventory & logistics to review quality alerts.":"Ouvrez Stock & logistique pour consulter les alertes qualité.",
              targetUrl:"/enterprise-modules/INVENTORY_LOGISTICS",
              idempotencyKey:`inventory-quality:${organizationId}:${recipient.userId}:${businessDate}`});
            notified++;
          }
        }
      }
      scanned++;
    }catch{
      failed++;
      next=new Date(now.getTime()+15*60_000);
    }finally{
      await prisma.enterpriseInventoryQualityScan.updateMany({where:{organizationId,leaseToken},data:{nextScanAt:next,leaseUntil:null,leaseToken:null}});
    }
  }
  return {claimed:claimed.length,scanned,withAlerts,processedRecipients:notified,failed,hasMore:claimed.length===take};
}
