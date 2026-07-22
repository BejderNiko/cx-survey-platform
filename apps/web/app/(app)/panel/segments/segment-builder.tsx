"use client";

import { useState, useTransition } from "react";
import type { SegmentFilter } from "@ok/domain";
import { Button, Input, Label, Select } from "@/components/ui";
import { createSegment, deleteSegment, previewSegmentCount } from "../actions";

interface AttributeField {
  key: string;
  label: string;
  fieldType: string;
  options: string[];
}

type Row = { field: string; key?: string; op: string; value: string };

const OP_LABEL: Record<string, string> = {
  eq: "er lig med",
  ne: "er forskellig fra",
  contains: "indeholder",
  gte: "er mindst",
  lte: "er højst",
  has: "har",
  not_has: "har ikke",
};

const DIRECT_FIELDS = [
  { field: "lifecycle", label: "Livscyklus", ops: ["eq", "ne"] },
  { field: "customer_status", label: "Kundestatus", ops: ["eq", "ne"] },
  { field: "language", label: "Sprog", ops: ["eq", "ne"] },
  { field: "gender", label: "Køn", ops: ["eq", "ne"] },
  { field: "city", label: "By", ops: ["eq", "contains"] },
  { field: "country", label: "Land", ops: ["eq"] },
  { field: "birth_year", label: "Fødselsår", ops: ["gte", "lte"] },
  { field: "tag", label: "Har tag", ops: ["has", "not_has"] },
  { field: "consent", label: "Samtykke givet til", ops: ["eq"] },
  { field: "last_contact_days_gt", label: "Ingen kontakt i N dage", ops: ["gte"] },
];

function toDefinition(rows: Row[], attributeFields: AttributeField[]): { filters: SegmentFilter[] } {
  return {
    filters: rows
      .filter((r) => r.value !== "" || r.op === "has" || r.op === "not_has")
      .map((r) => {
        const isAttr = r.field.startsWith("attr:");
        const key = isAttr ? r.field.slice(5) : undefined;
        const attr = attributeFields.find((f) => f.key === key);
        let value: unknown = r.value;
        if (r.field === "birth_year" || r.field === "last_contact_days_gt") value = Number(r.value);
        if (isAttr && attr?.fieldType === "multi_select") {
          return { field: "attribute", key, op: "has", value } as SegmentFilter;
        }
        if (isAttr) {
          return { field: "attribute", key, op: "eq", value } as SegmentFilter;
        }
        return { field: r.field, op: r.op, value } as SegmentFilter;
      }),
  };
}

export function SegmentBuilder({ attributeFields, tags }: { attributeFields: AttributeField[]; tags: string[] }) {
  const [rows, setRows] = useState<Row[]>([{ field: "lifecycle", op: "eq", value: "active" }]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setPreview(null);
  };

  const fieldOptions = [
    ...DIRECT_FIELDS.map((f) => ({ value: f.field, label: f.label })),
    ...attributeFields.map((f) => ({ value: `attr:${f.key}`, label: `Attribut: ${f.label}` })),
  ];

  function valueInput(r: Row, i: number) {
    if (r.field === "tag") {
      return (
        <Select aria-label="Tag" value={r.value} onChange={(e) => update(i, { value: e.target.value })}>
          <option value="">vælg…</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      );
    }
    if (r.field === "consent") {
      return (
        <Select aria-label="Formål" value={r.value} onChange={(e) => update(i, { value: e.target.value })}>
          <option value="">vælg…</option>
          <option value="survey_contact">survey_contact</option>
          <option value="panel_membership">panel_membership</option>
          <option value="profiling">profiling</option>
        </Select>
      );
    }
    if (r.field.startsWith("attr:")) {
      const attr = attributeFields.find((f) => f.key === r.field.slice(5));
      if (attr && attr.options.length > 0) {
        return (
          <Select aria-label="Værdi" value={r.value} onChange={(e) => update(i, { value: e.target.value })}>
            <option value="">vælg…</option>
            {attr.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        );
      }
    }
    return (
      <Input
        aria-label="Værdi"
        value={r.value}
        onChange={(e) => update(i, { value: e.target.value })}
        className="w-40"
        type={r.field === "birth_year" || r.field === "last_contact_days_gt" ? "number" : "text"}
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const direct = DIRECT_FIELDS.find((f) => f.field === r.field);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Felt"
              value={r.field}
              onChange={(e) => update(i, { field: e.target.value, op: "eq", value: "" })}
            >
              {fieldOptions.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
            <Select aria-label="Operator" value={r.op} onChange={(e) => update(i, { op: e.target.value })}>
              {(direct?.ops ?? ["eq"]).map((op) => <option key={op} value={op}>{OP_LABEL[op] ?? op}</option>)}
            </Select>
            {valueInput(r, i)}
            <Button size="sm" variant="ghost" aria-label="Fjern filter" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
              ×
            </Button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, { field: "lifecycle", op: "eq", value: "" }])}>
          + Tilføj filter
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                setPreview(await previewSegmentCount(toDefinition(rows, attributeFields)));
              } catch {
                setError("Kunne ikke beregne — tjek filterværdierne.");
              }
            })
          }
        >
          Forhåndsvis antal
        </Button>
        {preview !== null && <span className="self-center text-sm">{preview} panelister matcher</span>}
        {error && <span className="self-center text-sm text-danger">{error}</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="seg-name">Navn</Label>
          <Input id="seg-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="seg-desc">Beskrivelse</Label>
          <Input id="seg-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <Button
        disabled={pending || !name.trim() || rows.length === 0}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await createSegment(name, description, toDefinition(rows, attributeFields));
              setName("");
              setDescription("");
              setPreview(null);
            } catch {
              setError("Segmentet kunne ikke gemmes.");
            }
          })
        }
      >
        Gem segment
      </Button>
    </div>
  );
}

export function SegmentDeleteButton({ segmentId }: { segmentId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(() => deleteSegment(segmentId))}>
      Slet
    </Button>
  );
}
