"use client";

import { useRef, useState, useTransition } from "react";
import type { StimulusAsset } from "@ok/domain";
import { Button, Input, Label } from "@/components/ui";
import { uploadStimulus } from "../../stimulus-actions";

export function StimulusEditor({
  studyId,
  kind,
  label,
  value,
  onChange,
  onRemove,
}: {
  studyId: string;
  kind: "context" | "preference" | "first_click";
  label: string;
  value: StimulusAsset | null;
  onChange: (asset: StimulusAsset) => void;
  onRemove?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState(value?.altText ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMessage("Vælg en billedfil."); return; }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("altText", altText);
    formData.set("kind", kind);
    startTransition(async () => {
      setMessage(null);
      const result = await uploadStimulus(studyId, formData);
      if (!result.ok) { setMessage(result.error); return; }
      onChange(result.asset);
      setMessage("Billedet er uploadet. Gem kladden for at anvende det.");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function remove() {
    setAltText("");
    setMessage(null);
    onRemove?.();
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-raised p-3">
      <Label>{label}</Label>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/stimuli/${value.assetId}`} alt={value.altText} className="max-h-56 max-w-full rounded-md border border-line object-contain" />
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="Beskriv billedet for skærmlæsere"
          aria-label={`${label}: alt-tekst`}
          maxLength={300}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={`${label}: vælg fil`}
          className="block max-w-full text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={upload} disabled={pending || !altText.trim()}>
          {pending ? "Uploader…" : value ? "Erstat billede" : "Upload billede"}
        </Button>
        {value && onRemove && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>Fjern fra kladde</Button>
        )}
      </div>
      <p className="text-xs text-muted">PNG, JPEG eller WebP. Maks. 8 MB. Alt-tekst er påkrævet.</p>
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </div>
  );
}
