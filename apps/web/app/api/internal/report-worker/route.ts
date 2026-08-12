import { timingSafeEqual } from "node:crypto";
import { processNextReportJob } from "@/lib/report-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = [];
  for (let index = 0; index < 5; index += 1) {
    const result = await processNextReportJob();
    if (!result.processed) break;
    results.push(result);
  }
  return Response.json({ processed: results.length, results }, { headers: { "cache-control": "private, no-store" } });
}