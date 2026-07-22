/**
 * Kernerejse på seedede data:
 * login → panel og segmenter → studie → respondentgennemførelse med
 * forgrening → live-resultater → analyse.
 * Kræver: lokal database startet, seed anvendt, og analysetjenesten på :8000
 * til analysetesten.
 */
import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo1234!");
  await page.click("button[type=submit]");
  await page.waitForURL("**/home");
}

test.describe("roller og adgang", () => {
  test("læser ser ingen administrationsnavigation og kan ikke åbne /admin", async ({ page }) => {
    await signIn(page, "viewer@example.invalid");
    await expect(page.locator("nav[aria-label='Primær']")).not.toContainText("Administration");
    await page.goto("/admin");
    await expect(page.locator("h1")).toHaveText("Ingen adgang");
  });

  test("ejer har adgang til administration og aktivitetslog", async ({ page }) => {
    await signIn(page, "owner@example.invalid");
    await page.goto("/admin");
    await expect(page.locator("h1")).toContainText("Administration");
    await expect(page.getByText("Aktivitetslog")).toBeVisible();
  });

  test("læser ser studier skrivebeskyttet (ingen builder-/publicér-knapper)", async ({ page }) => {
    await signIn(page, "viewer@example.invalid");
    await page.goto("/studies");
    await expect(page.locator("h1")).toContainText("Studier");
    await expect(page.getByText("Opret og åbn builder")).toHaveCount(0);
    await page.getByRole("link", { name: "Relationel NPS 2026 H2" }).click();
    await expect(page.getByRole("button", { name: /Publicér/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Åbn builder" })).toHaveCount(0);
  });
});

test.describe("panel", () => {
  test("filtre, gemt segment og profil med samtykke og kontakthistorik", async ({ page }) => {
    await signIn(page, "panel@example.invalid");
    await page.goto("/panel?lifecycle=active");
    await expect(page.locator("h1")).toContainText("Panel");
    await expect(page.getByText(/panelister matcher/)).toBeVisible();

    await page.goto("/panel/segments");
    await page.getByRole("link", { name: "Aktive kunder med samtykke" }).click();
    await page.waitForURL("**/panel?segment=*");
    const matchText = await page.getByText(/panelister matcher/).innerText();
    expect(Number(matchText.split(" ")[0])).toBeGreaterThan(50);

    await page.locator("tbody a").first().click();
    await expect(page.getByText("Identitet og kontakt")).toBeVisible();
    await expect(page.getByText("survey_contact")).toBeVisible();
    await expect(page.getByText("Kontakthistorik (seneste 50)")).toBeVisible();
  });
});

test.describe("besvarelse og resultater", () => {
  test("kritiker-besvarelse gennemføres og tælles i resultaterne", async ({ page, browser }) => {
    await signIn(page, "researcher@example.invalid");
    // Det seedede offentlige link til det live NPS-studie:
    const token = "pub_" + (20260716).toString(36) + "nps";

    // find studiets resultatside via studielisten
    await page.goto("/studies?q=Relationel");
    const studyHref = await page
      .locator("a[href^='/studies/']:not([href='/studies'])")
      .first()
      .getAttribute("href");
    expect(studyHref).toBeTruthy();

    const before = await completedCount(page, `${studyHref}/results`);

    const respondent = await browser.newContext({ viewport: { width: 375, height: 720 } });
    const rp = await respondent.newPage();
    await rp.goto(`/s/${token}`);
    await rp.click("button:has-text('Start')");
    await rp.click("[role=radio]:has-text('2')");
    await rp.click("button:has-text('Næste')");
    await rp.click("text=Pris");
    await rp.click("button:has-text('Næste')");
    await rp.waitForSelector("text=Hvad kan vi gøre bedre?");
    await rp.fill("textarea", "E2E-spec kritiker-besvarelse.");
    await rp.click("button:has-text('Næste')");
    await rp.waitForSelector("text=Må vi kontakte dig");
    await rp.click("[role=radio]:has-text('Ja')");
    await rp.click("button:has-text('Næste')");
    await rp.waitForSelector("text=Tak for din besvarelse");
    await respondent.close();

    const after = await completedCount(page, `${studyHref}/results`);
    expect(after).toBe(before + 1);
  });

  test("besvarelsen vises i resultatlisten koblet til den præcise studieversion", async ({ page }) => {
    await signIn(page, "researcher@example.invalid");
    await page.goto("/studies?q=Relationel");
    const studyHref = await page
      .locator("a[href^='/studies/']:not([href='/studies'])")
      .first()
      .getAttribute("href");
    await page.goto(`${studyHref}/results`);
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("v1");
  });
});

async function completedCount(page: import("@playwright/test").Page, resultsPath: string): Promise<number> {
  await page.goto(resultsPath);
  const tile = page
    .locator("div", { hasText: /^Gennemførte$/ })
    .locator("xpath=following-sibling::div[1]")
    .first();
  const text = await tile.innerText();
  return Number(text.trim());
}

test.describe("analyse", () => {
  test("analytiker kører en reproducerbar NPS-analyse på det seedede datasæt", async ({ page }) => {
    await signIn(page, "analyst@example.invalid");
    await page.goto("/analytics");
    await page.getByRole("link", { name: /Relationel NPS 2026 H2 — besvarelser/ }).first().click();
    await page.waitForSelector("text=Arbejdsområde — v1");
    await page.selectOption("#wb-proc", "nps");
    await page.selectOption("#wb-variable", "nps_score");
    await page.click("text=Kør analyse");
    await expect(page.getByText("NPS = %promoters − %detractors")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Biblioteker: .*pandas/)).toBeVisible();
  });

  test("læser kan ikke starte analyser", async ({ page }) => {
    await signIn(page, "viewer@example.invalid");
    await page.goto("/analytics");
    await page.getByRole("link", { name: /Relationel NPS 2026 H2 — besvarelser/ }).first().click();
    await page.waitForSelector("text=Arbejdsområde — v1");
    await expect(page.getByRole("button", { name: "Kør analyse" })).toHaveCount(0);
    await expect(page.getByText("Byg datasæt fra studiebesvarelser")).toHaveCount(0);
  });
});
