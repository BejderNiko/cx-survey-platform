import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { SessionUser } from "@/lib/auth";
import { env } from "@/lib/env";

function configured() { return Boolean(process.env.FIGMA_OAUTH_CLIENT_ID && process.env.FIGMA_OAUTH_CLIENT_SECRET && process.env.FIGMA_OAUTH_REDIRECT_URI); }
function key() { return createHash("sha256").update(env.sessionSecret).digest(); }
export function figmaOAuthConfigured(): boolean { return configured(); }
export async function createFigmaAuthorization(session: SessionUser, studyId: string, questionCode: string) {
  if (!configured()) return null;
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = await new EncryptJWT({ orgId: session.orgId, userId: session.userId, studyId, questionCode, verifier })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime("10m").encrypt(key());
  const params = new URLSearchParams({ client_id: process.env.FIGMA_OAUTH_CLIENT_ID!, redirect_uri: process.env.FIGMA_OAUTH_REDIRECT_URI!, scope: "file_content:read", state, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" });
  return `https://www.figma.com/oauth?${params}`;
}
export async function verifyFigmaState(state: string) {
  const { payload } = await jwtDecrypt(state, key());
  return { orgId: String(payload.orgId), userId: String(payload.userId), studyId: String(payload.studyId), questionCode: String(payload.questionCode), verifier: String(payload.verifier) };
}
export async function exchangeFigmaCode(code: string, verifier: string) {
  if (!configured()) throw new Error("Figma OAuth is not configured.");
  const basic = Buffer.from(`${process.env.FIGMA_OAUTH_CLIENT_ID}:${process.env.FIGMA_OAUTH_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({ redirect_uri: process.env.FIGMA_OAUTH_REDIRECT_URI!, code, grant_type: "authorization_code", code_verifier: verifier });
  const response = await fetch("https://api.figma.com/v1/oauth/token", { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  if (!response.ok) throw new Error(`Figma OAuth exchange failed (${response.status}).`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; user_id_string: string }>;
}