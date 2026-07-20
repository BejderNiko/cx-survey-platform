/** Drives the full import wizard (upload → map → dry run → commit) in Chromium. */
import { chromium } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const csv = [
  "external_id,fornavn,efternavn,email,sprog,birth_year,by,postnummer,status",
  "IMP-001,Karla,Importsen,karla.importsen@example.invalid,da,1988,Kolding,6000,customer",
  "IMP-002,Ib,Importsen,ib.importsen@example.invalid,da,1975,Vejle,7100,prospect",
  "IMP-003,Bad,Email,not-an-email,da,1990,Horsens,8700,customer",
  "IMP-002,Dup,Licate,dup@example.invalid,da,1980,Vejle,7100,customer",
  "EXT-10001,Updated,Name,panelist001@example.invalid,en,1960,Skagen,9990,customer",
].join("\n");

const dir = mkdtempSync(join(tmpdir(), "import-"));
const csvPath = join(dir, "new-panelists.csv");
writeFileSync(csvPath, "﻿" + csv);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:3000/login");
await page.fill("#email", "panel@example.invalid");
await page.fill("#password", "demo1234!");
await page.click("button[type=submit]");
await page.waitForURL("**/home");
await page.goto("http://localhost:3000/panel/import");

await page.setInputFiles("input[type=file]", csvPath);
await page.click("text=Parse & preview");
await page.waitForSelector("text=5 rows");
console.log("parsed: 5 rows visible");

// auto-mapping should have handled fornavn/efternavn/email/etc.
await page.check("input[type=checkbox] >> nth=0"); // consent confirmation
await page.click("text=Run dry run");
await page.waitForSelector("text=valid 3");
const badges = await page.locator("span:has-text('create'), span:has-text('update'), span:has-text('invalid')").allInnerTexts();
console.log("dry run badges:", badges.join(" | "));

await page.click("text=Commit import");
await page.waitForSelector("text=Imported:");
console.log("commit:", await page.locator("text=Imported:").innerText());

// verify in the panel list
await page.goto("http://localhost:3000/panel?q=Importsen");
await page.waitForSelector("text=karla.importsen@example.invalid");
console.log("Karla visible in panel list ✓");
await page.goto("http://localhost:3000/panel?q=EXT-10001");
const text = await page.locator("main").innerText();
console.log("EXT-10001 updated name visible:", text.includes("Updated Name") ? "✓" : "✗ " + text.slice(0, 300));
console.log("pageerrors:", errors.length ? errors : "none");
await browser.close();
