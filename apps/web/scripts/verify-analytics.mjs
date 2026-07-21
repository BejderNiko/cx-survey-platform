/** Analyst E2E: dataset → quick NPS → advanced crosstab + recipe → rerun → derive → export. */
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:3000/login");
await page.fill("#email", "analyst@example.invalid");
await page.fill("#password", "demo1234!");
await page.click("button[type=submit]");
await page.waitForURL("**/home");

await page.goto("http://localhost:3000/analytics");
await page.click("text=Relationel NPS 2026 H2 — besvarelser");
await page.waitForSelector("text=Workspace — v1");
console.log("1. dataset page open ✓");

// Quick NPS with trend
await page.selectOption("#wb-proc", "nps");
await page.selectOption("#wb-variable", "nps_score");
await page.selectOption("#wb-date_variable", "completed_at");
await page.click("text=Run analysis");
await page.waitForSelector("text=NPS = %promoters − %detractors", { timeout: 30000 });
const npsText = await page.locator("main").innerText();
const npsMatch = npsText.match(/NPS = %promoters − %detractors\s*\n?\s*([-\d.,]+)/);
console.log("2. quick NPS ran ✓ value:", npsMatch?.[1]);
console.log("   trend table:", npsText.includes("NPS trend by month") ? "✓" : "✗");

// Advanced: crosstab + save recipe
await page.click("text=Advanced");
await page.selectOption("#wb-proc", "crosstab");
await page.selectOption("#wb-row", "main_reason");
await page.selectOption("#wb-column", "panelist_gender");
await page.fill("#wb-recipe", "Reason × gender");
await page.click("text=Run analysis");
await page.waitForSelector("text=Independence tests", { timeout: 30000 });
console.log("3. crosstab with chi-square ✓");

// Regression
await page.selectOption("#wb-proc", "linear_regression");
await page.selectOption("#wb-dependent", "nps_score");
await page.selectOption("#wb-predictors", ["panelist_birth_year", "contact_ok"]);
await page.click("text=Run analysis");
await page.waitForSelector("text=Coefficients", { timeout: 30000 });
console.log("4. OLS regression ✓");

// Recipe rerun
await page.waitForSelector("text=Reason × gender");
await page.click("button:has-text('Rerun on v1')");
await page.waitForSelector("text=Independence tests", { timeout: 30000 });
console.log("5. saved recipe rerun ✓");

// Derive dataset (detractors only)
await page.click("role=tab[name='Derive dataset']");
await page.fill("#dv-name", "Detractors only");
await page.selectOption("#dv-filter", "nps_score");
await page.selectOption("[aria-label='Filter operator']", "lte");
await page.fill("[aria-label='Filter value']", "6");
await page.click("text=Create derived dataset");
await page.waitForSelector("text=Created derived dataset");
console.log("6. derived dataset ✓", await page.locator("text=Created derived dataset").innerText());

// Exports (csv + sav) via authenticated request
for (const fmt of ["csv", "sav", "xlsx", "json"]) {
  const url = await page.locator(`a:has-text('${fmt.toUpperCase()}')`).first().getAttribute("href");
  const res = await page.request.get("http://localhost:3000" + url);
  console.log(`7. export ${fmt}:`, res.status(), res.headers()["content-type"]?.split(";")[0], (await res.body()).length, "bytes");
}

console.log("pageerrors:", errors.length ? errors : "none");
await browser.close();
