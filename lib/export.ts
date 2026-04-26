"use client";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Export an array of objects to an .xlsx file and trigger download.
 */
export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  sheetName = "Data"
) {
  if (rows.length === 0) {
    alert("No data to export.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-size columns
  const cols = Object.keys(rows[0]).map((k) => ({
    wch: Math.max(
      k.length,
      ...rows.slice(0, 100).map((r) => String(r[k] ?? "").length)
    ) + 2
  }));
  ws["!cols"] = cols;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Export a tabular dataset to a clean PDF report.
 */
export function exportToPDF(opts: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
}) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(opts.title, 14, 18);
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(opts.subtitle, 14, 25);
  }
  autoTable(doc, {
    startY: opts.subtitle ? 30 : 24,
    head: [opts.columns],
    body: opts.rows,
    headStyles: { fillColor: [20, 184, 166] }, // brand teal
    styles: { fontSize: 9 }
  });
  const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Generated ${new Date().toLocaleString()} · FoxSystems Medical CRM`,
    14,
    lastY + 10
  );
  doc.save(opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`);
}
