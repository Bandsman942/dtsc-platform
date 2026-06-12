import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthStaffAccess } from "@/lib/health-staff-access";
import { healthStaffCreateSchema, healthSpecialtySchema } from "@/lib/health-staff-validators";
import { createHealthStaffAssignment, HEALTH_STAFF_PERMISSIONS, validateHealthStaffReferences } from "@/lib/health-staff";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params={params:Promise<{organizationId:string}>};
const staffInclude={
  organizationMember:{select:{id:true,role:true,status:true,joinedAt:true,user:{select:{id:true,name:true,email:true,phone:true}}}},
  enterprisePosition:{select:{id:true,positionCode:true,labelFr:true,hierarchyLevel:true}},
  enterpriseDepartment:{select:{id:true,departmentCode:true,labelFr:true}},
  healthSpecialty:{select:{id:true,code:true,labelFr:true}},
  supervisorStaff:{select:{id:true,user:{select:{name:true}}}},
  createdBy:{select:{name:true}},
  updatedBy:{select:{name:true}},
} as const;

export async function GET(req:Request,{params}:Params){
  const startedAt=Date.now(),session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {organizationId}=await params,access=await getHealthStaffAccess({session,organizationId,action:"read"});if(!access)return NextResponse.json({error:"Forbidden"},{status:403});
  const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
  const [staff,members,positions,departments,specialties,todayAppointments,todayConsultations]=await Promise.all([
    prisma.healthStaffAssignment.findMany({where:{organizationId},orderBy:{user:{name:"asc"}},include:staffInclude}),
    prisma.organizationMember.findMany({where:{organizationId,status:"ACTIVE",removedAt:null},orderBy:{user:{name:"asc"}},select:{id:true,role:true,user:{select:{id:true,name:true,email:true,phone:true}}}}),
    prisma.enterprisePosition.findMany({where:{organizationId,isActive:true,sector:{code:"HEALTH_CARE"}},orderBy:[{hierarchyLevel:"asc"},{labelFr:"asc"}],select:{id:true,positionCode:true,labelFr:true,permissionsJson:true}}),
    prisma.enterpriseDepartment.findMany({where:{organizationId,isActive:true},orderBy:{labelFr:"asc"},select:{id:true,departmentCode:true,labelFr:true}}),
    prisma.healthSpecialty.findMany({where:{organizationId,isActive:true},orderBy:[{sortOrder:"asc"},{labelFr:"asc"}]}),
    prisma.healthAppointment.groupBy({by:["professionalId"],where:{organizationId,appointmentDate:{gte:start,lt:end},professionalId:{not:null}},_count:{_all:true}}),
    prisma.healthConsultation.groupBy({by:["professionalId"],where:{organizationId,consultationDate:{gte:start,lt:end}},_count:{_all:true}}),
  ]);
  const appointmentCounts=new Map(todayAppointments.map(item=>[item.professionalId,item._count._all])),consultationCounts=new Map(todayConsultations.map(item=>[item.professionalId,item._count._all]));
  await writeApiLog({request:req,statusCode:200,userId:session.userId,startedAt,metadata:{organizationId,moduleCode:"CARE_TEAM"}});
  return NextResponse.json({staff:staff.map(item=>({...item,permissionsJson:access.canViewPermissions?item.permissionsJson:[],todayAppointments:appointmentCounts.get(item.userId)||0,todayConsultations:consultationCounts.get(item.userId)||0})),members,positions,departments,specialties,permissionOptions:HEALTH_STAFF_PERMISSIONS,permissions:{canCreate:access.canCreate,canUpdate:access.canUpdate,canSuspend:access.canSuspend,canArchive:access.canArchive,canManageAvailability:access.canManageAvailability,canManagePermissions:access.canManagePermissions,canManageSpecialties:access.canManageSpecialties,canViewPermissions:access.canViewPermissions,canViewActivity:access.canViewActivity}});
}

export async function POST(req:Request,{params}:Params){
  if(!isSameOriginRequest(req))return NextResponse.json({error:"Forbidden"},{status:403});const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const limited=await rateLimit(getRateLimitKey(req,`health-staff:${session.userId}`),80,3600000);if(!limited.ok)return NextResponse.json({error:"Too many requests"},{status:429});
  const {organizationId}=await params,access=await getHealthStaffAccess({session,organizationId,action:"submit"});if(!access?.canCreate)return NextResponse.json({error:"Forbidden"},{status:403});
  const payload=await req.json().catch(()=>null),specialtyParsed=healthSpecialtySchema.safeParse(payload);
  if(specialtyParsed.success&&payload?.entity==="specialty"){if(!access.canManageSpecialties)return NextResponse.json({error:"Forbidden"},{status:403});const specialty=await prisma.healthSpecialty.create({data:{organizationId,...specialtyParsed.data,labelEn:specialtyParsed.data.labelEn||null,description:specialtyParsed.data.description||null}});await writeAuditLog({userId:session.userId,action:"HEALTH_SPECIALTY_CREATED",entity:"HealthSpecialty",entityId:specialty.id,request:req,metadata:{organizationId}});return NextResponse.json({ok:true,specialty},{status:201})}
  const parsed=healthStaffCreateSchema.safeParse(payload);if(!parsed.success)return NextResponse.json({error:"Invalid payload",message:"Vérifiez le membre, le poste et le service Santé."},{status:400});
  const refs=await validateHealthStaffReferences(organizationId,parsed.data);if(refs.error)return NextResponse.json({error:"Invalid reference",message:refs.error},{status:400});
  try{const assignment=await createHealthStaffAssignment(organizationId,session.userId,access.canManagePermissions?parsed.data:{...parsed.data,permissions:undefined});await writeAuditLog({userId:session.userId,action:"HEALTH_STAFF_CREATED",entity:"HealthStaffAssignment",entityId:assignment.id,request:req,metadata:{organizationId}});return NextResponse.json({ok:true,assignment},{status:201})}catch(error){const message=error instanceof Error&&error.message==="DUPLICATE_ASSIGNMENT"?"Ce membre possède déjà une affectation Santé.":"Affectation du professionnel impossible.";return NextResponse.json({error:"Create failed",message},{status:409})}
}
