import { assertCan } from "@ok/domain";
import { getSession } from "@/lib/auth";
import { createFigmaAuthorization } from "@/lib/figma-oauth";

export async function GET(request: Request) {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { assertCan(session.role, "studies.edit"); } catch { return Response.json({ error: "forbidden" }, { status: 403 }); }
  const url = new URL(request.url); const studyId = url.searchParams.get("studyId"); const questionCode = url.searchParams.get("questionCode");
  if (!studyId || !questionCode) return Response.json({ error: "invalid_request" }, { status: 400 });
  const authorization = await createFigmaAuthorization(session, studyId, questionCode);
  if (!authorization) return Response.json({ error: "figma_oauth_not_configured" }, { status: 503 });
  return Response.redirect(authorization, 302);
}