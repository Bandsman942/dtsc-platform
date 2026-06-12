import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog,writeAuditLog } from "@/lib/audit";
import { getHealthLaboratoryAccess } from "@/lib/health-laboratory-access";
import { healthLabCatalogSchema,healthLabRequestCreateSchema } from "@/lib/health-laboratory-validators";
import { createHealthLabRequest,maskHealthLabSensitive,validateHealthLabReferences } from "@/lib/health-laboratory";
import { listAssignableHealthStaff } from "@/lib/health-staff";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey,rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params={params:Promise<{organizationId:string}>};
const include={patient:{select:{id:true,legacyRecordId:true,patientNumber:true,fullName:true,phonePrimary:true,sex:true,birthDate:true}},consultation:{select:{id:true,consultationNumber:true,patientId:true,chiefComplaint:true,professional:{select:{name:true}}}},requestedBy:{select:{id:true,name:true}},assignedLabStaff:{select:{id:true,name:true}},mainTest:{select:{id:true,code:true,labelFr:true,category:true}},sampledBy:{select:{name:true}},resultEnteredBy:{select:{name:true}},validatedBy:{select:{name:true}},items:{select:{id:true,testCatalogId:true,testLabel:true,status:true,sampleType:true,resultText:true,unit:true,referenceRange:true,interpretation:true,abnormalityLevel:true}},_count:{select:{events:true}}} as const;

export async function GET(req:Request,{params}:Params){
 const startedAt=Date.now(),session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {organizationId}=await params,access=await getHealthLaboratoryAccess({session,organizationId,action:"read"});if(!access)return NextResponse.json({error:"Forbidden"},{status:403});
 const [requests,patients,consultations,staff,catalog]=await Promise.all([
  prisma.healthLabRequest.findMany({where:{organizationId},orderBy:[{priority:"desc"},{requestedAt:"desc"}],take:600,include}),
  prisma.healthPatient.findMany({where:{organizationId,status:{notIn:["ARCHIVED","DECEASED"]}},orderBy:{fullName:"asc"},select:{id:true,legacyRecordId:true,patientNumber:true,fullName:true,phonePrimary:true,sex:true,birthDate:true,knownAllergies:access.canViewSensitive}}),
  prisma.healthConsultation.findMany({where:{organizationId,status:{not:"CANCELLED"}},orderBy:{consultationDate:"desc"},take:400,select:{id:true,consultationNumber:true,patientId:true,professionalId:true,chiefComplaint:true,provisionalDiagnosis:true,consultationDate:true}}),
  listAssignableHealthStaff(organizationId,true),
  prisma.healthLabTestCatalog.findMany({where:{organizationId,isActive:true},orderBy:[{sortOrder:"asc"},{labelFr:"asc"}]}),
 ]);
 await writeApiLog({request:req,statusCode:200,userId:session.userId,startedAt,metadata:{organizationId,moduleCode:"LABORATORY"}});
 return NextResponse.json({requests:requests.map(item=>maskHealthLabSensitive(item,access.canViewSensitive)),patients,consultations,staff:staff.map(item=>({...item.user,positionCode:item.enterprisePosition.positionCode,role:item.enterprisePosition.labelFr,department:item.enterpriseDepartment.labelFr})),catalog,permissions:{canCreate:access.canCreate,canUpdate:access.canUpdate,canCancel:access.canCancel,canCollect:access.canCollect,canEnterResult:access.canEnterResult,canValidate:access.canValidate,canCorrect:access.canCorrect,canTransmit:access.canTransmit,canManageCatalog:access.canManageCatalog,canViewSensitive:access.canViewSensitive}});
}

export async function POST(req:Request,{params}:Params){
 if(!isSameOriginRequest(req))return NextResponse.json({error:"Forbidden"},{status:403});const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const limited=await rateLimit(getRateLimitKey(req,`health-laboratory:${session.userId}`),100,3600000);if(!limited.ok)return NextResponse.json({error:"Too many requests"},{status:429});
 const {organizationId}=await params,access=await getHealthLaboratoryAccess({session,organizationId,action:"submit"});if(!access)return NextResponse.json({error:"Forbidden"},{status:403});
 const payload=await req.json().catch(()=>null),catalogParsed=healthLabCatalogSchema.safeParse(payload);
 if(catalogParsed.success){if(!access.canManageCatalog)return NextResponse.json({error:"Forbidden"},{status:403});const {entity,...data}=catalogParsed.data;void entity;const test=await prisma.healthLabTestCatalog.create({data:{organizationId,...data,labelEn:data.labelEn||null,defaultUnit:data.defaultUnit||null,referenceRange:data.referenceRange||null,description:data.description||null,createdById:session.userId}});await writeAuditLog({userId:session.userId,action:"HEALTH_LAB_CATALOG_CREATED",entity:"HealthLabTestCatalog",entityId:test.id,request:req,metadata:{organizationId}});return NextResponse.json({ok:true,test},{status:201})}
 if(!access.canCreate)return NextResponse.json({error:"Forbidden",message:"Vous n’avez pas la permission de créer une demande laboratoire."},{status:403});
 const parsed=healthLabRequestCreateSchema.safeParse(payload);if(!parsed.success)return NextResponse.json({error:"Invalid payload",message:"Vérifiez le patient, le demandeur et les examens sélectionnés."},{status:400});
 const refs=await validateHealthLabReferences(organizationId,parsed.data);if(refs.error)return NextResponse.json({error:"Invalid reference",message:refs.error},{status:400});
 try{const request=await createHealthLabRequest(organizationId,session.userId,parsed.data);await writeAuditLog({userId:session.userId,action:"HEALTH_LAB_REQUEST_CREATED",entity:"HealthLabRequest",entityId:request.id,request:req,metadata:{organizationId}});return NextResponse.json({ok:true,request},{status:201})}catch{return NextResponse.json({error:"Create failed",message:"Création de la demande laboratoire impossible."},{status:409})}
}
