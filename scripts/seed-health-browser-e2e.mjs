import {pbkdf2Sync,randomBytes} from "node:crypto";
import {PrismaClient} from "@prisma/client";

const dbUrl=process.env.DATABASE_URL||"";
if(!/^(postgresql|postgres):\/\/[^/]+@(localhost|127\.0\.0\.1):5432\/dtsc_health_e2e_test\b/.test(dbUrl))
  throw new Error("Healthcare E2E seeding is allowed ONLY on localhost/dtsc_health_e2e_test");
const prisma=new PrismaClient();
const organizationId=process.env.E2E_HEALTH_ORGANIZATION_ID||"e2e-healthcare-1160-org";
const reporterId="e2e-healthcare-reporter-1160";
const userId="e2e-healthcare-admin-1160",email=process.env.E2E_HEALTH_ADMIN_EMAIL||"health-admin@example.test";
const password=process.env.E2E_HEALTH_ADMIN_PASSWORD||"E2eHealthOnly2026!";
const patientId="e2e-healthcare-synthetic-patient-1160";
const incidentsId="e2e-healthcare-quality-incident-1160";
const documentId="e2e-healthcare-document-1160";
const modules=[
 ["PATIENTS","Patients","Patients"],["APPOINTMENTS","Rendez-vous","Appointments"],
 ["CONSULTATIONS","Consultations","Consultations"],["MEDICAL_RECORDS","Dossiers médicaux","Medical records"],
 ["CARE_TEAM","Équipe médicale","Medical team"],["LABORATORY","Laboratoire","Laboratory"],
 ["INTERNAL_PHARMACY","Pharmacie interne","Internal pharmacy"],
 ["MEDICAL_BILLING","Facturation médicale","Medical billing"],
 ["INSURANCE_COVERAGE","Assurances & prises en charge","Insurance & coverage"],
 ["QUALITY_INCIDENTS","Incidents qualité","Quality incidents"],
 ["MEDICAL_DOCUMENTS","Documents médicaux","Medical documents"],
 ["ADMIN_DASHBOARD","Pilotage","Dashboard"],
];
function passwordHash(raw){
  const salt=randomBytes(16).toString("base64url"),iterations=210000;
  return `pbkdf2:${iterations}:${salt}:${pbkdf2Sync(raw,salt,iterations,32,"sha256").toString("base64url")}`;
}
try{
  const admin=await prisma.user.upsert({where:{email},update:{name:"ADMIN SYNTHETIQUE SANTÉ",passwordHash:passwordHash(password),status:"ACTIVE",locale:"fr",role:"CLIENT"},
    create:{id:userId,name:"ADMIN SYNTHETIQUE SANTÉ",email,passwordHash:passwordHash(password),status:"ACTIVE",locale:"fr",role:"CLIENT"}});
  await prisma.user.upsert({where:{email:"health-reporter@example.test"},update:{name:"REPORTER SYNTHETIQUE SANTÉ",status:"ACTIVE"},
    create:{id:reporterId,name:"REPORTER SYNTHETIQUE SANTÉ",email:"health-reporter@example.test",
      passwordHash:"isolated-test-only",status:"ACTIVE",role:"CLIENT"}});
  await prisma.organization.upsert({where:{id:organizationId},
    update:{name:"HÔPITAL SYNTHÉTIQUE DTSC",slug:"e2e-healthcare-1160",sectorCode:"HEALTH_CARE",status:"ACTIVE",organizationType:"CLIENT",timezone:"Africa/Kinshasa",deletedAt:null},
    create:{id:organizationId,name:"HÔPITAL SYNTHÉTIQUE DTSC",slug:"e2e-healthcare-1160",sectorCode:"HEALTH_CARE",status:"ACTIVE",organizationType:"CLIENT",timezone:"Africa/Kinshasa",createdByDtscUserId:admin.id}});
  await prisma.organizationMember.upsert({where:{organizationId_userId:{organizationId,userId:admin.id}},
    update:{role:"OWNER",status:"ACTIVE",removedAt:null,joinedAt:new Date()},
    create:{organizationId,userId:admin.id,role:"OWNER",status:"ACTIVE",joinedAt:new Date()}});
  const plan=await prisma.billingPlan.upsert({where:{id:"e2e-healthcare-1160-plan"},
    update:{isActive:true,name:"Enterprise HEALTH E2E",slug:"enterprise"},
    create:{id:"e2e-healthcare-1160-plan",name:"Enterprise HEALTH E2E",slug:"enterprise",description:"Données fictives, PostgreSQL local exclusivement",priceUsd:0,dailyMessageLimit:1000,dailyTokenLimit:1000000,maxDocuments:100,isActive:true,sortOrder:996}});
  await prisma.organizationSubscription.upsert({where:{id:"e2e-healthcare-1160-subscription"},
    update:{planId:plan.id,status:"ACTIVE",expiresAt:new Date(Date.now()+30*86400000)},
    create:{id:"e2e-healthcare-1160-subscription",organizationId,planId:plan.id,status:"ACTIVE",startedAt:new Date(Date.now()-86400000),expiresAt:new Date(Date.now()+30*86400000),createdByDtscUserId:admin.id,updatedByDtscUserId:admin.id}});
  for(const [index,[code,fr,en]] of modules.entries()){
    await prisma.enterpriseModule.upsert({where:{organizationId_moduleCode:{organizationId,moduleCode:code}},
      update:{isEnabled:true,requiresPlanLevel:"STARTER",labelFr:fr,labelEn:en},
      create:{organizationId,moduleCode:code,labelFr:fr,labelEn:en,moduleCategory:"HEALTH_CARE",isEnabled:true,requiresPlanLevel:"STARTER",sortOrder:index}});
  }
  const legacy=await prisma.enterpriseSectorRecord.upsert({where:{id:"e2e-healthcare-1160-patient-legacy"},
    update:{title:"Patient fictif · E2E",summary:null,payloadJson:{synthetic:true}},
    create:{id:"e2e-healthcare-1160-patient-legacy",organizationId,sectorCode:"HEALTH_CARE",moduleCode:"PATIENTS",recordType:"PATIENT",title:"Patient fictif · E2E",summary:null,status:"ACTIVE",createdById:admin.id,payloadJson:{synthetic:true}}});
  const basics={organizationId,fullName:"PATIENT SYNTHÉTIQUE HÔPITAL",sex:"F",phonePrimary:"+243000000000",
    address:"Rue laboratoire E2E fictive",emergencyContactName:"CONTACT SYNTHÉTIQUE",emergencyContactPhone:"+243000000001",createdById:admin.id};
  await prisma.healthPatient.upsert({where:{id:patientId},
    update:{knownAllergies:"PÉNICILLINE — FAUSSE DONNÉE TEST",medicalNotes:"CONFIDENTIEL FICTIF E2E",legacyRecordId:legacy.id},
    create:{id:patientId,...basics,legacyRecordId:legacy.id,patientNumber:"SYNTH-001",knownAllergies:"PÉNICILLINE — FAUSSE DONNÉE TEST",medicalNotes:"CONFIDENTIEL FICTIF E2E"}});
  await prisma.healthPatient.createMany({data:Array.from({length:304},(_,i)=>({
    ...basics,id:`e2e-healthcare-1160-patient-${i+2}`,patientNumber:`SYNTH-${String(i+2).padStart(3,"0")}`,
    fullName:`PATIENT SYNTHÉTIQUE ${i+2}`,
  })),skipDuplicates:true});
  await prisma.healthQualityIncident.upsert({where:{id:incidentsId},
    update:{title:"FAUX INCIDENT : DONNÉES SENSIBLES TEST",description:"FAUSSE OBSERVATION CLINIQUE À MASQUER"},
    create:{id:incidentsId,organizationId,incidentNumber:"IQ-E2E-1160",title:"FAUX INCIDENT : DONNÉES SENSIBLES TEST",
      description:"FAUSSE OBSERVATION CLINIQUE À MASQUER",incidentType:"PATIENT_SAFETY",
      initialSeverity:"MODERATE",initialCriticality:"HIGH",reportedById:reporterId,createdById:reporterId,
      patientId,containsSensitiveMedicalData:true,confidentialityLevel:"MEDICAL_SENSITIVE",status:"REPORTED"}});
  await prisma.healthDocument.upsert({where:{id:documentId},
    update:{title:"Document synthétique public à l'administration"},
    create:{id:documentId,organizationId,documentNumber:"DM-E2E-1160",
      title:"Document synthétique public à l'administration",documentType:"ADMINISTRATIVE",
      sourceModule:"PATIENTS",confidentialityLevel:"MEDICAL_STANDARD",status:"ACTIVE",
      patientId,createdById:admin.id}});
  console.log(JSON.stringify({result:"HEALTH_E2E_SEED_READY",organizationId,patients:await prisma.healthPatient.count({where:{organizationId}}),modules:modules.length}));
}finally{await prisma.$disconnect()}
