import Papa from "papaparse";
import ExcelJS from "exceljs";

/**
 * File parsing adapters for panel import. CSV via papaparse (delimiter
 * auto-detection, BOM handling); XLSX via exceljs. Both normalize to
 * header-keyed string records. Additional formats plug in here.
 */

export interface ParsedFile {
  columns: string[];
  rows: Record<string, string>[];
  sheetNames?: string[];
  meta: { delimiter?: string; sheet?: string; rowCount: number };
}

export const IMPORT_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxRows: 20000,
  allowedExtensions: [".csv", ".xlsx"],
  allowedMime: [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream", // browsers are inconsistent for csv
  ],
};

export function checkFile(name: string, size: number, mime: string): string | null {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!IMPORT_LIMITS.allowedExtensions.includes(ext)) {
    return `Unsupported file type '${ext}'. Use CSV or XLSX.`;
  }
  if (size > IMPORT_LIMITS.maxBytes) {
    return `File is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB.`;
  }
  if (mime && !IMPORT_LIMITS.allowedMime.includes(mime)) {
    return `Unexpected content type '${mime}'.`;
  }
  return null;
}

export async function parseImportFile(
  buffer: Buffer,
  filename: string,
  sheet?: string,
): Promise<ParsedFile> {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".csv") return parseCsv(buffer);
  if (ext === ".xlsx") return parseXlsx(buffer, sheet);
  throw new Error(`Unsupported extension: ${ext}`);
}

function parseCsv(buffer: Buffer): ParsedFile {
  // utf-8-sig equivalent: strip BOM if present
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.some((e) => e.type === "Delimiter")) {
    throw new Error("Could not detect the CSV delimiter.");
  }
  if (result.data.length > IMPORT_LIMITS.maxRows) {
    throw new Error(`File contains ${result.data.length} rows; maximum is ${IMPORT_LIMITS.maxRows}.`);
  }
  const rows = result.data.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === "string" ? v.trim() : String(v ?? "");
    return out;
  });
  return {
    columns: result.meta.fields ?? [],
    rows,
    meta: { delimiter: result.meta.delimiter, rowCount: rows.length },
  };
}

async function parseXlsx(buffer: Buffer, sheet?: string): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheetNames = workbook.worksheets.map((w) => w.name);
  const ws = sheet ? workbook.getWorksheet(sheet) : workbook.worksheets[0];
  if (!ws) throw new Error(`Worksheet '${sheet}' not found.`);
  const dataRowCount = Math.max(0, ws.actualRowCount - 1);
  if (dataRowCount > IMPORT_LIMITS.maxRows) {
    throw new Error(`Worksheet contains ${dataRowCount} rows; maximum is ${IMPORT_LIMITS.maxRows}.`);
  }
  const columns: string[] = [];
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        columns[colNumber - 1] = String(cell.value ?? `column_${colNumber}`).trim();
      });
      return;
    }
    const record: Record<string, string> = {};
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      let v = cell.value;
      if (v && typeof v === "object" && "text" in (v as object)) v = (v as { text: string }).text;
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      record[c] = v === null || v === undefined ? "" : String(v).trim();
    });
    if (Object.values(record).some((v) => v !== "")) rows.push(record);
  });
  return { columns, rows, sheetNames, meta: { sheet: ws.name, rowCount: rows.length } };
}
