import { getSession } from "@/lib/auth";
import { assertFigmaDraftAccess, figmaDraftAccessResponse } from "@/lib/figma-access";
import { createFigmaAuthorization } from "@/lib/figma-oauth";

export async function GET(request: Request) {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url); const studyId = url.searchParams.get("studyId"); const questionCode = url.searchParams.get("questionCode");
  if (!studyId || !questionCode) return Response.json({ error: "invalid_request" }, { status: 400 });
  try { await assertFigmaDraftAccess(session, studyId, questionCode); } catch (error) { return figmaDraftAccessResponse(error); }
  const authorization = await createFigmaAuthorization(session, studyId, questionCode);
  if (!authorization) return Response.json({ error: "figma_oauth_not_configured" }, { status: 503 });
  return Response.redirect(authorization, 302);
}
