import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function isLoopback(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || hostname.startsWith("127.");
  } catch {
    return false;
  }
}

function isLocalE2E(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  const adminDatabaseUrl = process.env.DATABASE_ADMIN_URL;
  if (!databaseUrl || !adminDatabaseUrl || process.env.LOCAL_DATABASE_ENGINE !== "native") return false;
  let baseUrl: URL;
  try {
    baseUrl = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000");
  } catch {
    return false;
  }
  if (baseUrl.protocol !== "http:" || baseUrl.port !== "3000" || baseUrl.pathname !== "/"
    || !isLoopback(baseUrl.href)
    || !isLoopback(databaseUrl)
    || !isLoopback(adminDatabaseUrl)) return false;

  try {
    const appTarget = new URL(databaseUrl);
    const adminTarget = new URL(adminDatabaseUrl);
    return appTarget.host === adminTarget.host && appTarget.pathname === adminTarget.pathname;
  } catch {
    return false;
  }
}

test("viewer can create feedback and study comment, then reload and verify both persist", async ({ page, browser }) => {
  test.skip(!isLocalE2E(), "Writes and cleanup are limited to a local E2E database.");
  const requestTitle = `E2E feedback ${randomUUID()}`;
  const commentBody = `E2E study comment ${randomUUID()}`;
  const admin = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1, prepare: false });
  let commentId: string | null = null;

  try {
    await page.goto("/login");
    await page.locator("#email").fill("viewer@example.invalid");
    await page.locator("#password").fill("demo1234!");
    await page.getByRole("button", { name: "Log ind" }).click();
    await page.waitForURL("**/studies");

    await page.getByRole("button", { name: "Give feedback" }).click();
    const title = page.getByRole("textbox", { name: "Short title" });
    const description = page.getByRole("textbox", { name: "What should improve?" });
    await title.fill("No");
    await description.fill("Test note");
    await expect(page.getByRole("button", { name: "Add to feature requests" })).toBeDisabled();
    await title.fill(requestTitle);
    await description.fill("Disposable local end-to-end feedback record.");
    await expect(page.getByRole("button", { name: "Add to feature requests" })).toBeEnabled();
    await page.getByRole("button", { name: "Add to feature requests" }).click();
    await expect(page.getByRole("status")).toHaveText("Feedback added to feature requests.");

    const ownerPage = await browser.newPage();
    try {
      await ownerPage.goto("/login");
      await ownerPage.locator("#email").fill("owner@example.invalid");
      await ownerPage.locator("#password").fill("demo1234!");
      await ownerPage.getByRole("button", { name: "Log ind" }).click();
      await ownerPage.waitForURL("**/studies");
      await ownerPage.goto("/feature-requests");
      await ownerPage.getByRole("searchbox", { name: "Search feature requests" }).fill(requestTitle);
      await expect(ownerPage.locator("article").filter({ hasText: requestTitle })).toContainText("Disposable local end-to-end feedback record.");
    } finally {
      await ownerPage.close();
    }

    await page.getByRole("button", { name: "Capture UI area" }).click();
    await expect(page.getByText("Drag to select UI area · Escape to cancel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Drag to select UI area · Escape to cancel")).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();

    const studyPath = await page.getByRole("link", { name: "Åbn studie" }).first().getAttribute("href");
    expect(studyPath).toBeTruthy();
    await page.goto(studyPath!);
    await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
    await expect(page.getByText("Study discussion")).toBeVisible();
    await page.getByRole("textbox", { name: "New comment" }).fill(commentBody);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const commentThread = page.locator("li[id^='comment-thread-']").filter({ hasText: commentBody });
    await expect(commentThread).toBeVisible();
    commentId = (await commentThread.getAttribute("id"))?.replace("comment-thread-", "") ?? null;
    await page.reload();
    const persistedThread = page.locator("li[id^='comment-thread-']").filter({ hasText: commentBody });
    await expect(persistedThread).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await persistedThread.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(commentBody)).toHaveCount(0);

    const filters = page.getByRole("group", { name: "Filter comment threads" });
    await filters.getByRole("button", { name: /^Open/ }).click();
    await expect(filters.getByRole("button", { name: /^Open/ })).toHaveAttribute("aria-pressed", "true");
  } finally {
    if (commentId) await admin`delete from comments where id = ${commentId}`;
    await admin`delete from comments c using users u where c.author_id = u.id and u.email = 'viewer@example.invalid' and c.body = ${commentBody}`;
    await admin`delete from feature_request_events where feature_request_id in (select id from feature_requests where title = ${requestTitle})`;
    await admin`delete from feature_requests where title = ${requestTitle}`;
    await admin.end();
  }
});
