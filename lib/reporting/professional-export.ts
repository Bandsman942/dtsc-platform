export type ProfessionalReportColumn = {
  key: string;
  label: string;
};

export type ProfessionalReportKpi = {
  label: string;
  value: string;
  numericValue?: number | null;
  comparison?: string | null;
};

export type ProfessionalReportChartPoint = {
  label: string;
  value: number;
  displayValue?: string;
};

export type ProfessionalReportInsight = {
  title: string;
  body: string;
  tone?: "info" | "success" | "warning" | "danger";
};

export type ProfessionalReportExportModel = {
  title: string;
  subtitle?: string | null;
  organizationName?: string | null;
  generatedLabel?: string | null;
  filenameBase: string;
  kpis: ProfessionalReportKpi[];
  chartTitle?: string | null;
  chart: ProfessionalReportChartPoint[];
  columns: ProfessionalReportColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
  insights: ProfessionalReportInsight[];
  filters?: Array<{ label: string; value: string }>;
  accentHex?: string;
};

const textEncoder = new TextEncoder();

function safeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "dtsc-report";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadProfessionalCsv(model: ProfessionalReportExportModel) {
  const lines = [
    model.columns.map((column) => csvCell(column.label)).join(","),
    ...model.rows.map((row) => model.columns.map((column) => csvCell(row[column.key])).join(",")),
  ];
  triggerDownload(new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${safeFileName(model.filenameBase)}.csv`);
}

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function inlineCell(ref: string, value: unknown, style = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${xml(value)}</t></is></c>`;
}

function sheetXml(rows: unknown[][], options?: { drawing?: boolean }) {
  const body = rows.map((row, rowIndex) => {
    const style = rowIndex === 0 ? 1 : 0;
    const cells = row.map((value, columnIndex) => inlineCell(`${columnName(columnIndex)}${rowIndex + 1}`, value, style)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${body}</sheetData>${options?.drawing ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function zipStore(entries: Array<{ name: string; content: string }>) {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const data = textEncoder.encode(entry.content);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
      ...name, ...data,
    ]);
    localChunks.push(local);
    const central = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(localOffset),
      ...name,
    ]);
    centralChunks.push(central);
    localOffset += local.length;
  }

  const localBytes = concatBytes(localChunks);
  const centralBytes = concatBytes(centralChunks);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(centralBytes.length), ...u32(localBytes.length), ...u16(0),
  ]);
  return concatBytes([localBytes, centralBytes, end]);
}

function xlsxEntries(model: ProfessionalReportExportModel) {
  const summaryRows: unknown[][] = [
    [model.organizationName || "DTSC Platform", model.title],
    ["Contexte", model.subtitle || ""],
    ["Généré", model.generatedLabel || ""],
    [],
    ["Indicateur", "Valeur", "Comparaison"],
    ...model.kpis.map((item) => [item.label, item.value, item.comparison || ""]),
    [],
    [model.chartTitle || "Visualisation", "Valeur"],
    ...model.chart.map((item) => [item.label, item.value]),
  ];
  const dataRows: unknown[][] = [model.columns.map((column) => column.label), ...model.rows.map((row) => model.columns.map((column) => row[column.key] ?? ""))];
  const insightRows: unknown[][] = [["Interprétation", "Détail"], ...model.insights.map((item) => [item.title, item.body]), [], ["Filtre", "Valeur"], ...(model.filters || []).map((item) => [item.label, item.value])];
  const chartStart = 8 + model.kpis.length;
  const chartEnd = Math.max(chartStart, chartStart + model.chart.length - 1);
  const hasChart = model.chart.length > 0;
  const xlsxAccent = `FF${(/^#[0-9a-fA-F]{6}$/.test(model.accentHex || "") ? String(model.accentHex).slice(1) : "087EA4").toUpperCase()}`;

  const entries: Array<{ name: string; content: string }> = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hasChart ? '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}</Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthèse" sheetId="1" r:id="rId1"/><sheet name="Données" sheetId="2" r:id="rId2"/><sheet name="Interprétation" sheetId="3" r:id="rId3"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${xlsxAccent}"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>` },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml(summaryRows, { drawing: hasChart }) },
    { name: "xl/worksheets/sheet2.xml", content: sheetXml(dataRows) },
    { name: "xl/worksheets/sheet3.xml", content: sheetXml(insightRows) },
  ];
  if (hasChart) {
    entries.push(
      { name: "xl/worksheets/_rels/sheet1.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` },
      { name: "xl/drawings/drawing1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>18</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Graphique DTSC"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>` },
      { name: "xl/drawings/_rels/drawing1.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>` },
      { name: "xl/charts/chart1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(model.chartTitle || "Visualisation")}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:strRef><c:f>'Synthèse'!$A$${chartStart}:$A$${chartEnd}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>'Synthèse'!$B$${chartStart}:$B$${chartEnd}</c:f></c:numRef></c:val></c:ser><c:axId val="48650112"/><c:axId val="48672768"/></c:barChart><c:catAx><c:axId val="48650112"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="48672768"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="48672768"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:tickLblPos val="nextTo"/><c:crossAx val="48650112"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:legend><c:legendPos val="r"/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>` },
    );
  }
  return entries;
}

export function downloadProfessionalXlsx(model: ProfessionalReportExportModel) {
  const bytes = zipStore(xlsxEntries(model));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  triggerDownload(new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFileName(model.filenameBase)}.xlsx`);
}

const cp1252: Record<string, number> = { "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159 };

function winAnsi(value: string) {
  const result: number[] = [];
  for (const char of value) {
    const code = char.charCodeAt(0);
    result.push(cp1252[char] ?? (code <= 255 ? code : 63));
  }
  return new Uint8Array(result);
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function hexRgb(hex: string) {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "087EA4";
  return [parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255];
}

function pdfDocument(model: ProfessionalReportExportModel) {
  const [r, g, b] = hexRgb(model.accentHex || "#087EA4");
  const commands: string[] = [];
  const text = (x: number, y: number, size: number, value: string, bold = false) => commands.push(`BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  commands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 0 792 595 50 re f`);
  text(36, 815, 10, model.organizationName || "DTSC Platform", true);
  text(36, 780, 19, model.title, true);
  if (model.subtitle) text(36, 760, 9, model.subtitle);
  if (model.generatedLabel) text(36, 744, 8, model.generatedLabel);

  let y = 704;
  const kpis = model.kpis.slice(0, 4);
  const cardWidth = 125;
  kpis.forEach((item, index) => {
    const x = 36 + index * 132;
    commands.push(`0.96 0.97 0.98 rg ${x} ${y - 42} ${cardWidth} 48 re f`);
    text(x + 8, y - 12, 7, item.label);
    text(x + 8, y - 30, 11, item.value, true);
  });

  y -= 82;
  if (model.chart.length) {
    text(36, y, 11, model.chartTitle || "Visualisation", true);
    y -= 16;
    const points = model.chart.slice(0, 8);
    const max = Math.max(1, ...points.map((point) => Math.abs(point.value)));
    points.forEach((point) => {
      text(36, y, 7, point.label.slice(0, 26));
      const width = Math.max(2, Math.min(260, Math.abs(point.value) / max * 260));
      commands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 180 ${y - 2} ${width.toFixed(1)} 8 re f`);
      text(450, y, 7, point.displayValue || String(point.value));
      y -= 18;
    });
    y -= 8;
  }

  if (model.insights.length) {
    text(36, y, 11, "Interprétation", true);
    y -= 16;
    model.insights.slice(0, 4).forEach((insight) => {
      text(42, y, 8, `${insight.title}: ${insight.body}`.slice(0, 105));
      y -= 14;
    });
    y -= 6;
  }

  if (model.columns.length && model.rows.length && y > 150) {
    text(36, y, 11, "Données clés", true);
    y -= 16;
    const cols = model.columns.slice(0, 4);
    text(36, y, 7, cols.map((column) => column.label.slice(0, 18)).join("   |   "), true);
    y -= 13;
    model.rows.slice(0, Math.max(1, Math.floor((y - 55) / 13))).forEach((row) => {
      text(36, y, 7, cols.map((column) => String(row[column.key] ?? "").slice(0, 18)).join("   |   "));
      y -= 13;
    });
  }
  text(36, 28, 7, "DTSC Platform — rapport professionnel. Les données détaillées restent disponibles dans les exports CSV et Excel.");

  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${winAnsi(stream).length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  const chunks: Uint8Array[] = [winAnsi("%PDF-1.4\n%âãÏÓ\n")];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const chunk = winAnsi(`${index + 1} 0 obj\n${object}\nendobj\n`);
    chunks.push(chunk);
    offset += chunk.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(winAnsi(xref));
  return concatBytes(chunks);
}

export function downloadProfessionalPdf(model: ProfessionalReportExportModel) {
  triggerDownload(new Blob([pdfDocument(model)], { type: "application/pdf" }), `${safeFileName(model.filenameBase)}.pdf`);
}
