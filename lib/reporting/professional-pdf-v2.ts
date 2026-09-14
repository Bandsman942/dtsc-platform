import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

const CP1252: Record<string, number> = { "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159 };

type PdfPage = { width: number; height: number; commands: string[] };

function safeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "dtsc-report";
}

function winAnsi(value: string) {
  const normalized = value
    .replace(/→/g, "–")
    .replace(/←/g, "–")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≈/g, "~")
    .replace(/✓/g, "OK");
  const result: number[] = [];
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    result.push(CP1252[char] ?? (code <= 255 ? code : 63));
  }
  return new Uint8Array(result);
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function hexRgb(hex: string) {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "087EA4";
  return [parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255];
}

function text(page: PdfPage, x: number, y: number, size: number, value: unknown, bold = false) {
  const safe = String(value ?? "").replace(/→/g, "–");
  page.commands.push(`0.06 0.09 0.14 rg BT /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(safe)}) Tj ET`);
}

function mutedText(page: PdfPage, x: number, y: number, size: number, value: unknown, bold = false) {
  const safe = String(value ?? "").replace(/→/g, "–");
  page.commands.push(`0.34 0.40 0.48 rg BT /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(safe)}) Tj ET`);
}

function line(page: PdfPage, x1: number, y1: number, x2: number, y2: number, gray = 0.86) {
  page.commands.push(`${gray} ${gray} ${gray} RG 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`);
}

function rect(page: PdfPage, x: number, y: number, width: number, height: number, fill: [number, number, number]) {
  page.commands.push(`${fill[0].toFixed(3)} ${fill[1].toFixed(3)} ${fill[2].toFixed(3)} rg ${x} ${y} ${width} ${height} re f`);
}

function wrap(value: unknown, maxChars: number) {
  const source = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const words = source.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) { current = word; continue; }
    if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.flatMap((item) => item.length <= maxChars ? [item] : Array.from({ length: Math.ceil(item.length / maxChars) }, (_, index) => item.slice(index * maxChars, (index + 1) * maxChars)));
}

function reportReference(model: ProfessionalReportExportModel) {
  const match = `${model.subtitle || ""} ${model.filenameBase}`.match(/RPT-\d{8}-[A-Z0-9-]+/i);
  return match?.[0] || "DTSC-REPORT";
}

function summaryPage(model: ProfessionalReportExportModel) {
  const page: PdfPage = { width: 595, height: 842, commands: [] };
  const accent = hexRgb(model.accentHex || "#087EA4") as [number, number, number];
  rect(page, 0, 836, 595, 6, accent);
  text(page, 36, 808, 9, model.organizationName || "DTSC Platform", true);
  mutedText(page, 36, 793, 7.5, "DTSC Platform · ERP Reporting");
  text(page, 36, 760, 20, model.title, true);
  if (model.subtitle) mutedText(page, 36, 741, 9, model.subtitle);
  if (model.generatedLabel) mutedText(page, 36, 726, 8, model.generatedLabel);
  line(page, 36, 710, 559, 710);

  let y = 688;
  if (model.filters?.length) {
    mutedText(page, 36, y, 8, "Périmètre", true);
    y -= 15;
    const filterText = model.filters.map((item) => `${item.label}: ${item.value}`).join("  ·  ");
    for (const row of wrap(filterText, 105).slice(0, 4)) { text(page, 36, y, 7.5, row); y -= 12; }
    y -= 6;
  }

  const kpis = model.kpis.slice(0, 8);
  if (kpis.length) {
    const cardWidth = 250;
    const cardHeight = 52;
    kpis.forEach((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 36 + column * 267;
      const top = y - row * 60;
      rect(page, x, top - cardHeight, cardWidth, cardHeight, [0.965, 0.975, 0.985]);
      mutedText(page, x + 10, top - 17, 7, item.label.toUpperCase(), true);
      text(page, x + 10, top - 36, 12, item.value, true);
      if (item.comparison) mutedText(page, x + 10, top - 47, 6.5, item.comparison);
    });
    y -= Math.ceil(kpis.length / 2) * 60 + 8;
  }

  if (model.chart.length && y > 310) {
    text(page, 36, y, 10, model.chartTitle || "Comparaison", true);
    y -= 18;
    const points = model.chart.slice(0, 8);
    const max = Math.max(1, ...points.map((point) => Math.abs(point.value)));
    for (const point of points) {
      const label = String(point.label).slice(0, 28);
      mutedText(page, 36, y, 7, label);
      const width = Math.max(2, Math.min(245, Math.abs(point.value) / max * 245));
      rect(page, 180, y - 2, width, 7, accent);
      text(page, 438, y, 7, point.displayValue || point.value);
      y -= 16;
    }
    y -= 4;
  }

  if (model.insights.length && y > 120) {
    text(page, 36, y, 10, "Interprétation", true);
    y -= 17;
    for (const insight of model.insights.slice(0, 5)) {
      text(page, 36, y, 7.5, insight.title, true);
      y -= 12;
      for (const row of wrap(insight.body, 104).slice(0, 3)) { mutedText(page, 42, y, 7, row); y -= 11; }
      y -= 5;
      if (y < 70) break;
    }
  }
  return page;
}

function tablePages(model: ProfessionalReportExportModel) {
  if (!model.columns.length || !model.rows.length) return [] as PdfPage[];
  const landscape = model.columns.length > 5;
  const width = landscape ? 842 : 595;
  const height = landscape ? 595 : 842;
  const margin = 32;
  const tableWidth = width - margin * 2;
  const rowHeight = 18;
  const headerY = height - 72;
  const footerLimit = 40;
  const rowsPerPage = Math.max(8, Math.floor((headerY - footerLimit - 28) / rowHeight));
  const columnWidth = tableWidth / model.columns.length;
  const maxChars = Math.max(8, Math.floor(columnWidth / 4.4));
  const accent = hexRgb(model.accentHex || "#087EA4") as [number, number, number];
  const pages: PdfPage[] = [];

  for (let offset = 0; offset < model.rows.length; offset += rowsPerPage) {
    const page: PdfPage = { width, height, commands: [] };
    rect(page, 0, height - 5, width, 5, accent);
    text(page, margin, height - 28, 9, model.organizationName || "DTSC Platform", true);
    mutedText(page, margin, height - 43, 7, `${model.title} · ${reportReference(model)}`);
    let y = headerY;
    rect(page, margin, y - 14, tableWidth, 18, [0.93, 0.95, 0.97]);
    model.columns.forEach((column, index) => {
      const x = margin + index * columnWidth + 4;
      text(page, x, y - 8, 6.5, String(column.label).slice(0, maxChars), true);
    });
    y -= 18;
    for (const row of model.rows.slice(offset, offset + rowsPerPage)) {
      model.columns.forEach((column, index) => {
        const x = margin + index * columnWidth + 4;
        const value = String(row[column.key] ?? "—").replace(/\s+/g, " ");
        text(page, x, y - 8, 6.2, value.length > maxChars ? `${value.slice(0, Math.max(1, maxChars - 1))}…` : value);
      });
      line(page, margin, y - 13, margin + tableWidth, y - 13, 0.92);
      y -= rowHeight;
    }
    pages.push(page);
  }
  return pages;
}

function appendFooters(pages: PdfPage[], model: ProfessionalReportExportModel) {
  const reference = reportReference(model);
  pages.forEach((page, index) => {
    line(page, 32, 28, page.width - 32, 28, 0.85);
    mutedText(page, 32, 16, 6.5, `DTSC Platform · ${reference} · Rapport ERP`);
    mutedText(page, page.width - 94, 16, 6.5, `Page ${index + 1}/${pages.length}`);
  });
}

function pdfDocument(model: ProfessionalReportExportModel) {
  const pages = [summaryPage(model), ...tablePages(model)];
  appendFooters(pages, model);
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  const contentObjectIds = pages.map((_, index) => 4 + index * 2);
  const fontRegularId = 3 + pages.length * 2;
  const fontBoldId = fontRegularId + 1;
  const objects: string[] = [];
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    const stream = page.commands.join("\n");
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${winAnsi(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontRegularId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[fontBoldId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

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

export function downloadProfessionalPdfV2(model: ProfessionalReportExportModel) {
  const bytes = pdfDocument(model);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(model.filenameBase)}.pdf`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const __professionalPdfV2Internals = { pdfDocument };
