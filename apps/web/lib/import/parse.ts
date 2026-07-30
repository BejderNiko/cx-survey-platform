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

function assertUniqueHeaders(
  columns: string[],
  source: "CSV" | "XLSX",
  renamedHeaders: Record<string, string> | null | undefined = {},
): void {
  const seen = new Map<string, string>();
  const duplicates = new Set(Object.values(renamedHeaders ?? {}));
  for (const column of columns) {
    const normalized = column.toLowerCase();
    const existing = seen.get(normalized);
    if (existing) duplicates.add(existing);
    else seen.set(normalized, column);
  }
  if (duplicates.size > 0) {
    throw new Error(
      `${source} contains duplicate column headers: ${[...duplicates].join(", ")}.`,
    );
  }
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
  const structuralError = result.errors.find(
    (error) => error.type === "FieldMismatch" || error.type === "Quotes",
  );
  if (structuralError) {
    const row = typeof structuralError.row === "number"
      ? ` on source row ${structuralError.row + 2}`
      : "";
    throw new Error(`CSV structure error${row}: ${structuralError.code}.`);
  }
  const columns = result.meta.fields ?? [];
  assertUniqueHeaders(columns, "CSV", result.meta.renamedHeaders);
  if (result.data.length > IMPORT_LIMITS.maxRows) {
    throw new Error(`File contains ${result.data.length} rows; maximum is ${IMPORT_LIMITS.maxRows}.`);
  }
  const rows = result.data.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === "string" ? v.trim() : String(v ?? "");
    return out;
  });
  return {
    columns,
    rows,
    meta: { delimiter: result.meta.delimiter, rowCount: rows.length },
  };
}

function xlsxCellText(value: unknown, rowNumber: number, columnNumber: number): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (["string", "number", "boolean"].includes(typeof value)) return String(value).trim();
  if (typeof value !== "object") {
    throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} has an unsupported value.`);
  }

  const cell = value as Record<string, unknown>;
  if ("formula" in cell || "sharedFormula" in cell) {
    if (!("result" in cell) || cell.result === null || cell.result === undefined) {
      throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} contains a formula without a cached result.`);
    }
    return xlsxCellText(cell.result, rowNumber, columnNumber);
  }
  if (Array.isArray(cell.richText)) {
    return cell.richText
      .map((part) => typeof part === "object" && part !== null && "text" in part
        ? String((part as { text: unknown }).text)
        : "")
      .join("")
      .trim();
  }
  if (typeof cell.text === "string") return cell.text.trim();
  if ("error" in cell) {
    throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} contains an Excel error.`);
  }
  throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} has an unsupported cell type.`);
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
      for (let colNumber = 1; colNumber <= ws.columnCount; colNumber++) {
        const cell = row.getCell(colNumber);
        columns[colNumber - 1] = xlsxCellText(cell.value, rowNumber, colNumber)
          || `column_${colNumber}`;
      }
      assertUniqueHeaders(columns, "XLSX");
      return;
    }
    const record: Record<string, string> = {};
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      record[c] = xlsxCellText(cell.value, rowNumber, i + 1);
    });
    if (Object.values(record).some((v) => v !== "")) rows.push(record);
  });
  return { columns, rows, sheetNames, meta: { sheet: ws.name, rowCount: rows.length } };
}
