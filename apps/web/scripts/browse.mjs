/**
 * Dev verification helper: signs in as a seeded user, visits a path, reports
 * console errors, and optionally saves a screenshot.
 *
 *   node scripts/browse.mjs /panel [--as owner@example.invalid] [--shot out.png]
 *     [--viewport 1280x800] [--text] [--click "selector"]
 */
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--")) ?? "/home";
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i === -1 ? def : args[i + 1];
};
const email = get("--as", "owner@example.invalid");
const shot = get("--shot", null);
const [w, h] = get("--viewport", "1280x800").split("x").map(Number);
const wantText = args.includes("--text");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:3000/login");
await page.fill("#email", email);
await page.fill("#password", "demo1234!");
await page.click("button[type=submit]");
await page.waitForURL("**/home", { timeout: 30000 });
await page.goto("http://localhost:3000" + path);
await page.waitForLoadState("networkidle");

console.log("URL:", page.url());
const h1 = await page.locator("h1").first().textContent().catch(() => "(none)");
console.log("H1:", h1);
if (wantText) {
  const text = await page.locator("main").innerText().catch(() => "");
  console.log("TEXT:", text.slice(0, 1200).replace(/\n{2,}/g, "\n"));
}
if (shot) {
  await page.screenshot({ path: shot, fullPage: true });
  console.log("Screenshot:", shot);
}
console.log("Console errors:", errors.length ? errors : "none");
await browser.close();
