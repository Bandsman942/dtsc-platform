import { test, expect } from "@playwright/test";

const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:3000";
const email=process.env.E2E_DTSC_ADMIN_EMAIL;
const password=process.env.E2E_DTSC_ADMIN_PASSWORD;

async function auth(page) {
  const response=await page.context().request.post(`${baseUrl}/api/auth/sign-in`,{
    data:{email,password,next:"/admin"},
    headers:{origin:baseUrl,referer:`${baseUrl}/auth/sign-in`},
  });
  expect(response.ok(),await response.text()).toBeTruthy();
}

for(const width of [390,768,1024,1440]) {
  test(`console cards, breadcrumbs, and no horizontal overflow at ${width}px`,async({page})=>{
    test.skip(!email||!password,"Requires isolated DTSC Console administrator");
    await page.setViewportSize({width,height:900});
    await auth(page);
    await page.goto(`${baseUrl}/admin`,{waitUntil:"domcontentloaded"});
    await expect(page.locator("[data-console-section-directory]")).toBeVisible();
    await expect(page.locator("[data-console-domain-card]")).not.toHaveCount(0);
    await expect(page.locator("[data-console-breadcrumb]")).toBeVisible();
    const first=page.locator("[data-console-domain-card]").first();
    await first.click();
    await expect(page).toHaveURL(/group=/);
    await expect(page.locator("[data-console-section-card]")).not.toHaveCount(0);
    await page.locator("[data-console-section-card]").first().click();
    await expect(page.locator("[data-console-breadcrumb]")).toBeVisible();
    const back=page.locator("[data-console-depth-back]");
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/group=/);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
}

test("subsections remain URL-addressable and paginated filters preserve depth",async({page})=>{
  test.skip(!email||!password,"Requires isolated DTSC Console administrator");
  await page.setViewportSize({width:1440,height:900});
  await auth(page);
  await page.goto(`${baseUrl}/admin/users`,{waitUntil:"domcontentloaded"});
  const cards=page.locator("[data-console-subsection-card]");
  await expect(cards).not.toHaveCount(0);
  await cards.first().click();
  await expect(page).toHaveURL(/focus=/);
  await expect(page.locator("[data-console-depth-back]")).toBeVisible();
  const pagination=page.locator("[data-console-server-pagination]");
  if(await pagination.count()) {
    const urls=await pagination.locator("a").evaluateAll(links=>links.map(link=>link.getAttribute("href")));
    expect(urls.every(url=>url?.includes("focus="))).toBe(true);
  }
  await page.locator("[data-console-depth-back]").click();
  await expect(page).not.toHaveURL(/focus=/);
});
