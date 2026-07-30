import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseImportFile } from "@/lib/import/parse";
import { buildRawDataset, inferRawVariables } from "@/lib/import/raw-dataset";

describe("external raw-data import", () => {
  it.each([
    ["comma", "\uFEFFscore,segment,date,note\n10,A,2026-07-01,ok\n99,B,2026-07-02,missing\n", ","],
    ["semicolon", "score;segment;date;note\n10;A;2026-07-01;ok\n99;B;2026-07-02;missing\n", ";"],
  ])("parses %s CSV and builds typed metadata", async (_name, csv, delimiter) => {
    const parsed = await parseImportFile(Buffer.from(csv, "utf8"), "raw.csv");
    expect(parsed.meta.delimiter).toBe(delimiter);
    expect(parsed.meta.rowCount).toBe(2);

    const inferred = inferRawVariables(parsed);
    const score = inferred.find((variable) => variable.sourceColumn === "score")!;
    const date = inferred.find((variable) => variable.sourceColumn === "date")!;
    expect(score).toMatchObject({ varType: "numeric", measure: "scale" });
    expect(date).toMatchObject({ varType: "date", measure: "nominal" });

    const specs = inferred.map((variable) =>
      variable.sourceColumn === "score"
        ? { ...variable, label: "Tilfredshed", measure: "ordinal" as const, missingValues: ["99"] }
        : variable,
    );
    const built = buildRawDataset(parsed, specs);
    expect(built.rows).toEqual([
      { score: 10, segment: "A", date: "2026-07-01", note: "ok" },
      { score: null, segment: "B", date: "2026-07-02", note: "missing" },
    ]);
    expect(built.variables.find((variable) => variable.name === "score")).toMatchObject({
      label: "Tilfredshed",
      var_type: "numeric",
      measure: "ordinal",
      missing_values: ["99"],
    });
  });

  it("selects one worksheet from a multi-sheet XLSX file", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Metadata").addRows([["key", "value"], ["source", "test"]]);
    workbook.addWorksheet("Data").addRows([
      ["id", "amount", "group"],
      ["A", 1.5, "control"],
      ["B", 2.5, "test"],
    ]);
    const bytes = await workbook.xlsx.writeBuffer();
    const parsed = await parseImportFile(Buffer.from(bytes), "raw.xlsx", "Data");
    expect(parsed.sheetNames).toEqual(["Metadata", "Data"]);
    expect(parsed.meta.sheet).toBe("Data");
    expect(parsed.rows).toEqual([
      { id: "A", amount: "1.5", group: "control" },
      { id: "B", amount: "2.5", group: "test" },
    ]);
  });

  it("rejects duplicate or invalid variable names", async () => {
    const parsed = await parseImportFile(Buffer.from("a,b\n1,2\n"), "raw.csv");
    const inferred = inferRawVariables(parsed);
    expect(() => buildRawDataset(parsed, inferred.map((variable) => ({ ...variable, name: "same" })))).toThrow(/mere end én gang/);
    expect(() => buildRawDataset(parsed, [{ ...inferred[0], name: "1 invalid" }])).toThrow(/Variabelnavnet/);
  });
});
