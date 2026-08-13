import { timingSafeEqual } from "node:crypto";
import { assertCan } from "@ok/domain";
import { getSession, withAuthorized } from "@/lib/auth";
import { processNextReportJob } from "@/lib/report-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = [];
  for (let index = 0; index < 5; index += 1) {
    const result = await processNextReportJob();
    if (!result.processed) break;
    results.push(result);
  }
  return Response.json({ processed: results.length, results }, { headers: { "cache-control": "private, no-store" } });
}

/** Preview/local-only manual recovery trigger. Production always rejects it. */
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL)) {
    return Response.json({ error: "manual_worker_disabled" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    assertCan(session.role, "reports.create");
    await withAuthorized("reports.create", async () => true);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await processNextReportJob(session.orgId);
  return Response.json(result, { headers: { "cache-control": "private, no-store" } });
}
