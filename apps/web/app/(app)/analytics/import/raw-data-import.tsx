"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Table, Td, Th } from "@/components/ui";
import { importRawData, previewRawData } from "./actions";

type PreviewResult = Awaited<ReturnType<typeof previewRawData>>;
type VariableDraft = PreviewResult["variables"][number] & { missingValuesText: string };
type FlowStatus = "idle" | "previewing" | "ready" | "importing" | "error";

const STATUS_TEXT: Record<FlowStatus, string> = {
  idle: "Ingen fil valgt",
  previewing: "Læser preview",
  ready: "Klar til import",
  importing: "Opretter datasætversion",
  error: "Fejl",
};

const inputClass = "h-9 rounded-lg border border-line bg-surface px-2 text-sm";

export function RawDataImport() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [variables, setVariables] = useState<VariableDraft[]>([]);
  const [datasetName, setDatasetName] = useState("");
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function formFor(nextFile: File, sheet?: string | null): FormData {
    const form = new FormData();
    form.set("file", nextFile);
    if (sheet) form.set("sheet", sheet);
    return form;
  }

  function loadPreview(nextFile: File, sheet?: string | null) {
    setError(null);
    setStatus("previewing");
    startTransition(async () => {
      try {
        const result = await previewRawData(formFor(nextFile, sheet));
        setFile(nextFile);
        setPreview(result);
        setVariables(result.variables.map((variable) => ({
          ...variable,
          missingValuesText: variable.missingValues.join("; "),
        })));
        if (!datasetName) setDatasetName(result.filename.replace(/\.(csv|xlsx)$/i, ""));
        setStatus("ready");
      } catch (caught) {
        setPreview(null);
        setVariables([]);
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "Filen kunne ikke læses.");
      }
    });
  }

  function chooseFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setVariables([]);
    setDatasetName(nextFile?.name.replace(/\.(csv|xlsx)$/i, "") ?? "");
    setError(null);
    setStatus(nextFile ? "previewing" : "idle");
    if (nextFile) loadPreview(nextFile);
  }

  function updateVariable(index: number, patch: Partial<VariableDraft>) {
    setVariables((current) => current.map((variable, currentIndex) =>
      currentIndex === index ? { ...variable, ...patch } : variable,
    ));
  }

  function runImport() {
    if (!file || !preview) return;
    setStatus("importing");
    setError(null);
    startTransition(async () => {
      try {
        const form = formFor(file, preview.sheet);
        form.set("fingerprint", preview.fingerprint);
        form.set("datasetName", datasetName);
        form.set("variables", JSON.stringify(variables.map(({ missingValuesText, ...variable }) => ({
          ...variable,
          missingValues: missingValuesText
            .split(";")
            .map((value) => value.trim())
            .filter(Boolean),
        }))));
        const result = await importRawData(form);
        router.push(`/analytics/datasets/${result.datasetId}`);
        router.refresh();
      } catch (caught) {
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "Rådataimporten fejlede.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card title="1. Upload og preview">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => fileInput.current?.click()}>
            Vælg CSV eller XLSX
          </Button>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          <Badge tone={status === "error" ? "red" : status === "ready" ? "green" : status === "previewing" || status === "importing" ? "blue" : "gray"}>
            {STATUS_TEXT[status]}
          </Badge>
          {file && <span className="text-sm text-muted">{file.name}</span>}
        </div>
        <p className="mt-3 text-xs text-muted">
          Maks. 8 MB og 20.000 datarækker. CSV understøtter UTF-8 BOM samt automatisk komma-/semikolonregistrering. XLSX understøtter worksheetvalg.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

        {preview?.sheetNames && preview.sheetNames.length > 1 && (
          <label className="mt-4 block text-sm font-medium">
            Worksheet
            <select
              className={`${inputClass} ml-2`}
              value={preview.sheet ?? preview.sheetNames[0]}
              disabled={pending || !file}
              onChange={(event) => file && loadPreview(file, event.target.value)}
            >
              {preview.sheetNames.map((sheet) => <option key={sheet}>{sheet}</option>)}
            </select>
          </label>
        )}

        {preview && (
          <>
            <p className="mt-4 text-sm text-muted">
              {preview.rowCount} rækker · {preview.columns.length} kolonner
              {preview.delimiter && <> · separator <code>{JSON.stringify(preview.delimiter)}</code></>}
              {preview.sheet && <> · worksheet {preview.sheet}</>}
            </p>
            <div className="mt-3 overflow-x-auto">
              <Table>
                <thead><tr>{preview.columns.map((column) => <Th key={column}>{column}</Th>)}</tr></thead>
                <tbody>
                  {preview.previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {preview.columns.map((column) => <Td key={column} className="max-w-64 truncate text-xs">{row[column] || "—"}</Td>)}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {preview && (
        <Card title="2. Kolonnemapping og variabelmetadata">
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Med</Th><Th>Kildekolonne</Th><Th>Variabelnavn</Th><Th>Variabellabel</Th>
                  <Th>Datatype</Th><Th>Måleniveau</Th><Th>Missing values</Th>
                </tr>
              </thead>
              <tbody>
                {variables.map((variable, index) => (
                  <tr key={variable.sourceColumn}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={variable.include}
                        aria-label={`Medtag ${variable.sourceColumn}`}
                        onChange={(event) => updateVariable(index, { include: event.target.checked })}
                      />
                    </Td>
                    <Td className="font-medium">{variable.sourceColumn}</Td>
                    <Td>
                      <input className={`${inputClass} w-40 font-mono`} value={variable.name} onChange={(event) => updateVariable(index, { name: event.target.value })} />
                    </Td>
                    <Td>
                      <input className={`${inputClass} w-52`} value={variable.label} onChange={(event) => updateVariable(index, { label: event.target.value })} />
                    </Td>
                    <Td>
                      <select className={inputClass} value={variable.varType} onChange={(event) => updateVariable(index, { varType: event.target.value as VariableDraft["varType"] })}>
                        <option value="numeric">Numerisk</option>
                        <option value="string">Tekst</option>
                        <option value="date">Dato</option>
                      </select>
                    </Td>
                    <Td>
                      <select className={inputClass} value={variable.measure} onChange={(event) => updateVariable(index, { measure: event.target.value as VariableDraft["measure"] })}>
                        <option value="nominal">Nominal</option>
                        <option value="ordinal">Ordinal</option>
                        <option value="scale">Scale</option>
                      </select>
                    </Td>
                    <Td>
                      <input
                        className={`${inputClass} w-44`}
                        value={variable.missingValuesText}
                        placeholder="fx 99; ved ikke"
                        onChange={(event) => updateVariable(index, { missingValuesText: event.target.value })}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {preview && (
        <Card title="3. Opret datasæt og version">
          <label className="block text-sm font-medium">
            Datasætnavn
            <input
              className={`${inputClass} ml-2 w-80`}
              value={datasetName}
              maxLength={160}
              onChange={(event) => setDatasetName(event.target.value)}
            />
          </label>
          <p className="mt-3 text-xs text-muted">
            Kilde gemmes som <code>file_import</code>. Lineage gemmer filnavn, format, worksheet, separator, importtidspunkt og SHA-256. Eksisterende responses og studiedatasæt ændres ikke.
          </p>
          <Button
            className="mt-4"
            variant="primary"
            disabled={pending || !datasetName.trim() || variables.every((variable) => !variable.include)}
            onClick={runImport}
          >
            {status === "importing" ? "Opretter datasætversion…" : "Importér til analyse-workbench"}
          </Button>
        </Card>
      )}
    </div>
  );
}
