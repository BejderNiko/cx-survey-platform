/**
 * Core end-to-end journey on seeded data:
 * sign-in → panel & segments → study publish → distribution → respondent
 * completion with branching → live results → follow-up case → analytics.
 * Requires: local DB started (scripts/dev-db.sh start), seed applied, and the
 * analytics service running on :8000 for the analytics test.
 */
import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo1234!");
  await page.click("button[type=submit]");
  await page.waitForURL("**/home");
}

test.describe("roles and access", () => {
  test("viewer sees no admin navigation and cannot open /admin", async ({ page }) => {
    await signIn(page, "viewer@example.invalid");
    await expect(page.locator("nav[aria-label='Primary']")).not.toContainText("Administration");
    await page.goto("/admin");
    await expect(page.locator("h1")).toHaveText("No access");
  });

  test("owner has administration access and audit log", async ({ page }) => {
    await signIn(page, "owner@example.invalid");
    await page.goto("/admin");
    await expect(page.locator("h1")).toContainText("Administration");
    await expect(page.getByText("Audit log")).toBeVisible();
  });

  test("viewer sees studies read-only (no builder/publish controls)", async ({ page }) => {
    await signIn(page, "viewer@example.invalid");
    await page.goto("/studies");
    await expect(page.locator("h1")).toContainText("Studies");
    await expect(page.getByText("Create & open builder")).toHaveCount(0);
    await page.getByRole("link", { name: "Relationel NPS 2026 H2" }).click();
    await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Builder" })).toHaveCount(0);
  });
});

test.describe("panel", () => {
  test("filters, saved segment, and profile with consent and contact history", async ({ page }) => {
    await signIn(page, "panel@example.invalid");
    await page.goto("/panel?lifecycle=active");
    await expect(page.locator("h1")).toContainText("Panel");
    await expect(page.getByText(/panelists match/)).toBeVisible();

    await page.goto("/panel/segments");
    await page.getByRole("link", { name: "Aktive kunder med samtykke" }).click();
    await page.waitForURL("**/panel?segment=*");
    const matchText = await page.getByText(/panelists match/).innerText();
    expect(Number(matchText.split(" ")[0])).toBeGreaterThan(50);

    await page.locator("tbody a").first().click();
    await expect(page.getByText("Identity & contact")).toBeVisible();
    await expect(page.getByText("survey_contact")).toBeVisible();
    await expect(page.getByText("Contact history (latest 50)")).toBeVisible();
  });
});

test.describe("respond and close the loop", () => {
  test("detractor response creates an assigned follow-up case via rule", async ({ page, browser }) => {
    await signIn(page, "researcher@example.invalid");
    // The seeded public link for the live NPS study:
    const token = "pub_" + (20260716).toString(36) + "nps";

    const before = await countCases(page);

    const respondent = await browser.newContext({ viewport: { width: 375, height: 720 } });
    const rp = await respondent.newPage();
    await rp.goto(`/s/${token}`);
    await rp.click("button:has-text('Start')");
    await rp.click("[role=radio]:has-text('2')");
    await rp.click("button:has-text('Næste')");
    await rp.click("text=Pris");
    await rp.click("button:has-text('Næste')");
    await rp.waitForSelector("text=Hvad kan vi gøre bedre?");
    await rp.fill("textarea", "E2E-spec detractor besvarelse.");
    await rp.click("button:has-text('Næste')");
    await rp.waitForSelector("text=Må vi kontakte dig");
    await rp.click("[role=radio]:has-text('Ja')");
    await rp.click("button:has-text('Næste')");
    await rp.waitForSelector("text=Tak for din besvarelse");
    await respondent.close();

    const after = await countCases(page);
    expect(after).toBe(before + 1);

    // the new case appears with NPS badge and assignee from the rule
    await page.goto("/followup");
    await expect(page.locator("li", { hasText: "NPS 2" }).first()).toContainText("Rikke Researcher");
  });

  test("response appears in the inbox linked to the exact study version", async ({ page }) => {
    await signIn(page, "researcher@example.invalid");
    await page.goto("/responses");
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("v1");
  });
});

async function countCases(page: import("@playwright/test").Page): Promise<number> {
  await page.goto("/followup");
  const text = await page.getByText(/^Cases \(\d+\)$/).innerText();
  return Number(text.match(/\((\d+)\)/)?.[1] ?? "0");
}

test.describe("analytics", () => {
  test("analyst runs a reproducible NPS analysis on the seeded dataset", async ({ page }) => {
    await signIn(page, "analyst@example.invalid");
    await page.goto("/analytics");
    await page.getByRole("link", { name: /Relationel NPS 2026 H2 — besvarelser/ }).first().click();
    await page.waitForSelector("text=Workspace — v1");
    await page.selectOption("#wb-proc", "nps");
    await page.selectOption("#wb-variable", "nps_score");
    await page.click("text=Run analysis");
    await expect(page.getByText("NPS = %promoters − %detractors")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Libraries: .*pandas/)).toBeVisible();
  });

  test("viewer cannot start analyses", async ({ page }) => {
    await signIn(page, "viewer@example.invalid");
    await page.goto("/analytics");
    await page.getByRole("link", { name: /Relationel NPS 2026 H2 — besvarelser/ }).first().click();
    await page.waitForSelector("text=Workspace — v1");
    await expect(page.getByRole("button", { name: "Run analysis" })).toHaveCount(0);
    await expect(page.getByText("Build dataset from study responses")).toHaveCount(0);
  });
});
