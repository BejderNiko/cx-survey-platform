import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, appDb, asUser } from "./helpers/db";
import { env } from "@/lib/env";

let admin: ReturnType<typeof adminDb>;
let app: ReturnType<typeof appDb>;

let orgA: string;
let orgB: string;
let viewerId: string;

function getAdmin(): ReturnType<typeof adminDb> {
  if (!admin) throw new Error("Local DB RLS test was not initialized.");
  return admin;
}

function getApp(): ReturnType<typeof appDb> {
  if (!app) throw new Error("Local DB RLS test was not initialized.");
  return app;
}

function localDbOnly(): boolean {
  try {
    const urls = [env.databaseUrl, env.databaseAdminUrl];
    return urls.every((value) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(value).hostname));
  } catch {
    return false;
  }
}

const ROLLBACK = "ROLLBACK FEATURE REQUEST RLS TEST";

describe.skipIf(!localDbOnly())("feature request submission RLS (local database only)", () => {
  beforeAll(async () => {
    admin = adminDb();
    app = appDb();
    const db = getAdmin();
    const [a] = await db`select id from organizations where slug = 'ok-cx'`;
    const [b] = await db`select id from organizations where slug = 'nordvind-demo'`;
    const [viewer] = await db`
      select u.id from users u
      join memberships m on m.user_id = u.id
      where u.email = 'viewer@example.invalid' and m.org_id = ${a.id}
        and m.role = 'viewer' and m.deactivated_at is null and u.is_active`;
    orgA = String(a.id);
    orgB = String(b.id);
    viewerId = String(viewer.id);
  });

  afterAll(async () => {
    if (app) await app.end();
    if (admin) await admin.end();
  });

  it("allows seeded viewer to insert request and event within org, then rolls transaction back", async () => {
    const outcome = await asUser(getApp(), viewerId, orgA, async (tx) => {
      let requestId: string | null = null;
      let eventId: string | null = null;
      try {
        const [request] = await tx`
          insert into feature_requests (org_id, title, description, target_snapshot, created_by)
          values (${orgA}, 'Viewer RLS feedback', 'Feedback from seeded viewer', ${tx.json({ sourceType: "manual" })}, ${viewerId})
          returning id`;
        requestId = String(request.id);
        const [event] = await tx`
          insert into feature_request_events (org_id, feature_request_id, actor_user_id, event_type, details)
          values (${orgA}, ${request.id}, ${viewerId}, 'created', ${tx.json({ title: "Viewer RLS feedback" })})
          returning id`;
        eventId = String(event.id);
      } catch (error) {
        throw Object.assign(new Error(ROLLBACK), { cause: error });
      }
      throw Object.assign(new Error(ROLLBACK), { requestId, eventId });
    }).catch((error: Error & { requestId?: string; eventId?: string }) => error);

    expect(outcome.message).toBe(ROLLBACK);
    expect(outcome.requestId).toBeTruthy();
    expect(outcome.eventId).toBeTruthy();
  });

  it("rejects viewer insert targeting another organization and rolls transaction back", async () => {
    const outcome = await asUser(getApp(), viewerId, orgA, async (tx) => {
      let denialCode: unknown;
      try {
        await tx`
          insert into feature_requests (org_id, title, description, created_by)
          values (${orgB}, 'Cross tenant feedback', 'Must be rejected', ${viewerId})`;
      } catch (error) {
        denialCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
      }
      throw Object.assign(new Error(ROLLBACK), { denialCode });
    }).catch((error: Error & { denialCode?: unknown }) => error);

    expect(outcome.message).toBe(ROLLBACK);
    expect(outcome.denialCode).toBe("42501");
  });
});
