import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseImportFile } from "@/lib/import/parse";
import { buildRawDataset, inferRawVariables } from "@/lib/import/raw-dataset";

describe("CSV structural integrity", () => {
  it("accepts unique headers when Papa Parse reports no renamed headers", async () => {
    const parsed = await parseImportFile(Buffer.from("id,score\nA,2\n"), "valid.csv");
    expect(parsed.columns).toEqual(["id", "score"]);
    expect(parsed.rows).toEqual([{ id: "A", score: "2" }]);
  });

  it.each([
    ["too many fields", "a,b\n1,2\n3,4,5\n", /TooManyFields/],
    ["too few fields", "a,b\n1,2\n3\n", /TooFewFields/],
    ["broken quotes", "a,b\n1,\"unterminated\n", /MissingQuotes/],
  ])("rejects %s instead of silently reshaping data", async (_name, csv, code) => {
    await expect(parseImportFile(Buffer.from(csv), "raw.csv")).rejects.toThrow(code);
  });

  it("rejects duplicate CSV headers instead of accepting automatic renaming", async () => {
    await expect(
      parseImportFile(Buffer.from("score,score\n1,2\n"), "duplicate.csv"),
    ).rejects.toThrow(/duplicate column headers.*score/i);
  });
});

describe("XLSX cell integrity", () => {
  it("rejects duplicate headers instead of overwriting earlier cell values", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["score", "score"]);
    sheet.addRow([1, 2]);
    const bytes = await workbook.xlsx.writeBuffer();

    await expect(
      parseImportFile(Buffer.from(bytes), "duplicate.xlsx", "Data"),
    ).rejects.toThrow(/duplicate column headers.*score/i);
  });

  it("assigns stable fallback names to empty headers and preserves every value", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["id", null, "score"]);
    sheet.addRow(["A", "middle", 2]);
    const bytes = await workbook.xlsx.writeBuffer();

    const parsed = await parseImportFile(Buffer.from(bytes), "empty-header.xlsx", "Data");
    expect(parsed.columns).toEqual(["id", "column_2", "score"]);
    expect(parsed.rows).toEqual([{ id: "A", column_2: "middle", score: "2" }]);
  });

  it("preserves data under a trailing empty header", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["id"]);
    sheet.addRow(["A", "middle"]);
    const bytes = await workbook.xlsx.writeBuffer();

    const parsed = await parseImportFile(Buffer.from(bytes), "trailing-empty.xlsx", "Data");
    expect(parsed.columns).toEqual(["id", "column_2"]);
    expect(parsed.rows).toEqual([{ id: "A", column_2: "middle" }]);
  });

  it("uses cached scalar results for formula and shared-formula cells", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["id", "calculated"]);
    sheet.getCell("A2").value = "A";
    sheet.getCell("B2").value = { formula: "1+1", result: 2 };
    sheet.getCell("A3").value = "B";
    sheet.getCell("B3").value = { sharedFormula: "B2", result: 4 };

    const bytes = await workbook.xlsx.writeBuffer();
    const parsed = await parseImportFile(Buffer.from(bytes), "formulas.xlsx", "Data");
    expect(parsed.rows).toEqual([
      { id: "A", calculated: "2" },
      { id: "B", calculated: "4" },
    ]);
  });

  it("rejects formulas without a cached result", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["id", "calculated"]);
    sheet.getCell("A2").value = "A";
    sheet.getCell("B2").value = { formula: "1+1" };
    const bytes = await workbook.xlsx.writeBuffer();

    await expect(
      parseImportFile(Buffer.from(bytes), "formula-without-result.xlsx", "Data"),
    ).rejects.toThrow(/formula without a cached result/);
  });

  it("rejects cached Excel error results", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["id", "calculated"]);
    sheet.getCell("A2").value = "A";
    sheet.getCell("B2").value = {
      formula: "1/0",
      result: { error: "#DIV/0!" },
    };
    const bytes = await workbook.xlsx.writeBuffer();

    await expect(
      parseImportFile(Buffer.from(bytes), "formula-error.xlsx", "Data"),
    ).rejects.toThrow(/contains an Excel error/);
  });
});

describe("raw date integrity", () => {
  it("does not infer an impossible calendar date as a date", async () => {
    const parsed = await parseImportFile(
      Buffer.from("event_date\n2026-02-30\n"),
      "invalid-date.csv",
    );
    expect(inferRawVariables(parsed)[0].varType).toBe("string");
  });

  it("rejects an impossible calendar date when the user maps the variable as date", async () => {
    const parsed = await parseImportFile(
      Buffer.from("event_date\n2026-02-30\n"),
      "invalid-date.csv",
    );
    const [spec] = inferRawVariables(parsed);
    expect(() => buildRawDataset(parsed, [{ ...spec, varType: "date" }]))
      .toThrow(/ikke en gyldig dato/);
  });
});
