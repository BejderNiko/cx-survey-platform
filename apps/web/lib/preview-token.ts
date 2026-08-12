import "server-only";

import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const ISSUER = "cx-survey-platform";
const AUDIENCE = "draft-preview";
const MAX_AGE = "24h";

let cachedKey: Uint8Array | undefined;
function signingKey(): Uint8Array {
  return (cachedKey ??= new TextEncoder().encode(env.sessionSecret));
}

export function draftDefinitionHash(definition: unknown): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("base64url");
}

export async function issueDraftPreviewToken(input: {
  studyId: string;
  orgId: string;
  definition: unknown;
}): Promise<string> {
  return new SignJWT({
    purpose: AUDIENCE,
    studyId: input.studyId,
    orgId: input.orgId,
    draftHash: draftDefinitionHash(input.definition),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(MAX_AGE)
    .sign(signingKey());
}

export async function verifyDraftPreviewToken(token: string): Promise<{
  studyId: string;
  orgId: string;
  draftHash: string;
} | null> {
  if (!token || token.length > 1_000) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      payload.purpose !== AUDIENCE
      || typeof payload.studyId !== "string"
      || typeof payload.orgId !== "string"
      || typeof payload.draftHash !== "string"
    ) return null;
    return {
      studyId: payload.studyId,
      orgId: payload.orgId,
      draftHash: payload.draftHash,
    };
  } catch {
    return null;
  }
}
