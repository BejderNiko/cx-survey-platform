/**
 * End-to-end study lifecycle verification:
 * create from template → builder edit → publish → public link →
 * respondent completes (mobile viewport, branching) → results → follow-up case.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("app: " + String(e)));

// -- sign in as researcher
await page.goto("http://localhost:3000/login");
await page.fill("#email", "researcher@example.invalid");
await page.fill("#password", "demo1234!");
await page.click("button[type=submit]");
await page.waitForURL("**/home");

// -- create study from NPS template
await page.goto("http://localhost:3000/studies");
await page.fill("#cs-title", "E2E Verifikationsstudie");
await page.selectOption("#cs-tpl", { label: "Relationel NPS / Relational NPS" });
await page.click("text=Create & open builder");
await page.waitForURL("**/builder");
console.log("1. study created, builder open ✓");

// -- builder: select first question and toggle preview
await page.click("text=nps_score");
await page.click("text=Preview");
await page.waitForSelector("text=Undersøgelsen tager 1-2 minutter");
await page.click("text=Close preview");
console.log("2. builder preview works ✓");

// -- publish from study page
const builderUrl = page.url();
const studyUrl = builderUrl.replace(/\/builder$/, "");
await page.goto(studyUrl);
await page.click("button:has-text('Publish')");
await page.waitForSelector("text=Published version 1");
console.log("3. published v1 ✓");

// -- create public link
await page.fill("#dl-name", "E2E link");
await page.click("text=Create public link");
await page.waitForSelector("text=Public link created:");
const linkText = await page.locator("text=Public link created:").innerText();
const publicUrl = linkText.replace("Public link created: ", "").trim();
console.log("4. public link ✓", publicUrl);

// -- respond on a mobile viewport as an anonymous respondent (detractor path)
const mob = await browser.newContext({ viewport: { width: 375, height: 720 } });
const rpage = await mob.newPage();
rpage.on("pageerror", (e) => errors.push("respondent: " + String(e)));
await rpage.goto(publicUrl);
await rpage.click("button:has-text('Start')");
await rpage.click("[role=radio]:has-text('3')"); // nps_score = 3 (detractor)
await rpage.click("button:has-text('Næste')");
await rpage.click("text=Service og betjening"); // main_reason
await rpage.click("button:has-text('Næste')");
// improve_text should be visible (visibleIf nps<=8)
await rpage.waitForSelector("text=Hvad kan vi gøre bedre?");
await rpage.fill("textarea", "E2E: ventetiden var for lang.");
await rpage.click("button:has-text('Næste')");
// praise_text (visibleIf >= 9) must be skipped → consent question next
await rpage.waitForSelector("text=Må vi kontakte dig");
await rpage.click("[role=radio]:has-text('Ja')");
await rpage.click("button:has-text('Næste')");
await rpage.waitForSelector("text=Tak for din besvarelse");
console.log("5. mobile respondent completed with branching ✓");
await mob.close();

// -- results reflect the response
await page.goto(studyUrl + "/results");
await page.waitForSelector("text=Detractors (0-6)");
const main = await page.locator("main").innerText();
console.log("6. results page:", /Completed\s*\n\s*1/.test(main) ? "1 completed ✓" : "✗ unexpected: " + main.slice(0, 200));

// -- promoter path via same link on desktop
const anon2 = await browser.newContext();
const r2 = await anon2.newPage();
r2.on("request", (rq) => { if (rq.url().includes("/api/respond")) console.log("   [r2 req]", rq.url().split("/api/")[1]); });
await r2.goto(publicUrl);
await r2.click("button:has-text('Start')");
await r2.click("[role=radio]:has-text('10')");
await r2.click("button:has-text('Næste')");
await r2.click("text=Pris");
await r2.click("button:has-text('Næste')");
await r2.waitForSelector("text=Hvad sætter du mest pris på?"); // praise (>=9), improve skipped
await r2.fill("textarea", "E2E: altid god service.");
await r2.click("button:has-text('Næste')");
await r2.waitForSelector("text=Må vi kontakte dig");
await r2.click("[role=radio]:has-text('Nej')");
await r2.click("button:has-text('Næste')");
await r2.waitForSelector("text=Tak for din besvarelse");
console.log("7. promoter path (skip improve, show praise) ✓");
await anon2.close();

// -- verify seeded first-click study still responds (click capture)
const [fcToken] = ["pub_" + (20260716).toString(36) + "fc"];
const fcCtx = await browser.newContext();
const fc = await fcCtx.newPage();
await fc.goto("http://localhost:3000/s/" + fcToken);
await fc.click("button:has-text('Start')");
await fc.waitForSelector("img[alt='Test stimulus']");
await fc.locator("img[alt='Test stimulus']").click({ position: { x: 300, y: 100 } });
await fc.waitForSelector("text=Klik registreret");
await fc.click("button:has-text('Næste')");
await fc.click("[role=radio]:has-text('4')");
await fc.click("button:has-text('Næste')");
await fc.fill("textarea", "E2E klik-test");
await fc.click("button:has-text('Næste')");
await fc.waitForSelector("text=Tak for hjælpen");
console.log("8. first-click capture completed ✓");
await fcCtx.close();

console.log("pageerrors:", errors.length ? errors : "none");
await browser.close();
