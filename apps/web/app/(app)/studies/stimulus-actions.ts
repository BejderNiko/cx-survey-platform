"use server";

import { randomUUID } from "node:crypto";
import type { StimulusAsset } from "@ok/domain";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteStimulusObject, putStimulusObject } from "@/lib/stimulus-storage";

const MAX_STIMULUS_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

function hasSignature(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length
    && signature.every((byte, index) => bytes[offset + index] === byte);
}

function matchesImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/png") return hasSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === "image/jpeg") return hasSignature(bytes, [0xff, 0xd8, 0xff]);
  return contentType === "image/webp"
    && hasSignature(bytes, [0x52, 0x49, 0x46, 0x46])
    && hasSignature(bytes, [0x57, 0x45, 0x42, 0x50], 8);
}

export type UploadStimulusResult =
  | { ok: true; asset: StimulusAsset }
  | { ok: false; error: string };

export async function uploadStimulus(studyId: string, formData: FormData): Promise<UploadStimulusResult> {
  const file = formData.get("file");
  const altText = String(formData.get("altText") ?? "").trim();
  const kind = String(formData.get("kind") ?? "preference");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Vælg en billedfil." };
  if (!altText) return { ok: false, error: "Alt-tekst er påkrævet." };
  if (altText.length > 300) return { ok: false, error: "Alt-tekst må højst være 300 tegn." };
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) return { ok: false, error: "Brug PNG, JPEG eller WebP." };
  if (file.size > MAX_STIMULUS_BYTES) return { ok: false, error: "Billedet må højst fylde 8 MB." };
  if (!["context", "preference", "first_click"].includes(kind)) return { ok: false, error: "Ukendt stimulustype." };

  const assetId = randomUUID();
  let storedKey: string | null = null;
  let validationError: string | null = null;
  try {
    const asset = await withAuthorized("studies.edit", async (tx, session) => {
      const [study] = await tx`select id from studies where id = ${studyId} and org_id = ${session.orgId}`;
      if (!study) throw new Error("Studiet blev ikke fundet.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesImageSignature(bytes, file.type)) {
        validationError = "Filens indhold matcher ikke den valgte billedtype.";
        throw new Error("Stimulus file signature mismatch.");
      }
      const storageKey = `${session.orgId}/${studyId}/${assetId}.${extension}`;
      await putStimulusObject(storageKey, bytes, file.type);
      storedKey = storageKey;
      await tx`
        insert into media_assets (id, org_id, study_id, storage_key, content_type, byte_size, alt_text, kind, created_by)
        values (${assetId}, ${session.orgId}, ${studyId}, ${storageKey}, ${file.type}, ${file.size},
                ${altText}, ${kind}, ${session.userId})`;
      await audit(tx, {
        orgId: session.orgId,
        actorUserId: session.userId,
        action: "stimulus.upload",
        entityType: "study",
        entityId: studyId,
        details: { assetId, kind, byteSize: file.size, contentType: file.type },
      });
      return { id: assetId, assetId, altText } satisfies StimulusAsset;
    });
    return { ok: true, asset };
  } catch {
    if (storedKey) await deleteStimulusObject(storedKey).catch(() => undefined);
    return { ok: false, error: validationError ?? "Billedet kunne ikke uploades. Prøv igen." };
  }
}
