export type CreateFeatureRequestInput = {
  title: string;
  description: string;
  sourcePath?: string;
  section?: string;
  sourceType?: "manual" | "feedback";
  targetSnapshot?: Record<string, unknown>;
};

export type ValidatedFeatureRequestInput = CreateFeatureRequestInput & {
  sourceType: "manual" | "feedback";
  targetSnapshot: Record<string, unknown>;
};

export type FeatureRequestInputValidation =
  | { ok: true; value: ValidatedFeatureRequestInput }
  | { ok: false; error: string };

export function validateFeatureRequestInput(input: unknown): FeatureRequestInputValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Feedback could not be saved. Check the form and try again." };
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.title !== "string" || typeof candidate.description !== "string") {
    return { ok: false, error: "Feedback could not be saved. Check the form and try again." };
  }

  const title = candidate.title.trim();
  const description = candidate.description.trim();
  if (title.length < 3 || title.length > 160) return { ok: false, error: "Titel skal være 3-160 tegn." };
  if (description.length < 1 || description.length > 5000) return { ok: false, error: "Beskrivelse skal være 1-5.000 tegn." };

  const sourceType = candidate.sourceType ?? "manual";
  if (sourceType !== "manual" && sourceType !== "feedback") {
    return { ok: false, error: "Feedback type is invalid." };
  }
  if (candidate.sourcePath !== undefined && typeof candidate.sourcePath !== "string") {
    return { ok: false, error: "Feedback page reference is invalid." };
  }
  if (candidate.section !== undefined && typeof candidate.section !== "string") {
    return { ok: false, error: "Feedback section is invalid." };
  }

  const targetSnapshot = candidate.targetSnapshot ?? {};
  if (!targetSnapshot || typeof targetSnapshot !== "object" || Array.isArray(targetSnapshot)) {
    return { ok: false, error: "Feedback capture data is invalid." };
  }

  let snapshotJson: string | undefined;
  try {
    snapshotJson = JSON.stringify({ ...(targetSnapshot as Record<string, unknown>), sourceType });
  } catch {
    return { ok: false, error: "Feedback capture data is invalid." };
  }
  if (typeof snapshotJson !== "string") {
    return { ok: false, error: "Feedback capture data is invalid." };
  }
  if (new TextEncoder().encode(snapshotJson).byteLength > 30_000) {
    return { ok: false, error: "Feedback capture is too large. Remove some details and try again." };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      sourceType,
      sourcePath: typeof candidate.sourcePath === "string" ? candidate.sourcePath.slice(0, 500) : undefined,
      section: typeof candidate.section === "string" ? candidate.section.slice(0, 120) : undefined,
      targetSnapshot: JSON.parse(snapshotJson) as Record<string, unknown>,
    },
  };
}
