export interface PdfTable {
  title: string;
  lines: string[];
  head: string[];
  body: (string | number)[][];
}

export async function exportPdfFile(filename: string, table: PdfTable) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 40;

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(table.title, margin, 48);

  doc.setFontSize(9);
  doc.setTextColor(100);
  table.lines.forEach((line, index) => doc.text(line, margin, 66 + index * 13));

  autoTable(doc, {
    head: [table.head],
    body: table.body,
    startY: 78 + table.lines.length * 13,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
  });

  doc.save(filename);
}
