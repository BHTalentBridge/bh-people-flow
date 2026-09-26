import { Workbook } from 'exceljs';

type Row = {
  title: string;
  status: string;
  priority: string;
  severity: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  ticketId: string | null;
  ticketUrl: string | null;
  mrUrl: string | null;
  mrTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
  project: { name: string; code: string; client: { name: string } | null };
  module: { name: string } | null;
  subModule: { name: string } | null;
  assignee: { name: string; role: string };
  createdBy: { name: string; role: string } | null;
};

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

/** Title-cases enum values so the sheet reads like the UI, not the database. */
const humanise = (v: string) =>
  v
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** S1 → "S1 Critical". Sorts correctly as text, and reads without a legend. */
const SEVERITY_LABEL: Record<string, string> = {
  S1: 'S1 Critical',
  S2: 'S2 Major',
  S3: 'S3 Minor',
  S4: 'S4 Cosmetic',
};

/**
 * Builds the task workbook using the client's own incident-log layout, so the
 * sheet can be dropped straight into theirs:
 *
 *   DATE · TICKET ID · SEVERITY · PRIORITY · STATUS · STREAM · TAKEN BY ·
 *   Problem Summary & Proactive Action Taken · TICKET LINK · MR TITLE · MR LINK
 *
 * Mapping worth knowing:
 *   DATE    → when the task was created (one row per issue, dated when raised)
 *   STREAM  → module, narrowed to "Module › Sub-module" when there is one
 *   Summary → the task title
 *
 * Links are written as real hyperlinks rather than text, so they behave the way
 * they do in the sheet this mirrors.
 */
export async function buildTasksWorkbook(
  rows: Row[],
  meta: { generatedBy: string; filters: string },
) {
  const wb = new Workbook();
  wb.creator = 'PeopleFlow — Steel Horizon HRMS';
  wb.created = new Date();

  const ws = wb.addWorksheet('Tasks', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'DATE', key: 'date', width: 12 },
    { header: 'TICKET ID', key: 'ticketId', width: 14 },
    { header: 'SEVERITY', key: 'severity', width: 14 },
    { header: 'PRIORITY', key: 'priority', width: 11 },
    { header: 'STATUS', key: 'status', width: 13 },
    // The module, narrowed to the sub-module when the task has one.
    { header: 'STREAM', key: 'stream', width: 26 },
    { header: 'TAKEN BY', key: 'takenBy', width: 20 },
    { header: 'Problem Summary & Proactive Action Taken', key: 'summary', width: 60 },
    { header: 'TICKET LINK', key: 'ticketUrl', width: 44 },
    { header: 'MR TITLE', key: 'mrTitle', width: 34 },
    { header: 'MR LINK', key: 'mrUrl', width: 44 },
  ];

  const link = (url: string | null) =>
    url ? { text: url, hyperlink: url } : '';

  for (const t of rows) {
    ws.addRow({
      date: day(t.createdAt),
      ticketId: t.ticketId ?? '',
      severity: t.severity ? SEVERITY_LABEL[t.severity] ?? t.severity : '',
      priority: humanise(t.priority),
      status: humanise(t.status),
      stream: t.subModule
        ? `${t.module?.name ?? '—'} › ${t.subModule.name}`
        : t.module?.name ?? 'Whole project',
      takenBy: t.assignee.name,
      summary: t.title,
      ticketUrl: link(t.ticketUrl),
      mrTitle: t.mrTitle ?? '',
      mrUrl: link(t.mrUrl),
    });
  }

  // Column-level styling first. `getColumn().font` covers the header cell too,
  // so anything set here has to be applied before the header is styled —
  // otherwise the blue underline below leaves TICKET LINK and MR LINK
  // unreadable against the header fill.
  for (const key of ['summary', 'mrTitle', 'stream']) {
    ws.getColumn(key).alignment = { vertical: 'top', wrapText: true };
  }
  for (const key of ['ticketUrl', 'mrUrl']) {
    ws.getColumn(key).font = { color: { argb: 'FF1155CC' }, underline: true };
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  // Count plus the status split, so the sheet answers "where are we?" without
  // building a pivot first.
  if (rows.length) {
    const byStatus = rows.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});
    const totalRow = ws.addRow({
      date: `${rows.length} task${rows.length === 1 ? '' : 's'}`,
      status: Object.entries(byStatus)
        .map(([s, n]) => `${humanise(s)}: ${n}`)
        .join(' · '),
    });
    totalRow.font = { bold: true };
    totalRow.border = { top: { style: 'thin' } };
  }

  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } };

  const info = wb.addWorksheet('Export info');
  info.columns = [
    { header: 'Field', key: 'k', width: 22 },
    { header: 'Value', key: 'v', width: 70 },
  ];
  info.getRow(1).font = { bold: true };
  info.addRows([
    { k: 'Generated at', v: new Date().toISOString() },
    { k: 'Generated by', v: meta.generatedBy },
    { k: 'Filters applied', v: meta.filters || 'none — all records in scope' },
    { k: 'Rows', v: String(rows.length) },
    { k: 'DATE', v: 'The date the task was created.' },
    { k: 'STREAM', v: 'The module, narrowed to "Module › Sub-module" where the task has one.' },
    { k: 'SEVERITY', v: 'S1 Critical · S2 Major · S3 Minor · S4 Cosmetic. Blank where not set.' },
    { k: 'Note', v: 'Scoped to what you can see in the app.' },
  ]);

  return wb;
}
