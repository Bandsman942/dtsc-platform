import {expect,test} from "@playwright/test";
import {PrismaClient} from "@prisma/client";

const enabled=process.env.E2E_HEALTH_BROWSER==="1";
const url=process.env.E2E_BASE_URL||"http://127.0.0.1:3000";
const org=process.env.E2E_HEALTH_ORGANIZATION_ID||"e2e-healthcare-1160-org";
const email=process.env.E2E_HEALTH_ADMIN_EMAIL||"health-admin@example.test";
const password=process.env.E2E_HEALTH_ADMIN_PASSWORD||"E2eHealthOnly2026!";
const patientId="e2e-healthcare-synthetic-patient-1160";
const moduleCodes=[
  "PATIENTS","APPOINTMENTS","CONSULTATIONS","MEDICAL_RECORDS","CARE_TEAM",
  "LABORATORY","INTERNAL_PHARMACY","MEDICAL_BILLING","INSURANCE_COVERAGE",
  "QUALITY_INCIDENTS","MEDICAL_DOCUMENTS",
];
test.describe("HEALTH-01..06: isolated hospital browser E2E",()=>{
  test.describe.configure({mode:"serial"});
  test.skip(!enabled,"Test réservé au compte de démonstration Santé sur PostgreSQL local isolé");
  test.setTimeout(120000);
  const prisma=new PrismaClient();
  test.afterAll(async()=>{
    await prisma.user.updateMany({where:{email},data:{locale:"fr"}}).catch(()=>{});
    await prisma.$disconnect();
  });
  async function signIn(page){
    const resp=await page.context().request.post(`${url}/api/auth/sign-in`,{
      data:{email,password,organizationId:org,next:"/enterprise-modules/PATIENTS"},
      headers:{origin:url,referer:`${url}/auth/sign-in`},
    });
    const body=await resp.json().catch(()=>null);
    expect(resp.ok(),`Synthetic HEALTH sign in: ${JSON.stringify(body)}`).toBeTruthy();
  }
  async function getJson(page,path){
    const response=await page.context().request.get(`${url}${path}`);
    return{response,body:await response.json().catch(()=>({}))};
  }
  async function assertFits(page,code,screen){
    const e=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(e,`${code} exceeds viewport at ${screen}px by ${e}px`).toBeLessThanOrEqual(2);
  }
  test("11 real module routes have compact accessible navigation, no false module",async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await signIn(page);
    for(const code of moduleCodes){
      await page.goto(`${url}/enterprise-modules/${code}`,{waitUntil:"domcontentloaded"});
      const nav=page.locator("[data-health-sector-nav]");
      await expect(nav,`Missing real module navigation on ${code}`).toBeVisible();
      await expect(nav.getByRole("button",{name:/changer de module/i})).toBeVisible();
      await assertFits(page,code,390);
    }
    await page.goto(`${url}/enterprise-modules/PATIENTS`);
    const nav=page.locator("[data-health-sector-nav]");
    await nav.getByRole("button",{name:/changer de module/i}).click();
    await expect(nav.locator('button[aria-current="page"]')).toHaveCount(1);
    expect(await nav.locator('button[aria-current="page"]').textContent()).toMatch(/patients/i);
    await nav.getByRole("searchbox",{name:/rechercher un module santé/i}).fill("laboratoire");
    await nav.getByRole("button",{name:"Laboratoire",exact:true}).click();
    await expect(page).toHaveURL(/\/enterprise-modules\/LABORATORY/);
  });
  test("320px: core clinical module switcher remains within viewport",async({page})=>{
    await page.setViewportSize({width:320,height:720});
    await signIn(page);
    for(const code of ["PATIENTS","LABORATORY","INTERNAL_PHARMACY"]){
      await page.goto(`${url}/enterprise-modules/${code}`,{waitUntil:"domcontentloaded"});
      await expect(page.locator("[data-health-sector-nav]")).toBeVisible();
      await assertFits(page,code,320);
    }
  });
  test("administrative manager cannot write clinical consultation; patient PHI stays hidden",async({page})=>{
    await signIn(page);
    const patient=await getJson(page,`/api/enterprise/${org}/healthcare/patients/${patientId}`);
    expect(patient.response.status()).toBe(200);
    expect(patient.body.patient?.knownAllergies).toBeNull();
    expect(patient.body.patient?.medicalNotes).toBeNull();
    const response=await page.context().request.post(`${url}/api/enterprise/${org}/healthcare/consultations`,{
      data:{},headers:{origin:url,referer:`${url}/enterprise-modules/CONSULTATIONS`},
    });
    expect(response.status(),"Unqualified administrative role must not create an encounter").toBe(403);
  });
  test("clinical KPI totals include >300 rows and do not expose patient identities",async({page})=>{
    await signIn(page);
    const {response,body}=await getJson(page,`/api/enterprise/${org}/healthcare/dashboard`);
    expect(response.status(),JSON.stringify(body)).toBe(200);
    expect(body.metrics?.patients).toBeGreaterThanOrEqual(305);
    expect(JSON.stringify(body)).not.toContain("CONFIDENTIEL FICTIF E2E");
    expect(JSON.stringify(body)).not.toContain("PATIENT SYNTHETIQUE");
  });
  test("nonclinical quality manager receives status but no medical narrative or cross-reference",async({page})=>{
    await signIn(page);
    const {response,body}=await getJson(page,`/api/enterprise/${org}/healthcare/quality-incidents`);
    expect(response.status(),JSON.stringify(body)).toBe(200);
    const item=body.incidents?.find(x=>x.incidentNumber==="IQ-E2E-1160");
    expect(item,"Missing synthetic quality incident").toBeTruthy();
    expect(item.description).toBe("");
    expect(item.title).not.toContain("FAUX INCIDENT");
    expect(item.patientId).toBeNull();
    expect(item.events).toEqual([]);
  });
  test("English labels on genuine module routes follow user locale",async({page})=>{
    await prisma.user.update({where:{email},data:{locale:"en"}});
    try{
      await signIn(page);
      await page.goto(`${url}/enterprise-modules/PATIENTS`,{waitUntil:"domcontentloaded"});
      const nav=page.locator("[data-health-sector-nav]");
      await expect(nav.getByRole("button",{name:/change module/i})).toBeVisible();
      await nav.getByRole("button",{name:/change module/i}).click();
      await expect(nav.getByRole("searchbox",{name:/find a healthcare module/i})).toBeVisible();
    }finally{
      await prisma.user.update({where:{email},data:{locale:"fr"}});
    }
  });
});
