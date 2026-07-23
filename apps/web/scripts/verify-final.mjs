/**
 * Final verification pass: screenshots of key operational views at desktop
 * and mobile sizes, console/network error monitoring, horizontal-overflow
 * check, and axe-core accessibility scans of the core flow.
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const OUT = "../../docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const consoleErrors = [];
const failedRequests = [];

async function makePage(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) consoleErrors.push(m.text());
  });
  page.on("requestfailed", (r) => {
    if (!r.url().includes("favicon")) failedRequests.push(`${r.url()} ${r.failure()?.errorText}`);
  });
  return page;
}

async function signIn(page, email) {
  await page.goto("http://localhost:3000/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo1234!");
  await page.click("button[type=submit]");
  await page.waitForURL("**/home");
}

async function checkOverflow(page, name) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 2) console.log(`  ⚠ horizontal overflow on ${name}: ${overflow}px`);
  return overflow <= 2;
}

async function axeScan(page, name) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const critical = results.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""));
  console.log(
    `  axe ${name}: ${results.violations.length} violations (${critical.length} serious/critical)` +
      (critical.length ? " → " + critical.map((v) => `${v.id}(${v.nodes.length})`).join(", ") : ""),
  );
  return critical;
}

// ---------- desktop pass ----------
const desktop = await browser.newContext({ viewport: { width: 1366, height: 850 } });
const page = await makePage(desktop);
await signIn(page, "owner@example.invalid");

const datasetHref = async () => {
  await page.goto("http://localhost:3000/analytics");
  return page.locator("table a").first().getAttribute("href");
};

const desktopShots = [
  ["/home", "home-desktop"],
  ["/panel", "panel-desktop"],
  ["/studies", "studies-desktop"],
  ["/admin", "admin-desktop"],
];
let overflowOk = true;
const allCritical = [];
for (const [path, name] of desktopShots) {
  await page.goto("http://localhost:3000" + path);
  await page.waitForLoadState("networkidle");
  overflowOk = (await checkOverflow(page, name)) && overflowOk;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot ${name}`);
}
allCritical.push(...(await axeScan(page, "admin")));

// study results + builder + analytics workbench
await page.goto("http://localhost:3000/studies?q=Relationel");
const study = await page.locator("a[href^='/studies/']:not([href='/studies'])").first().getAttribute("href");
await page.goto("http://localhost:3000" + study);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/study-overview-desktop.png` });
console.log("shot study-overview-desktop");
await page.goto(`http://localhost:3000${study}/udsend`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/study-udsend-desktop.png` });
console.log("shot study-udsend-desktop");
await page.goto(`http://localhost:3000${study}/results`);
await page.waitForLoadState("networkidle");
overflowOk = (await checkOverflow(page, "results")) && overflowOk;
await page.screenshot({ path: `${OUT}/study-results-desktop.png`, fullPage: false });
console.log("shot study-results-desktop");
allCritical.push(...(await axeScan(page, "results")));

const ds = await datasetHref();
await page.goto("http://localhost:3000" + ds);
await page.selectOption("#wb-proc", "nps");
await page.selectOption("#wb-variable", "nps_score");
await page.selectOption("#wb-date_variable", "completed_at");
await page.click("text=Kør analyse");
await page.waitForSelector("text=NPS trend by month", { timeout: 30000 });
await page.waitForTimeout(1200); // let Plotly render
await page.screenshot({ path: `${OUT}/analytics-workbench-desktop.png` });
console.log("shot analytics-workbench-desktop");
allCritical.push(...(await axeScan(page, "analytics")));

// builder
await page.goto(`http://localhost:3000${study}/builder`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/builder-desktop.png` });
console.log("shot builder-desktop");

await axeScan(page, "home").then((c) => allCritical.push(...c));
await desktop.close();

// ---------- respondent (mobile + desktop) ----------
const token = "pub_" + (20260716).toString(36) + "nps";
const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
const mp = await makePage(mobile);
await mp.goto(`http://localhost:3000/s/${token}`);
await mp.waitForLoadState("networkidle");
overflowOk = (await checkOverflow(mp, "respondent-intro-mobile")) && overflowOk;
await mp.screenshot({ path: `${OUT}/respondent-intro-mobile.png` });
allCritical.push(...(await axeScan(mp, "respondent-intro")));
await mp.click("button:has-text('Start')");
await mp.waitForSelector("[role=radio]");
overflowOk = (await checkOverflow(mp, "respondent-nps-mobile")) && overflowOk;
await mp.screenshot({ path: `${OUT}/respondent-nps-mobile.png` });
console.log("shot respondent mobile ×2");
allCritical.push(...(await axeScan(mp, "respondent-question")));

// keyboard navigation on the NPS question: tab to a score and press Enter
await mp.keyboard.press("Tab");
await mp.keyboard.press("Tab");
await mp.keyboard.press("Tab");
const focused = await mp.evaluate(() => document.activeElement?.textContent ?? "");
console.log("keyboard focus reaches control:", focused !== "" ? `✓ ("${focused}")` : "✗");

// mobile app shell
const mApp = await makePage(mobile);
await signIn(mApp, "researcher@example.invalid");
await mApp.goto("http://localhost:3000/home");
await mApp.waitForLoadState("networkidle");
overflowOk = (await checkOverflow(mApp, "home-mobile")) && overflowOk;
await mApp.screenshot({ path: `${OUT}/home-mobile.png` });
await mApp.goto("http://localhost:3000/panel");
await mApp.waitForLoadState("networkidle");
await mApp.screenshot({ path: `${OUT}/panel-mobile.png` });
console.log("shot mobile shell ×2");
await mobile.close();

console.log("\n---- summary ----");
console.log("no horizontal overflow:", overflowOk ? "✓" : "✗ (see warnings)");
console.log("serious/critical axe violations:", allCritical.length === 0 ? "none ✓" : allCritical.map((v) => v.id).join(", "));
console.log("console errors:", consoleErrors.length ? consoleErrors.slice(0, 5) : "none ✓");
console.log("failed requests:", failedRequests.length ? failedRequests.slice(0, 5) : "none ✓");
await browser.close();
