import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const url=process.env.DATABASE_URL||"";
if(!/^(postgresql|postgres):\/\/(postgres:postgres@)?(localhost|127\.0\.0\.1):5432\/dtsc_health_e2e_test\b/.test(url))
  throw new Error("HEALTH-03 requires isolated PostgreSQL dtsc_health_e2e_test on localhost; never Production");
const prisma=new PrismaClient();
const suffix=randomUUID().slice(0,10);
const actor="health-03-e2e-actor-"+suffix;
const doctor="health-03-e2e-doctor-"+suffix;
const doctor2="health-03-e2e-doctor2-"+suffix;
const organizationId="health-03-e2e-tenant-"+suffix;
const secondTenant="health-03-e2e-neighbor-"+suffix;
const load=workflowTestLoader({
  "@/lib/prisma":{prisma},
  "@/lib/health-staff":{validateAssignableHealthProfessional:async()=>true},
  "@/lib/health-consultations":{createHealthConsultation:async()=>{throw Error("Not used in this test");}},
});
const {createHealthAppointment,updateHealthAppointment}=load("@/lib/health-appointments");
const time=(h,m=0)=>new Date(Date.UTC(2027,0,4,h,m));
function booking(patientId,professionalId,at,duration=30){
  return {patientId,professionalId,appointmentDate:at,estimatedDurationMinutes:duration,
    reason:"Consultation synthétique sans données patients",appointmentType:"CONSULTATION",priority:"NORMAL"};
}
async function seedTenant(id,label){
  await prisma.organization.create({data:{id,name:label,slug:id,status:"ACTIVE",organizationType:"CLIENT",
    sectorCode:"HEALTH_CARE",timezone:"Africa/Kinshasa",createdByDtscUserId:actor}});
  const legacy=await prisma.enterpriseSectorRecord.create({data:{
    organizationId:id,sectorCode:"HEALTH_CARE",moduleCode:"PATIENTS",recordType:"PATIENT",
    title:"Patient fictif",createdById:actor,status:"ACTIVE",payloadJson:{synthetic:true},
  }});
  const patient=await prisma.healthPatient.create({data:{
    organizationId:id,legacyRecordId:legacy.id,patientNumber:"TEST-"+suffix,
    fullName:"PATIENT SYNTHETIQUE E2E",sex:"F",phonePrimary:"+243000000000",
    address:"Ville test",emergencyContactName:"CONTACT TEST",emergencyContactPhone:"+243000000001",
    createdById:actor,
  }});
  return patient.id;
}
async function expectRejected(task,code){
  let failed=false;
  try{await task()}catch(error){failed=true;assert.match(String(error),new RegExp(code))}
  assert.equal(failed,true,`Expected rejection ${code}`);
}
try{
  for(const [id,tag] of [[actor,"ACTOR"],[doctor,"DOCTOR"],[doctor2,"DOCTOR_2"]])
    await prisma.user.create({data:{id,name:"Healthcare synthetic "+tag,email:id+"@example.test",passwordHash:"isolated-test-only",role:"CLIENT",status:"ACTIVE"}});
  const patient=await seedTenant(organizationId,"HEALTH TEST MAIN");
  const otherPatient=await seedTenant(secondTenant,"HEALTH TEST NEIGHBOR");
  const first=await createHealthAppointment(organizationId,actor,booking(patient,doctor,time(9)));
  assert.equal(first.status,"SCHEDULED");
  assert.equal(first.endAt?.toISOString(),time(9,30).toISOString());
  await expectRejected(
    ()=>createHealthAppointment(organizationId,actor,booking(patient,doctor,time(9,15))),
    "APPOINTMENT_TIME_CONFLICT");
  const adjacent=await createHealthAppointment(organizationId,actor,booking(patient,doctor,time(9,30)));
  assert.equal(adjacent.appointmentDate.toISOString(),time(9,30).toISOString());
  await createHealthAppointment(organizationId,actor,booking(patient,doctor2,time(9,15)));
  await createHealthAppointment(secondTenant,actor,booking(otherPatient,doctor,time(9,15)));
  await expectRejected(
    ()=>updateHealthAppointment(organizationId,adjacent.id,actor,{appointmentDate:time(9,20)}),
    "APPOINTMENT_TIME_CONFLICT");
  const rescheduled=await updateHealthAppointment(organizationId,adjacent.id,actor,{appointmentDate:time(9,30)});
  assert.equal(rescheduled?.appointmentDate.toISOString(),time(9,30).toISOString());
  const concurrent=await Promise.allSettled([
    createHealthAppointment(organizationId,actor,booking(patient,doctor,time(14))),
    createHealthAppointment(organizationId,actor,booking(patient,doctor,time(14))),
  ]);
  assert.equal(concurrent.filter(x=>x.status==="fulfilled").length,1,"Two concurrent requests cannot reserve the same practitioner slot");
  assert.equal(await prisma.healthAppointment.count({where:{organizationId,professionalId:doctor,
    appointmentDate:time(14)}}),1,"Only one canonical appointment must be persisted");
  const legacyRows=await prisma.enterpriseSectorRecord.findMany({where:{organizationId,moduleCode:"APPOINTMENTS"},select:{title:true,summary:true}});
  assert.ok(legacyRows.every(x=>x.summary===null&&!x.title.includes("PATIENT SYNTHETIQUE")),"No PHI in ERP mirrors");
  console.log("✅ HEALTH-03 PostgreSQL REAL: conflicts, adjacency, rescheduling, concurrency, two physicians, tenant isolation and neutral legacy projection");
} finally {
  await prisma.$disconnect();
}
