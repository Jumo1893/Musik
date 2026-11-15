// CSV-Export, abgestimmt auf Excel mit deutscher Einstellung: Semikolon als
// Trennzeichen, Zeilenenden CRLF und (beim Herunterladen) ein BOM für die Umlaute.

export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return String(cell);
  // Tabellenprogramme werten Zellen, die so beginnen, als Formel aus. Songtitel wie
  // „=“ oder „+44“ gibt es wirklich – ein vorangestelltes Hochkomma entschärft sie.
  const text = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(escapeCell).join(';') + '\r\n').join('');
}

/** Bietet einen Text als Datei zum Herunterladen an. */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv'): void {
  const blob = new Blob(['﻿', content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Macht aus einem Namen einen brauchbaren Dateinamen („Abend/Runde“ → „Abend Runde“). */
export function toFilename(name: string, fallback = 'export'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  return cleaned === '' ? fallback : cleaned.slice(0, 80).trim();
}
