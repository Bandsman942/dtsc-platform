import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateAssignableHealthProfessional } from "@/lib/health-staff";
import type { healthLabRequestCreateSchema, healthLabActionSchema } from "@/lib/health-laboratory-validators";

export type HealthLabInput=z.infer<typeof healthLabRequestCreateSchema>;
type HealthLabActionInput=z.infer<typeof healthLabActionSchema>;
const nil=(value?:string)=>value?.trim()||null;
const requestNumber=()=>`LAB-${new Date().getFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`;
const activeStatuses=["DRAFT","REQUESTED","PENDING_SAMPLE","SAMPLED","ANALYZING","RESULT_ENTERED","PENDING_VALIDATION"];

export function maskHealthLabSensitive<T extends Record<string,unknown>>(item:T,canViewSensitive:boolean){
  if(canViewSensitive)return item;
  const consultation=item.consultation;
  const safeConsultation=consultation&&typeof consultation==="object"
    ? {...consultation as Record<string,unknown>,chiefComplaint:null,provisionalDiagnosis:null}
    : consultation;
  return {...item,clinicalIndication:null,medicalNotes:null,resultText:null,resultValuesJson:null,
    resultUnit:null,referenceRange:null,resultInterpretation:null,abnormalityLevel:null,
    resultFileUrl:null,internalNotes:null,laboratoryNotes:null,items:[],events:[],
    consultation:safeConsultation};
}

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
  // Until multi-specimen tracking exists, refuse one collection event that
  // claims to cover tests requiring incompatible specimen types.
  const specimenTypes=new Set(tests.map(test=>test.sampleType));
  if(specimenTypes.size>1)return {error:"Ces examens nécessitent des prélèvements de types différents. Créez une demande séparée par type de prélèvement."};
  if(data.sampleType&&specimenTypes.size===1&&!specimenTypes.has(data.sampleType))return {error:"Le type de prélèvement sélectionné ne correspond pas aux examens demandés."};
  if(data.mainTestId&&!tests.some(test=>test.id===data.mainTestId))return {error:"L’examen principal doit faire partie des examens demandés."};
  return {patient,consultation,tests,medicalRecord};
}

export async function createHealthLabRequest(organizationId:string,actorUserId:string,data:HealthLabInput){
  const refs=await validateHealthLabReferences(organizationId,data);if(refs.error||!refs.patient||!refs.tests?.length)throw new Error("INVALID_REFERENCE");
  const main=refs.tests.find(test=>test.id===data.mainTestId)!;
  return prisma.$transaction(async tx=>{
    const number=requestNumber();
    const legacy=await tx.enterpriseSectorRecord.create({data:{organizationId,sectorCode:"HEALTH_CARE",moduleCode:"LABORATORY",recordType:"LAB_REQUEST",title:`Examen · ${number}`,summary:null,status:"REQUESTED",priority:data.priority,assignedToUserId:nil(data.assignedLabStaffId),createdById:actorUserId,payloadJson:{patientRecordId:refs.patient!.legacyRecordId,consultationId:refs.consultation?.id||null,labRequestNumber:number}}});
    const request=await tx.healthLabRequest.create({data:{organizationId,legacyRecordId:legacy.id,labRequestNumber:number,patientId:refs.patient!.id,consultationId:nil(data.consultationId),medicalRecordId:refs.medicalRecord?.id||null,requestedById:data.requestedById,assignedLabStaffId:nil(data.assignedLabStaffId),mainTestId:data.mainTestId,testLabel:main.labelFr,clinicalIndication:nil(data.clinicalIndication),medicalNotes:nil(data.medicalNotes),sampleType:data.sampleType,priority:data.priority,status:"REQUESTED",confidentialityLevel:data.confidentialityLevel,expectedSampleAt:data.expectedSampleAt,internalNotes:nil(data.internalNotes),laboratoryNotes:nil(data.laboratoryNotes),createdById:actorUserId,items:{create:refs.tests.map(test=>({organizationId,testCatalogId:test.id,testLabel:test.labelFr,sampleType:test.sampleType,unit:test.defaultUnit,referenceRange:test.referenceRange}))}}});
    await tx.healthLabEvent.create({data:{organizationId,labRequestId:request.id,eventType:"CREATED",summary:"Demande laboratoire créée.",toStatus:"REQUESTED",actorUserId}});
    return request;
  });
}

export async function updateHealthLabRequest(organizationId:string,requestId:string,actorUserId:string,data:Partial<HealthLabInput>&{reason?:string}){
  const existing=await prisma.healthLabRequest.findFirst({where:{id:requestId,organizationId},include:{items:true}});if(!existing)return null;
  if(["VALIDATED","TRANSMITTED","CANCELLED","REJECTED"].includes(existing.status))throw new Error("REQUEST_LOCKED");
  if(existing.sampledAt&&(data.patientId&&data.patientId!==existing.patientId||data.consultationId!==undefined&&nil(data.consultationId)!==existing.consultationId))throw new Error("RELATION_LOCKED");
  if(data.testIds&&(!["DRAFT","REQUESTED","PENDING_SAMPLE"].includes(existing.status)||Boolean(existing.sampledAt)))throw new Error("TEST_CATALOG_LOCKED_AFTER_SAMPLING");
  const refs=await validateHealthLabReferences(organizationId,data,existing.patientId);if(refs.error)throw new Error("INVALID_REFERENCE");
  if(data.sampleType&&!data.testIds&&existing.items.some(item=>item.sampleType!==data.sampleType))throw new Error("INVALID_SAMPLE_TYPE");
  const main=data.mainTestId?refs.tests?.find(test=>test.id===data.mainTestId):undefined;
  return prisma.$transaction(async tx=>{
    const request=await tx.healthLabRequest.update({where:{id:existing.id},data:{patientId:data.patientId,consultationId:data.consultationId===undefined?undefined:nil(data.consultationId),requestedById:data.requestedById,assignedLabStaffId:data.assignedLabStaffId===undefined?undefined:nil(data.assignedLabStaffId),mainTestId:data.mainTestId,testLabel:main?.labelFr,clinicalIndication:data.clinicalIndication===undefined?undefined:nil(data.clinicalIndication),medicalNotes:data.medicalNotes===undefined?undefined:nil(data.medicalNotes),sampleType:data.sampleType,priority:data.priority,confidentialityLevel:data.confidentialityLevel,expectedSampleAt:data.expectedSampleAt,internalNotes:data.internalNotes===undefined?undefined:nil(data.internalNotes),laboratoryNotes:data.laboratoryNotes===undefined?undefined:nil(data.laboratoryNotes),updatedById:actorUserId}});
    if(data.testIds&&refs.tests){await tx.healthLabRequestItem.deleteMany({where:{organizationId,labRequestId:existing.id}});await tx.healthLabRequestItem.createMany({data:refs.tests.map(test=>({organizationId,labRequestId:existing.id,testCatalogId:test.id,testLabel:test.labelFr,sampleType:test.sampleType,unit:test.defaultUnit,referenceRange:test.referenceRange}))});}
    await tx.healthLabEvent.create({data:{organizationId,labRequestId:existing.id,eventType:"UPDATED",summary:data.reason?.trim()||"Demande laboratoire modifiée.",fromStatus:existing.status,toStatus:existing.status,actorUserId}});
    return request;
  });
}

/**
 * HEALTH-01 P0: each test has its own result. Never copy one result across a
 * multi-test request. Legacy single-test requests remain compatible.
 */
export async function actionHealthLabRequest(organizationId:string,requestId:string,actorUserId:string,data:HealthLabActionInput){
  const existing=await prisma.healthLabRequest.findFirst({where:{id:requestId,organizationId}});
  if(!existing)throw new Error("NOT_FOUND");
  const map:Record<string,{from:string[];to:string}>={
    submit:{from:["DRAFT"],to:"REQUESTED"},
    prepare_sample:{from:["REQUESTED"],to:"PENDING_SAMPLE"},
    collect_sample:{from:["REQUESTED","PENDING_SAMPLE"],to:"SAMPLED"},
    reject_sample:{from:["REQUESTED","PENDING_SAMPLE","SAMPLED"],to:"PENDING_SAMPLE"},
    start_analysis:{from:["SAMPLED"],to:"ANALYZING"},
    enter_result:{from:["ANALYZING","RESULT_ENTERED","PENDING_VALIDATION"],to:"PENDING_VALIDATION"},
    validate_result:{from:["RESULT_ENTERED","PENDING_VALIDATION"],to:"VALIDATED"},
    correct_result:{from:["VALIDATED","TRANSMITTED"],to:"PENDING_VALIDATION"},
    transmit_result:{from:["VALIDATED"],to:"TRANSMITTED"},
    cancel:{from:activeStatuses,to:"CANCELLED"},
    reject_request:{from:["REQUESTED"],to:"REJECTED"},
  };
  const transition=map[data.action];
  if(!transition||!transition.from.includes(existing.status))throw new Error("INVALID_TRANSITION");
  if(["cancel","reject_request","reject_sample","correct_result"].includes(data.action)&&!data.reason?.trim())throw new Error("REASON_REQUIRED");
  if(data.action==="collect_sample"&&data.sampledById&&!await validateAssignableHealthProfessional(organizationId,data.sampledById,true))throw new Error("INVALID_SAMPLER");
  const now=new Date();
  return prisma.$transaction(async tx=>{
    const items=await tx.healthLabRequestItem.findMany({where:{organizationId,labRequestId:requestId},orderBy:[{createdAt:"asc"},{id:"asc"}]});
    if(!items.length && ["enter_result","validate_result","correct_result","transmit_result"].includes(data.action))throw new Error("RESULT_ITEMS_MISSING");
    const itemIds=new Set(items.map(item=>item.id));
    const results=data.action==="enter_result"
      ? data.itemResults ?? (items.length===1&&data.resultText?.trim()?[{
          itemId:items[0].id,resultText:data.resultText,unit:data.resultUnit,
          referenceRange:data.referenceRange,interpretation:data.resultInterpretation,
          abnormalityLevel:data.abnormalityLevel,
        }]:[])
      : [];
    if(data.action==="enter_result"){
      if(results.length!==items.length || new Set(results.map(result=>result.itemId)).size!==items.length)throw new Error("RESULT_ITEMS_INCOMPLETE");
      if(results.some(result=>!itemIds.has(result.itemId)||!result.resultText.trim()))throw new Error("RESULT_ITEM_INVALID");
    }
    if(data.action==="validate_result"&&items.some(item=>!item.resultText?.trim()))throw new Error("RESULT_ITEMS_INCOMPLETE");
    const first=results.length===1?results[0]:null;
    const guarded=await tx.healthLabRequest.updateMany({where:{id:requestId,organizationId,status:existing.status},data:{
      status:transition.to,updatedById:actorUserId,
      sampledAt:data.action==="collect_sample"?(data.sampledAt||now):existing.sampledAt,
      sampledById:data.action==="collect_sample"?(nil(data.sampledById)||actorUserId):existing.sampledById,
      sampleType:data.sampleType||existing.sampleType,sampleQuality:data.sampleQuality||existing.sampleQuality,
      sampleNotes:data.sampleNotes===undefined?existing.sampleNotes:nil(data.sampleNotes),
      resultText:data.action==="enter_result"?(first?.resultText||null):existing.resultText,
      resultUnit:data.action==="enter_result"?(nil(first?.unit)||null):existing.resultUnit,
      referenceRange:data.action==="enter_result"?(nil(first?.referenceRange)||null):existing.referenceRange,
      resultInterpretation:data.action==="enter_result"?(nil(first?.interpretation)||null):existing.resultInterpretation,
      abnormalityLevel:data.action==="enter_result"?(nil(first?.abnormalityLevel)||null):existing.abnormalityLevel,
      laboratoryNotes:data.laboratoryNotes===undefined?existing.laboratoryNotes:nil(data.laboratoryNotes),
      resultEnteredById:data.action==="enter_result"?actorUserId:existing.resultEnteredById,
      resultEnteredAt:data.action==="enter_result"?now:existing.resultEnteredAt,
      validatedById:data.action==="validate_result"?actorUserId:data.action==="correct_result"?null:existing.validatedById,
      validatedAt:data.action==="validate_result"?now:data.action==="correct_result"?null:existing.validatedAt,
      transmittedToDoctorAt:data.action==="transmit_result"?now:existing.transmittedToDoctorAt,
      cancelledById:data.action==="cancel"?actorUserId:existing.cancelledById,
      cancelledAt:data.action==="cancel"?now:existing.cancelledAt,
      cancellationReason:data.action==="cancel"?data.reason:existing.cancellationReason,
      correctionReason:data.action==="correct_result"?data.reason:existing.correctionReason,
    }});
    if(guarded.count!==1)throw new Error("STATE_CHANGED");
    if(existing.legacyRecordId)await tx.enterpriseSectorRecord.updateMany({where:{id:existing.legacyRecordId,organizationId},data:{status:transition.to,updatedById:actorUserId}});
    if(data.action==="enter_result"){
      for(const result of results){
        await tx.healthLabRequestItem.update({where:{id:result.itemId},data:{
          status:transition.to,resultText:result.resultText.trim(),unit:nil(result.unit),
          referenceRange:nil(result.referenceRange),interpretation:nil(result.interpretation),
          abnormalityLevel:nil(result.abnormalityLevel),
        }});
      }
    }else{
      await tx.healthLabRequestItem.updateMany({where:{organizationId,labRequestId:requestId},data:{status:transition.to}});
    }
    await tx.healthLabEvent.create({data:{organizationId,labRequestId:requestId,eventType:data.action.toUpperCase(),
      summary:data.reason?.trim()||`Statut laboratoire : ${existing.status} → ${transition.to}.`,
      fromStatus:existing.status,toStatus:transition.to,actorUserId}});
    return tx.healthLabRequest.findFirstOrThrow({where:{id:requestId,organizationId}});
  },{isolationLevel:"Serializable"});
}
