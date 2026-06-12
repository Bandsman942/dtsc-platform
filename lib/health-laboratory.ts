import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateAssignableHealthProfessional } from "@/lib/health-staff";
import type { healthLabRequestCreateSchema } from "@/lib/health-laboratory-validators";

export type HealthLabInput=z.infer<typeof healthLabRequestCreateSchema>;
const nil=(value?:string)=>value?.trim()||null;
const requestNumber=()=>`LAB-${new Date().getFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`;
const activeStatuses=["DRAFT","REQUESTED","PENDING_SAMPLE","SAMPLED","ANALYZING","RESULT_ENTERED","PENDING_VALIDATION"];

export function maskHealthLabSensitive<T extends Record<string,unknown>>(item:T,canViewSensitive:boolean){if(canViewSensitive)return item;return {...item,clinicalIndication:null,medicalNotes:null,resultText:null,resultValuesJson:null,resultUnit:null,referenceRange:null,resultInterpretation:null,abnormalityLevel:null,resultFileUrl:null,internalNotes:null,laboratoryNotes:null,items:[]};}

export async function validateHealthLabReferences(organizationId:string,data:Partial<HealthLabInput>,existingPatientId?:string){
  const patientId=data.patientId||existingPatientId;
  const testIds=data.testIds||[];
  const [patient,consultation,requester,assignee,tests,medicalRecord]=await Promise.all([
    patientId?prisma.healthPatient.findFirst({where:{id:patientId,organizationId,status:{notIn:["ARCHIVED","DECEASED"]}},select:{id:true,legacyRecordId:true,fullName:true}}):null,
    data.consultationId?prisma.healthConsultation.findFirst({where:{id:data.consultationId,organizationId},select:{id:true,patientId:true,consultationNumber:true}}):null,
    data.requestedById?validateAssignableHealthProfessional(organizationId,data.requestedById,true):null,
    data.assignedLabStaffId?validateAssignableHealthProfessional(organizationId,data.assignedLabStaffId,true):null,
    testIds.length?prisma.healthLabTestCatalog.findMany({where:{organizationId,id:{in:testIds},isActive:true},select:{id:true,labelFr:true,sampleType:true,defaultUnit:true,referenceRange:true}}):[],
    patientId?prisma.healthMedicalRecord.findFirst({where:{organizationId,patientId,status:"ACTIVE"},select:{id:true}}):null,
  ]);
  if(!patient)return {error:"Ce patient n’appartient pas à cette entreprise."};
  if(data.consultationId&&!consultation)return {error:"Cette consultation n’appartient pas à cette entreprise."};
  if(consultation&&consultation.patientId!==patient.id)return {error:"Cette consultation ne concerne pas le patient sélectionné."};
  if(data.requestedById&&!requester)return {error:"Le demandeur médical n’est pas un professionnel actif de cette entreprise."};
  if(data.assignedLabStaffId&&!assignee)return {error:"Le professionnel laboratoire assigné n’est pas actif dans cette entreprise."};
  if(testIds.length&&tests.length!==new Set(testIds).size)return {error:"Un examen sélectionné n’appartient pas au catalogue actif de cette entreprise."};
  if(data.mainTestId&&!tests.some(test=>test.id===data.mainTestId))return {error:"L’examen principal doit faire partie des examens demandés."};
  return {patient,consultation,tests,medicalRecord};
}

export async function createHealthLabRequest(organizationId:string,actorUserId:string,data:HealthLabInput){
  const refs=await validateHealthLabReferences(organizationId,data);if(refs.error||!refs.patient||!refs.tests?.length)throw new Error("INVALID_REFERENCE");
  const main=refs.tests.find(test=>test.id===data.mainTestId)!;
  return prisma.$transaction(async tx=>{
    const number=requestNumber();
    const legacy=await tx.enterpriseSectorRecord.create({data:{organizationId,sectorCode:"HEALTH_CARE",moduleCode:"LABORATORY",recordType:"LAB_REQUEST",title:`${number} · ${refs.patient!.fullName}`,summary:main.labelFr,status:"REQUESTED",priority:data.priority,assignedToUserId:nil(data.assignedLabStaffId),createdById:actorUserId,payloadJson:{patientRecordId:refs.patient!.legacyRecordId,consultationId:refs.consultation?.id||null,labRequestNumber:number}}});
    const request=await tx.healthLabRequest.create({data:{organizationId,legacyRecordId:legacy.id,labRequestNumber:number,patientId:refs.patient!.id,consultationId:nil(data.consultationId),medicalRecordId:refs.medicalRecord?.id||null,requestedById:data.requestedById,assignedLabStaffId:nil(data.assignedLabStaffId),mainTestId:data.mainTestId,testLabel:main.labelFr,clinicalIndication:nil(data.clinicalIndication),medicalNotes:nil(data.medicalNotes),sampleType:data.sampleType,priority:data.priority,status:"REQUESTED",confidentialityLevel:data.confidentialityLevel,expectedSampleAt:data.expectedSampleAt,internalNotes:nil(data.internalNotes),laboratoryNotes:nil(data.laboratoryNotes),createdById:actorUserId,items:{create:refs.tests.map(test=>({organizationId,testCatalogId:test.id,testLabel:test.labelFr,sampleType:test.sampleType,unit:test.defaultUnit,referenceRange:test.referenceRange}))}}});
    await tx.healthLabEvent.create({data:{organizationId,labRequestId:request.id,eventType:"CREATED",summary:"Demande laboratoire créée.",toStatus:"REQUESTED",actorUserId}});
    return request;
  });
}

export async function updateHealthLabRequest(organizationId:string,requestId:string,actorUserId:string,data:Partial<HealthLabInput>&{reason?:string}){
  const existing=await prisma.healthLabRequest.findFirst({where:{id:requestId,organizationId},include:{items:true}});if(!existing)return null;
  if(["VALIDATED","TRANSMITTED","CANCELLED","REJECTED"].includes(existing.status))throw new Error("REQUEST_LOCKED");
  if(existing.sampledAt&&(data.patientId&&data.patientId!==existing.patientId||data.consultationId!==undefined&&nil(data.consultationId)!==existing.consultationId))throw new Error("RELATION_LOCKED");
  const refs=await validateHealthLabReferences(organizationId,data,existing.patientId);if(refs.error)throw new Error("INVALID_REFERENCE");
  const main=data.mainTestId?refs.tests?.find(test=>test.id===data.mainTestId):undefined;
  return prisma.$transaction(async tx=>{
    const request=await tx.healthLabRequest.update({where:{id:existing.id},data:{patientId:data.patientId,consultationId:data.consultationId===undefined?undefined:nil(data.consultationId),requestedById:data.requestedById,assignedLabStaffId:data.assignedLabStaffId===undefined?undefined:nil(data.assignedLabStaffId),mainTestId:data.mainTestId,testLabel:main?.labelFr,clinicalIndication:data.clinicalIndication===undefined?undefined:nil(data.clinicalIndication),medicalNotes:data.medicalNotes===undefined?undefined:nil(data.medicalNotes),sampleType:data.sampleType,priority:data.priority,confidentialityLevel:data.confidentialityLevel,expectedSampleAt:data.expectedSampleAt,internalNotes:data.internalNotes===undefined?undefined:nil(data.internalNotes),laboratoryNotes:data.laboratoryNotes===undefined?undefined:nil(data.laboratoryNotes),updatedById:actorUserId}});
    if(data.testIds&&refs.tests){await tx.healthLabRequestItem.deleteMany({where:{organizationId,labRequestId:existing.id}});await tx.healthLabRequestItem.createMany({data:refs.tests.map(test=>({organizationId,labRequestId:existing.id,testCatalogId:test.id,testLabel:test.labelFr,sampleType:test.sampleType,unit:test.defaultUnit,referenceRange:test.referenceRange}))});}
    await tx.healthLabEvent.create({data:{organizationId,labRequestId:existing.id,eventType:"UPDATED",summary:data.reason?.trim()||"Demande laboratoire modifiée.",fromStatus:existing.status,toStatus:existing.status,actorUserId}});
    return request;
  });
}

export async function actionHealthLabRequest(organizationId:string,requestId:string,actorUserId:string,data:{action:string;reason?:string;sampledAt?:Date;sampledById?:string;sampleType?:string;sampleQuality?:string;sampleNotes?:string;resultText?:string;resultUnit?:string;referenceRange?:string;resultInterpretation?:string;abnormalityLevel?:string;laboratoryNotes?:string}){
  const existing=await prisma.healthLabRequest.findFirst({where:{id:requestId,organizationId}});if(!existing)throw new Error("NOT_FOUND");
  const map:Record<string,{from:string[];to:string}>={submit:{from:["DRAFT"],to:"REQUESTED"},prepare_sample:{from:["REQUESTED"],to:"PENDING_SAMPLE"},collect_sample:{from:["REQUESTED","PENDING_SAMPLE"],to:"SAMPLED"},reject_sample:{from:["REQUESTED","PENDING_SAMPLE","SAMPLED"],to:"PENDING_SAMPLE"},start_analysis:{from:["SAMPLED"],to:"ANALYZING"},enter_result:{from:["ANALYZING","RESULT_ENTERED","PENDING_VALIDATION"],to:"PENDING_VALIDATION"},validate_result:{from:["RESULT_ENTERED","PENDING_VALIDATION"],to:"VALIDATED"},correct_result:{from:["VALIDATED","TRANSMITTED"],to:"PENDING_VALIDATION"},transmit_result:{from:["VALIDATED"],to:"TRANSMITTED"},cancel:{from:activeStatuses,to:"CANCELLED"},reject_request:{from:["REQUESTED"],to:"REJECTED"}};
  const transition=map[data.action];if(!transition||!transition.from.includes(existing.status))throw new Error("INVALID_TRANSITION");
  if(["cancel","reject_request","reject_sample","correct_result"].includes(data.action)&&!data.reason?.trim())throw new Error("REASON_REQUIRED");
  if(data.action==="collect_sample"&&data.sampledById&&!await validateAssignableHealthProfessional(organizationId,data.sampledById,true))throw new Error("INVALID_SAMPLER");
  if(data.action==="enter_result"&&!data.resultText?.trim())throw new Error("RESULT_REQUIRED");
  const now=new Date();const resultAction=data.action==="enter_result"||data.action==="correct_result";
  return prisma.$transaction(async tx=>{
    const request=await tx.healthLabRequest.update({where:{id:existing.id},data:{status:transition.to,updatedById:actorUserId,
      sampledAt:data.action==="collect_sample"?(data.sampledAt||now):existing.sampledAt,sampledById:data.action==="collect_sample"?(nil(data.sampledById)||actorUserId):existing.sampledById,sampleType:data.sampleType||existing.sampleType,sampleQuality:data.sampleQuality||existing.sampleQuality,sampleNotes:data.sampleNotes===undefined?existing.sampleNotes:nil(data.sampleNotes),
      resultText:resultAction?nil(data.resultText):existing.resultText,resultUnit:resultAction?nil(data.resultUnit):existing.resultUnit,referenceRange:resultAction?nil(data.referenceRange):existing.referenceRange,resultInterpretation:resultAction?nil(data.resultInterpretation):existing.resultInterpretation,abnormalityLevel:resultAction?nil(data.abnormalityLevel):existing.abnormalityLevel,laboratoryNotes:data.laboratoryNotes===undefined?existing.laboratoryNotes:nil(data.laboratoryNotes),
      resultEnteredById:resultAction?actorUserId:existing.resultEnteredById,resultEnteredAt:resultAction?now:existing.resultEnteredAt,validatedById:data.action==="validate_result"?actorUserId:data.action==="correct_result"?null:existing.validatedById,validatedAt:data.action==="validate_result"?now:data.action==="correct_result"?null:existing.validatedAt,transmittedToDoctorAt:data.action==="transmit_result"?now:existing.transmittedToDoctorAt,cancelledById:data.action==="cancel"?actorUserId:existing.cancelledById,cancelledAt:data.action==="cancel"?now:existing.cancelledAt,cancellationReason:data.action==="cancel"?data.reason:existing.cancellationReason,correctionReason:data.action==="correct_result"?data.reason:existing.correctionReason}});
    if(existing.legacyRecordId)await tx.enterpriseSectorRecord.update({where:{id:existing.legacyRecordId},data:{status:transition.to,updatedById:actorUserId}});
    await tx.healthLabRequestItem.updateMany({where:{organizationId,labRequestId:existing.id},data:{status:transition.to,...(resultAction?{resultText:nil(data.resultText),unit:nil(data.resultUnit),referenceRange:nil(data.referenceRange),interpretation:nil(data.resultInterpretation),abnormalityLevel:nil(data.abnormalityLevel)}:{})}});
    await tx.healthLabEvent.create({data:{organizationId,labRequestId:existing.id,eventType:data.action.toUpperCase(),summary:data.reason?.trim()||`Statut laboratoire : ${existing.status} → ${transition.to}.`,fromStatus:existing.status,toStatus:transition.to,actorUserId}});
    return request;
  });
}
