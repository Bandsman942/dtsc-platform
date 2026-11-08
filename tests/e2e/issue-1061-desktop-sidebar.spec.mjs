import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const email = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const password = process.env.E2E_USER_PASSWORD;

async function login(page) {
  if (!password) throw new Error("#1061 requires an isolated E2E user; never reuse a Production session.");
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: { email, password, organizationId, next: "/dashboard" },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe("#1061 Neon-like desktop rail and WhatsApp-like collaborators", () => {
  test.skip(!password, "An isolated E2E user is required");

  test("icon-only rail reflows the workspace, persists and can expand again", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    const shell = page.locator("[data-dtsc-desktop-shell]");
    const sidebar = page.locator("#dtsc-desktop-sidebar");
    const content = page.locator(".dtsc-desktop-content");
    const toggle = page.locator("[data-desktop-sidebar-toggle]");
    await expect(toggle).toBeVisible();
    await expect(shell).toHaveAttribute("data-sidebar-collapsed", "false");
    const wide = await content.boundingBox();
    expect(wide).not.toBeNull();

    await toggle.click();
    await expect(shell).toHaveAttribute("data-sidebar-collapsed", "true");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-sidebar-nav-link]:visible")).not.toHaveCount(0);
    const narrow = await sidebar.boundingBox();
    expect(narrow?.width).toBeLessThan(100);
    const enlarged = await content.boundingBox();
    expect(enlarged?.width).toBeGreaterThan(wide?.width ?? 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(shell).toHaveAttribute("data-sidebar-collapsed", "true");

    await toggle.click();
    await expect(shell).toHaveAttribute("data-sidebar-collapsed", "false");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("desktop conversations have three panes; mobile navigation is unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await login(page);
    await page.goto(`${baseUrl}/collaborators`, { waitUntil: "domcontentloaded" });
    const shell = page.locator('[data-dtsc-desktop-shell][data-workspace-mode="conversation"]');
    const toggle = page.locator("[data-desktop-sidebar-toggle]");
    await expect(toggle).toBeVisible();
    await expect(shell).toHaveAttribute("data-sidebar-collapsed", "true");
    const list = page.locator("[data-collaborators-discussions-pane]");
    const discussion = page.locator("[data-collaborators-conversation-pane]");
    await expect(list).toBeVisible();
    await expect(discussion).toBeVisible();
    const left = await list.boundingBox();
    const right = await discussion.boundingBox();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect((right?.x ?? 0)).toBeGreaterThanOrEqual((left?.x ?? 0) + (left?.width ?? 0) - 2);
    expect((right?.height ?? 0)).toBeGreaterThan(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(toggle).toBeHidden();
    await expect(page.locator("[data-mobile-bottom-nav]")).toBeVisible();
  });
});
