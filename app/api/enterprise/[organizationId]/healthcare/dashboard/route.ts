import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { enterpriseBusinessCalendarWindows } from "@/lib/enterprise/business-context";

type Params={params:Promise<{organizationId:string}>};

/** Tenant-scoped aggregate only. No patient, professional or clinical text leaves this endpoint. */
export async function GET(_req:Request,{params}:Params){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {organizationId}=await params;
  const access=await resolveEnterpriseModuleAccess({userId:session.userId,organizationId,moduleCode:"ADMIN_DASHBOARD",action:"manage"});
  if(!access.allowed)return NextResponse.json({error:"Forbidden"},{status:403});
  const organization=await prisma.organization.findFirst({where:{id:organizationId,status:"ACTIVE",deletedAt:null,organizationType:"CLIENT",sectorCode:"HEALTH_CARE"},select:{timezone:true}});
  if(!organization)return NextResponse.json({error:"Not found"},{status:404});
  const windows=enterpriseBusinessCalendarWindows(new Date(),organization.timezone||"UTC");
  const [patients,newPatientsMonth,appointmentsToday,appointmentsWaiting,consultationsToday,consultationsActive,
    consultationsPendingExams,medicalRecords,laboratoryPending,pharmacyOutOfStock,pharmacyExpiredBatches,
    medicalInvoicesOpen,insurancePending,qualityOpen]=await Promise.all([
    prisma.healthPatient.count({where:{organizationId,status:{notIn:["ARCHIVED","DECEASED"]}}}),
    prisma.healthPatient.count({where:{organizationId,createdAt:windows.month}}),
    prisma.healthAppointment.count({where:{organizationId,appointmentDate:windows.day}}),
    prisma.healthAppointment.count({where:{organizationId,status:"WAITING"}}),
    prisma.healthConsultation.count({where:{organizationId,consultationDate:windows.day}}),
    prisma.healthConsultation.count({where:{organizationId,status:"IN_PROGRESS"}}),
    prisma.healthConsultation.count({where:{organizationId,status:"PENDING_EXAMS"}}),
    prisma.healthMedicalRecord.count({where:{organizationId,status:"ACTIVE"}}),
    prisma.healthLabRequest.count({where:{organizationId,status:{in:["REQUESTED","PENDING_SAMPLE","SAMPLED","ANALYZING","RESULT_ENTERED","PENDING_VALIDATION"]}}}),
    prisma.healthPharmacyProduct.count({where:{organizationId,status:"ACTIVE",currentStock:{lte:0}}}),
    prisma.healthPharmacyBatch.count({where:{organizationId,expiryDate:{lt:new Date()},availableQuantity:{gt:0}}}),
    prisma.healthMedicalInvoice.count({where:{organizationId,status:{in:["DRAFT","ISSUED","PARTIAL_PAID"]}}}),
    prisma.healthCoverageRequest.count({where:{organizationId,status:{in:["DRAFT","SUBMITTED","WAITING","PENDING"]}}}),
    prisma.healthQualityIncident.count({where:{organizationId,status:{notIn:["CLOSED","ARCHIVED","CANCELLED","RESOLVED"]}}}),
  ]);
  return NextResponse.json({businessDate:windows.businessDate,metrics:{
    patients,newPatientsMonth,appointmentsToday,appointmentsWaiting,consultationsToday,
    consultationsActive,consultationsPendingExams,medicalRecords,laboratoryPending,pharmacyOutOfStock,
    pharmacyExpiredBatches,medicalInvoicesOpen,insurancePending,qualityOpen,
  }},{headers:{"Cache-Control":"no-store, private"}});
}
