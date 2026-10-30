import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const slug = "dtsc-public-acceptance-" + Date.now();
const title = "DTSC E2E Publication " + Date.now();
const widths = [320, 360, 390, 414, 768, 1024, 1440];

test.describe.serial("PUBLIC-UX-07 public experience", () => {
  test.beforeAll(async () => {
    if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(origin)) throw new Error("Never seed Production");
    await prisma.publicPublication.create({ data: {
      slug, title,
      excerpt: "Contenu synthétique DTSC pour vérifier la lecture éditoriale et la recherche.",
      category: "ARTICLE", published: true, publishedAt: new Date(),
      seoJson: { title: "DTSC E2E SEO preview", description: "Extrait SEO validé pour la publication DTSC." },
      content: '<h2>Analyse</h2><h3>Application</h3><p>Contenu et <a href="https://example.org">lien externe</a>.</p><figure><img src="/dtsc-logo.png" alt="Diagramme DTSC"></figure><script>alert(1)</script>',
    } });
  });
  test.afterAll(async () => {
    await prisma.publicPublication.deleteMany({ where: { slug } });
    await prisma.$disconnect();
  });
  for (const width of widths) {
    test("catalog and reading at " + width + " px", async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 850 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin + "/ressources", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
      await noOverflow(page, width);
      await page.screenshot({ path: testInfo.outputPath("resources-" + width + ".png"), fullPage: true });
      await page.goto(origin + "/ressources/" + slug, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Analyse" })).toBeVisible();
      await noOverflow(page, width);
      const img = page.getByRole("img", { name: "Diagramme DTSC" });
      await expect(img).toBeVisible();
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /DTSC E2E SEO preview/);
      await expect(page.getByRole("navigation", { name: /Sommaire de l’article|Article table of contents/ })).toBeVisible();
      await page.getByRole("button", { name: /Agrandir l’image|Zoom image/i }).first().click();
      await expect(page.getByRole("dialog", { name: "Diagramme DTSC" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Diagramme DTSC" })).toHaveCount(0);
      const sizes = await img.evaluate(n => ({ nw: n.naturalWidth, nh: n.naturalHeight, w: n.clientWidth, h: n.clientHeight }));
      expect(sizes.nw).toBeGreaterThan(0);
      expect(Math.abs(sizes.nw / sizes.nh - sizes.w / Math.max(1, sizes.h))).toBeLessThan(0.12);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
      expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath("article-" + width + ".png"), fullPage: true });
    });
  }
  test("search and category filters are functional and shareable", async ({ page }) => {
    await page.goto(origin + "/ressources?q=" + encodeURIComponent(title) + "&category=ARTICLE", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
    await page.getByRole("link", { name: /Guides/i }).first().click();
    await expect(page).toHaveURL(/category=GUIDE/);
    await expect(page.getByText(/Aucune publication trouvée|No publications found/)).toBeVisible();
  });
  test("rich content rejects injected executable HTML", async ({ page }) => {
    await page.goto(origin + "/ressources/" + slug, { waitUntil: "domcontentloaded" });
    const content = page.locator(".dtsc-publication-content");
    await expect(content.locator("script")).toHaveCount(0);
    const link = content.getByRole("link", { name: "lien externe" });
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
  });
});
async function noOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "Overflow at " + width + " px").toBeLessThanOrEqual(2);
}
