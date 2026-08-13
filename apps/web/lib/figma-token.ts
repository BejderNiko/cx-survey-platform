import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SessionUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const FIGMA_ACCESS_COOKIE = "figma_access";
export const FIGMA_ACCESS_COOKIE_PATH = "/api/figma";
const VERSION = "v1";
const AAD = Buffer.from("cx-survey-platform:figma-access:v1", "utf8");
const MAX_ENVELOPE_LENGTH = 32_000;
const MAX_TOKEN_LENGTH = 16_000;
const MAX_LIFETIME_SECONDS = 3_600;

type BoundIdentity = Pick<SessionUser, "userId" | "orgId">;
type TokenPayload = { userId: string; orgId: string; accessToken: string; expiresAt: number };

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update("figma-access\0", "utf8").update(secret, "utf8").digest();
}

export function sealFigmaToken(
  identity: BoundIdentity,
  accessToken: string,
  expiresInSeconds: number,
  secret: string = env.sessionSecret,
  nowMs: number = Date.now(),
): string {
  if (!accessToken || accessToken.length > MAX_TOKEN_LENGTH) throw new Error("Figma token is invalid.");
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) throw new Error("Figma token expiry is invalid.");
  const lifetime = Math.min(Math.floor(expiresInSeconds), MAX_LIFETIME_SECONDS);
  const payload: TokenPayload = {
    userId: identity.userId,
    orgId: identity.orgId,
    accessToken,
    expiresAt: nowMs + lifetime * 1_000,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function openFigmaToken(
  envelope: string | undefined,
  identity: BoundIdentity,
  secret: string = env.sessionSecret,
  nowMs: number = Date.now(),
): string | null {
  if (!envelope || envelope.length > MAX_ENVELOPE_LENGTH) return null;
  try {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] = envelope.split(".");
    if (version !== VERSION || extra !== undefined || !ivEncoded || !tagEncoded || !ciphertextEncoded) return null;
    const iv = Buffer.from(ivEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plaintext) as Partial<TokenPayload>;
    if (payload.userId !== identity.userId || payload.orgId !== identity.orgId) return null;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt <= nowMs) return null;
    if (typeof payload.accessToken !== "string" || !payload.accessToken || payload.accessToken.length > MAX_TOKEN_LENGTH) return null;
    return payload.accessToken;
  } catch {
    return null;
  }
}
