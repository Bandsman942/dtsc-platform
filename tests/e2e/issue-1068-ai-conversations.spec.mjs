import { expect, test } from "@playwright/test";

const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:3000";
const email=process.env.E2E_DTSC_USER_EMAIL;
const password=process.env.E2E_DTSC_USER_PASSWORD;
const organizationId=process.env.E2E_ENTERPRISE_AI_ORGANIZATION_ID;

async function login(page) {
  if(!email||!password) throw new Error("Synthetic E2E login is required; never use Production sessions");
  const response=await page.context().request.post(`${baseUrl}/api/auth/sign-in`,{
    data:{email,password,next:"/chat"},
    headers:{origin:baseUrl,referer:`${baseUrl}/auth/sign-in`},
  });
  expect(response.ok(),await response.text()).toBeTruthy();
}

for(const width of [390,768,1024,1440]) {
  test(`general AI navigation remains coherent at ${width}px`,async({page})=>{
    test.skip(!email||!password,"Requires isolated authenticated account");
    await page.setViewportSize({width,height:860});
    await login(page);
    await page.goto(`${baseUrl}/chat`,{waitUntil:"domcontentloaded"});
    const root=page.locator("[data-ai-conversation-design2]");
    await expect(root).toBeVisible();
    await expect(page.locator("[data-assistant-message-pane]")).toBeVisible();
    if(width>=1024){
      await expect(page.locator("[data-assistant-history-pane]")).toBeVisible();
      await expect(page.locator("[data-desktop-sidebar-toggle]")).toBeVisible();
    }else{
      await expect(page.locator("[data-assistant-history-pane]")).toBeHidden();
      await expect(page.getByRole("button",{name:/back to conversations|retour aux conversations/i})).toBeVisible();
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
}

test("Enterprise AI shares conversation layout without opening general personal data",async({page})=>{
  test.skip(!email||!password||!organizationId,"Requires isolated enterprise assistant fixture");
  await page.setViewportSize({width:1440,height:900});
  await login(page);
  await page.goto(`${baseUrl}/enterprise-modules/AI_ASSISTANT`,{waitUntil:"domcontentloaded"});
  await expect(page.locator('[data-assistant-immersive-variant="enterprise"]')).toBeVisible();
  await expect(page.locator("[data-assistant-history-pane]")).toBeVisible();
  await expect(page.locator("[data-assistant-message-pane]")).toBeVisible();
});
