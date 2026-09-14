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
  optionalVisibility = true,
}: {
  studyId: string;
  kind: "context" | "preference" | "first_click" | "prototype_frame";
  label: string;
  value: StimulusAsset | null;
  onChange: (asset: StimulusAsset) => void;
  onRemove?: () => void;
  optionalVisibility?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imageCanBeDisabled = optionalVisibility;
  const [altText, setAltText] = useState(value?.altText ?? "");
  const [displayWidthPercent, setDisplayWidthPercent] = useState(value?.displayWidthPercent ?? 100);
  const [enabled, setEnabled] = useState(value?.enabled === true || !imageCanBeDisabled);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);


  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMessage("Select an image file."); return; }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("altText", altText);
    formData.set("kind", kind);
    startTransition(async () => {
      setMessage(null);
      const result = await uploadStimulus(studyId, formData);
      if (!result.ok) { setMessage(result.error); return; }
      const nextEnabled = !imageCanBeDisabled;
      setEnabled(nextEnabled);
      onChange({ ...result.asset, enabled: nextEnabled, displayWidthPercent });
      setMessage("Image uploaded. Save the draft to apply it.");
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFile(null);
    });
  }

  function remove() {
    setAltText("");
    setDisplayWidthPercent(100);
    setEnabled(!imageCanBeDisabled);
    setSelectedFile(null);
    setMessage(null);
    onRemove?.();
  }

  function updateEnabled(next: boolean) {
    setEnabled(next);
    if (value) onChange({ ...value, enabled: next });
  }

  function updateWidth(width: number) {
    setDisplayWidthPercent(width);
    if (value) onChange({ ...value, displayWidthPercent: width });
  }

  const width = value?.displayWidthPercent ?? displayWidthPercent;

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-raised p-3">
      <Label>{label}</Label>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={"/api/stimuli/" + value.assetId} alt={value.altText} style={{ width: width + "%" }} className="block max-h-56 max-w-full rounded-md border border-line object-contain" />
      )}
      {value && imageCanBeDisabled && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={enabled} onChange={(event) => updateEnabled(event.target.checked)} />
          Show image in survey
        </label>
      )}
      {value && imageCanBeDisabled && !enabled && (
        <p className="text-xs text-muted">Image is disabled by default and will not be shown to participants.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="Describe image for screen readers"
          aria-label={label + ": alt text"}
          maxLength={300}
        />
        <div className="flex items-center gap-2 rounded-md border border-line bg-background p-1">
          <label className="inline-flex cursor-pointer items-center rounded bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 focus-within:outline focus-within:outline-2 focus-within:outline-accent">
            Select file
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={label + ": select file"}
              onChange={(event) => setSelectedFile(event.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
          </label>
          <span className="truncate text-xs text-muted">{selectedFile ?? "No file selected"}</span>
        </div>
      </div>
      {value && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Image width</span>
            <output>{width}%</output>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={width}
            onChange={(event) => updateWidth(Number(event.target.value))}
            className="w-full accent-accent"
            aria-label={label + ": image width"}
          />
          <div className="flex gap-1">
            {[50, 75, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-heading"
                onClick={() => updateWidth(preset)}
              >
                {preset}%
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={upload} disabled={pending || !altText.trim()}>
          {pending ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </Button>
        {value && onRemove && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>Remove from draft</Button>
        )}
      </div>
      <p className="text-xs text-muted">PNG, JPEG or WebP. Max. 8 MB. Alt text required.</p>
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </div>
  );
}
