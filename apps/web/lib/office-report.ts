export type ReportSnapshot = {
  studyTitle: string;
  studyVersion: number;
  requestedAt: string;
  filteredResponseBase: number;
  responseBaseBeforeFilters: number;
  filters: unknown[];
  sources: string[];
  insights: { code: string; label: string; type: string; validBase: number; summary: string }[];
};

export function createReportArtifact(format: "docx" | "pptx", snapshot: ReportSnapshot): Uint8Array {
  return format === "docx" ? createDocx(snapshot) : createPptx(snapshot);
}

function createDocx(snapshot: ReportSnapshot): Uint8Array {
  const paragraphs = [
    `${snapshot.studyTitle} — strukturelt rapportudkast`,
    `Instrumentversion: v${snapshot.studyVersion}`,
    `Filtreret base: n = ${snapshot.filteredResponseBase}. Total bounded base: n = ${snapshot.responseBaseBeforeFilters}.`,
    `Genereret: ${snapshot.requestedAt}`,
    "Status: DRAFT_UNBRANDED. CX-template er ikke verificeret og visuel template-QA er ikke udført.",
    ...snapshot.insights.flatMap((insight) => [`${insight.label} (${insight.code})`, `${insight.summary} Base: n = ${insight.validBase}.`]),
    `Kilder: ${snapshot.sources.join(", ")}.`,
    `Filter-lineage: ${JSON.stringify(snapshot.filters)}.`,
  ];
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((value, index) => `<w:p><w:r>${index === 0 ? "<w:rPr><w:b/><w:sz w:val=\"32\"/></w:rPr>" : ""}<w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`).join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/document.xml", documentXml],
  ]);
}

function createPptx(snapshot: ReportSnapshot): Uint8Array {
  const lines = [
    `Instrumentversion v${snapshot.studyVersion}`,
    `Filtreret base n=${snapshot.filteredResponseBase}; bounded total n=${snapshot.responseBaseBeforeFilters}`,
    "DRAFT_UNBRANDED — template og visuel QA mangler",
    ...snapshot.insights.slice(0, 12).map((insight) => `${insight.label}: ${insight.summary} (n=${insight.validBase})`),
  ];
  const textBody = lines.map((value) => `<a:p><a:r><a:rPr lang="da-DK" sz="1800"/><a:t>${xml(value)}</a:t></a:r><a:endParaRPr lang="da-DK"/></a:p>`).join("");
  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="274320"/><a:ext cx="11277600" cy="685800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="da-DK" sz="2800" b="1"/><a:t>${xml(snapshot.studyTitle)}</a:t></a:r><a:endParaRPr lang="da-DK"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="1143000"/><a:ext cx="11277600" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${textBody}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`],
    ["ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ["ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`],
    ["ppt/slides/slide1.xml", slide],
  ]);
}

function zip(files: [string, string][]): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, value] of files) {
    const nameBytes = encoder.encode(name); const data = encoder.encode(value); const checksum = crc32(data);
    const localHeader = bytes(30 + nameBytes.length);
    write32(localHeader, 0, 0x04034b50); write16(localHeader, 4, 20); write16(localHeader, 8, 0); write32(localHeader, 14, checksum); write32(localHeader, 18, data.length); write32(localHeader, 22, data.length); write16(localHeader, 26, nameBytes.length); localHeader.set(nameBytes, 30);
    local.push(localHeader, data);
    const directory = bytes(46 + nameBytes.length);
    write32(directory, 0, 0x02014b50); write16(directory, 4, 20); write16(directory, 6, 20); write16(directory, 10, 0); write32(directory, 16, checksum); write32(directory, 20, data.length); write32(directory, 24, data.length); write16(directory, 28, nameBytes.length); write32(directory, 42, offset); directory.set(nameBytes, 46);
    central.push(directory); offset += localHeader.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0); const end = bytes(22);
  write32(end, 0, 0x06054b50); write16(end, 8, files.length); write16(end, 10, files.length); write32(end, 12, centralSize); write32(end, 16, offset);
  return concat([...local, ...central, end]);
}

function crc32(data: Uint8Array): number { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function bytes(length: number): Uint8Array { return new Uint8Array(length); }
function write16(target: Uint8Array, offset: number, value: number) { new DataView(target.buffer).setUint16(offset, value, true); }
function write32(target: Uint8Array, offset: number, value: number) { new DataView(target.buffer).setUint32(offset, value >>> 0, true); }
function concat(parts: Uint8Array[]): Uint8Array { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }
function xml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
