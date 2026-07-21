"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Button, Card, Select, Table, Td, Th } from "@/components/ui";
import { TARGET_FIELDS } from "@/lib/import/validate";
import { commitStep, dryRunStep, parseStep } from "./actions";

type ParseResult = Awaited<ReturnType<typeof parseStep>>;
type DryRunResult = Awaited<ReturnType<typeof dryRunStep>>;
type CommitResult = Awaited<ReturnType<typeof commitStep>>;

interface Batch {
  id: string;
  filename: string;
  status: string;
  counts: Record<string, number>;
  createdAt: string;
  errorCount: number;
  author: string;
}

const AUTO_MAP: Record<string, string> = {
  external_id: "external_id", externalid: "external_id", id: "external_id",
  first_name: "first_name", firstname: "first_name", fornavn: "first_name",
  last_name: "last_name", lastname: "last_name", efternavn: "last_name",
  email: "email", mail: "email", "e-mail": "email",
  phone: "phone", telefon: "phone", mobile: "phone",
  language: "language", sprog: "language",
  birth_year: "birth_year", birthyear: "birth_year", fodselsar: "birth_year",
  gender: "gender", kon: "gender",
  city: "city", by: "city",
  postal_code: "postal_code", zip: "postal_code", postnummer: "postal_code",
  country: "country", land: "country",
  customer_status: "customer_status", status: "customer_status",
  recruitment_source: "recruitment_source", source: "recruitment_source",
};

export function ImportWizard({
  attributeFields,
  history,
  locale,
}: {
  attributeFields: { key: string; label: string }[];
  history: Batch[];
  locale: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dedupRule, setDedupRule] = useState("external_id");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buildForm(extra: Record<string, string> = {}): FormData {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("mapping", JSON.stringify(mapping));
    fd.set("dedupRule", dedupRule);
    fd.set("consentConfirmed", String(consentConfirmed));
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  function autoMap(columns: string[]) {
    const m: Record<string, string> = {};
    for (const c of columns) {
      const norm = c.toLowerCase().replace(/[\s-]+/g, "_");
      m[c] = AUTO_MAP[norm] ?? (attributeFields.some((a) => a.key === norm) ? `attr:${norm}` : "");
    }
    setMapping(m);
  }

  const targetOptions = [
    { value: "", label: "— skip —" },
    ...TARGET_FIELDS.map((f) => ({ value: f, label: f })),
    ...attributeFields.map((a) => ({ value: `attr:${a.key}`, label: `attribute: ${a.label}` })),
  ];

  return (
    <div className="space-y-4">
      <Card title="1 · Upload file">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            aria-label="Import file"
            className="text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setParsed(null);
              setDryRun(null);
              setCommitted(null);
              setError(null);
            }}
          />
          <Button
            disabled={!file || pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const res = await parseStep(buildForm());
                  setParsed(res);
                  autoMap(res.columns);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not parse the file.");
                }
              })
            }
          >
            Parse & preview
          </Button>
          {parsed && (
            <span className="text-sm text-muted">
              {parsed.rowCount} rows · {parsed.columns.length} columns
              {parsed.delimiter ? ` · delimiter '${parsed.delimiter}'` : ""}
              {parsed.sheetNames ? ` · sheet ${parsed.sheetNames[0]}` : ""}
            </span>
          )}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        {parsed && (
          <div className="mt-3">
            <Table>
              <thead>
                <tr>{parsed.columns.map((c) => <Th key={c}>{c}</Th>)}</tr>
              </thead>
              <tbody>
                {parsed.preview.map((row, i) => (
                  <tr key={i}>
                    {parsed.columns.map((c) => (
                      <Td key={c} className="whitespace-nowrap text-xs">{row[c]}</Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {parsed && (
        <Card title="2 · Map columns & rules">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {parsed.columns.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="w-36 truncate text-sm" title={c}>{c}</span>
                <Select
                  aria-label={`Mapping for ${c}`}
                  value={mapping[c] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [c]: e.target.value }))}
                  className="flex-1"
                >
                  {targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Deduplicate by
              <Select aria-label="Deduplication rule" value={dedupRule} onChange={(e) => setDedupRule(e.target.value)}>
                <option value="external_id">external_id (update existing)</option>
                <option value="email">email (update existing)</option>
                <option value="none">none (always create)</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
              />
              I confirm these contacts have a valid consent basis for survey contact
            </label>
          </div>
        </Card>
      )}

      {parsed && (
        <Card title="3 · Dry run">
          <div className="flex items-center gap-3">
            <Button
              disabled={pending || !consentConfirmed}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    setDryRun(await dryRunStep(buildForm()));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Dry run failed.");
                  }
                })
              }
            >
              Run dry run
            </Button>
            {!consentConfirmed && <span className="text-xs text-muted">Confirm the consent basis first.</span>}
          </div>
          {dryRun && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge tone="gray">total {dryRun.counts.total}</Badge>
                <Badge tone="green">valid {dryRun.counts.valid}</Badge>
                <Badge tone="blue">create {dryRun.counts.create}</Badge>
                <Badge tone="amber">update {dryRun.counts.update}</Badge>
                <Badge tone="red">invalid {dryRun.counts.invalid}</Badge>
                <Badge tone="red">file duplicates {dryRun.counts.skippedDuplicates}</Badge>
              </div>
              {dryRun.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-line">
                  <Table>
                    <thead><tr><Th>Row</Th><Th>Column</Th><Th>Problem</Th></tr></thead>
                    <tbody>
                      {dryRun.errors.map((e, i) => (
                        <tr key={i}>
                          <Td>{e.rowNumber || "—"}</Td>
                          <Td>{e.column ?? "—"}</Td>
                          <Td>{e.message}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {dryRun && (
        <Card title="4 · Commit">
          <div className="flex items-center gap-3">
            <Button
              disabled={pending || committed !== null || dryRun.counts.valid === 0}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    setCommitted(await commitStep(buildForm({ batchId: dryRun.batchId })));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Commit failed.");
                  }
                })
              }
            >
              Commit import
            </Button>
            {committed && (
              <span className="text-sm">
                Imported: {committed.counts.create} created, {committed.counts.update} updated.{" "}
                {committed.errorCount > 0 && (
                  <a className="text-accent underline" href={`/api/import-batches/${committed.batchId}/errors`}>
                    Download error report ({committed.errorCount})
                  </a>
                )}
              </span>
            )}
          </div>
        </Card>
      )}

      <Card title="Import history">
        <Table>
          <thead>
            <tr><Th>File</Th><Th>Status</Th><Th>Counts</Th><Th>Errors</Th><Th>By</Th><Th>When</Th></tr>
          </thead>
          <tbody>
            {history.map((b) => (
              <tr key={b.id}>
                <Td>{b.filename}</Td>
                <Td><Badge tone={b.status === "committed" ? "green" : b.status === "failed" ? "red" : "gray"}>{b.status}</Badge></Td>
                <Td className="text-xs">
                  {b.counts.create ?? 0} created · {b.counts.update ?? 0} updated · {b.counts.invalid ?? 0} invalid
                </Td>
                <Td>
                  {b.errorCount > 0 ? (
                    <a className="text-accent underline" href={`/api/import-batches/${b.id}/errors`}>
                      {b.errorCount} rows
                    </a>
                  ) : "0"}
                </Td>
                <Td>{b.author}</Td>
                <Td className="whitespace-nowrap text-muted">
                  {new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(b.createdAt))}
                </Td>
              </tr>
            ))}
            {history.length === 0 && <tr><Td colSpan={6} className="text-muted">No imports yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
