"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Table, Td, Th } from "@/components/ui";
import { IMPORT_STATUS, label } from "@/lib/labels";
import { commitStep, dryRunStep, parseStep } from "./actions";

type ParseResult = Awaited<ReturnType<typeof parseStep>>;
type CommitResult = Awaited<ReturnType<typeof commitStep>>;
type UploadStatus = "idle" | "selected" | "dry_run" | "committing" | "committed" | "failed";

interface Batch {
  id: string;
  filename: string;
  status: string;
  counts: Record<string, number>;
  createdAt: string;
  errorCount: number;
  author: string;
  failureMessage: string | null;
}

const STATUS_TEXT: Record<UploadStatus, string> = {
  idle: "Ingen fil valgt",
  selected: "Valgt",
  dry_run: "Prøvekørsel gennemført",
  committing: "Gemmer i database",
  committed: "Databasecommit gennemført",
  failed: "Fejlet",
};
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ImportWizard({ history }: { history: Batch[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function buildForm(extra: Record<string, string> = {}): FormData {
    const form = new FormData();
    if (file) form.set("file", file);
    form.set("consentConfirmed", String(consentConfirmed));
    for (const [key, value] of Object.entries(extra)) form.set(key, value);
    return form;
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setParsed(null);
    setResult(null);
    setError(null);
    setStatus(next ? "selected" : "idle");
    if (!next) return;
    const form = new FormData();
    form.set("file", next);
    startTransition(async () => {
      try {
        setParsed(await parseStep(form));
      } catch (caught) {
        setStatus("failed");
        setError(caught instanceof Error ? caught.message : "Filen kunne ikke læses.");
      }
    });
  }

  function runImport() {
    startTransition(async () => {
      setError(null);
      setResult(null);

      try {
        const dryRun = await dryRunStep(buildForm());
        setStatus("dry_run");
        if (dryRun.counts.valid === 0) {
          throw new Error(dryRun.errors[0]?.message ?? "Filen indeholder ingen gyldige rækker.");
        }
        setStatus("committing");
        const committed = await commitStep(buildForm({ batchId: dryRun.batchId }));
        setResult(committed);
        setStatus("committed");
        router.refresh();
      } catch (caught) {
        setStatus("failed");
        setError(caught instanceof Error ? caught.message : "Importen fejlede.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card title="Upload panel-fil">
        <div
          role="button"
          tabIndex={0}
          aria-label="Vælg CSV- eller XLSX-fil"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            chooseFile(event.dataTransfer.files[0] ?? null);
          }}
          className="cursor-pointer rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft px-6 py-10 text-center outline-none transition hover:border-accent focus:ring-2 focus:ring-accent"
        >
          <span aria-hidden className="text-4xl">📄</span>
          <p className="mt-3 font-medium text-heading">Træk CSV eller XLSX hertil</p>
          <p className="mt-1 text-sm text-muted">eller</p>
          <Button className="mt-3" type="button" tabIndex={-1}>Vælg fil</Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge tone={status === "failed" ? "red" : status === "committed" ? "green" : status === "committing" || status === "dry_run" ? "blue" : "gray"}>
            {STATUS_TEXT[status]}
          </Badge>
          {file && <span className="text-sm">{file.name} · {formatBytes(file.size)}</span>}
          {parsed && <span className="text-sm text-muted">{parsed.rowCount} rækker · {parsed.columns.length} kolonner</span>}
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={consentConfirmed}
            onChange={(event) => setConsentConfirmed(event.target.checked)}
          />
          <span>Jeg bekræfter, at kontakterne har et gyldigt samtykkegrundlag til undersøgelseskontakt.</span>
        </label>
        <p className="mt-1 text-xs text-muted">
          Mapping og dubletkontrol sker automatisk. Eksternt id bruges først; ellers bruges e-mail. Samtykke kan ikke springes over.
        </p>

        <Button className="mt-4" disabled={!file || !parsed || !consentConfirmed || pending} onClick={runImport}>
          {status === "committing" ? "Gemmer i database…" : status === "dry_run" ? "Prøvekørsel færdig…" : "Importér fil"}
        </Button>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        {result && (
          <p role="status" className="mt-3 text-sm text-success">
            Databasecommit bekræftet: {result.counts.before} før + {result.counts.create} oprettet = {result.counts.after} efter · {result.counts.update} opdateret · {result.counts.invalid} ugyldige.
            {result.errorCount > 0 && (
              <> <a className="underline" href={`/api/import-batches/${result.batchId}/errors`}>Hent fejlrapport</a>.</>
            )}
          </p>
        )}
      </Card>

      <Card title="Importhistorik">
        <Table>
          <thead><tr><Th>Fil</Th><Th>Status</Th><Th>Antal</Th><Th>Fejl</Th><Th>Af</Th><Th>Tidspunkt</Th></tr></thead>
          <tbody>
            {history.map((batch) => (
              <tr key={batch.id}>
                <Td>{batch.filename}</Td>
                <Td>
                  <Badge tone={batch.status === "committed" ? "green" : batch.status === "failed" ? "red" : batch.status === "committing" ? "blue" : "gray"}>
                    {label(IMPORT_STATUS, batch.status)}
                  </Badge>
                  {batch.failureMessage && <p className="mt-1 max-w-xs text-xs text-danger">{batch.failureMessage}</p>}
                </Td>
                <Td className="text-xs">{batch.counts.create ?? 0} oprettet · {batch.counts.update ?? 0} opdateret · {batch.counts.invalid ?? 0} ugyldige</Td>
                <Td>{batch.errorCount > 0 ? <a className="text-accent underline" href={`/api/import-batches/${batch.id}/errors`}>{batch.errorCount} rækker</a> : "0"}</Td>
                <Td>{batch.author}</Td>
                <Td className="whitespace-nowrap text-muted">{new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(batch.createdAt))}</Td>
              </tr>
            ))}
            {history.length === 0 && <tr><Td colSpan={6} className="text-muted">Ingen importer endnu.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
