import { Workbook, Worksheet } from 'exceljs';

/**
 * Profile behind a roster line. Placements arrive pre-filtered to the caller's
 * project scope (see `exportProfileSelect`), so whatever is here is safe to
 * print.
 */
export type ExportProfile = {
  employeeCode: string;
  designation: string | null;
  jobFunction: string | null;
  type: string;
  internalSeniority: string | null;
  serviceProvider: { name: string } | null;
  assignments: {
    roleOnProject: string | null;
    project: { name: string; code: string; client: { name: string } };
  }[];
};

type Row = {
  date: Date;
  checkInAt: Date;
  checkOutAt: Date | null;
  breakMinutes: number;
  workMinutes: number;
  otMinutes: number;
  note: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    resource: ExportProfile | null;
  };
  overtimeRequest: {
    minutes: number;
    status: string;
    reason: string | null;
    decisionNote: string | null;
    decidedBy: { name: string } | null;
  } | null;
};

/** Matches the abbreviations used in the timesheet this mirrors. */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat'];
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

const hours = (minutes: number) => Number((minutes / 60).toFixed(2));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const clock = (d: Date | null) =>
  d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;

/** Every calendar day in the period, inclusive — a timesheet lists them all. */
function eachDay(from: Date, to: Date) {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) out.push(new Date(t));
  return out;
}

/** Excel forbids []:*?/\ in sheet names and caps them at 31 characters. */
function sheetName(name: string, taken: Set<string>) {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Timesheet';
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

const WEEKEND_FILL = 'FFFCF3D4';
const NA = 'N/A';
const HEADER_FILL = 'FF4F46E5';

/** Mirrors FUNCTION_LABEL in `apps/web/src/lib/format.ts`. */
const FUNCTION_LABEL: Record<string, string> = {
  DEVELOPER: 'Developer',
  SQA: 'SQA',
  TEAM_LEAD: 'Team Lead',
  DESIGNER: 'Designer',
  DEVOPS: 'DevOps',
  BUSINESS_ANALYST: 'Business Analyst',
  OTHER: 'Other',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
/** "24 June 2026" — how the period reads on the sheet the client already uses. */
const longDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Unique values in first-seen order, blanks dropped. */
const uniq = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v && !!v.trim()))];

/**
 * One standard working day. Man-days are hours ÷ 8, matching
 * STANDARD_DAY_MINUTES in `attendance.constants.ts` — the same divisor the app
 * uses to decide what counts as overtime, so the two never disagree.
 */
const MAN_DAY_HOURS = 8;
const manDays = (h: number) => Number((h / MAN_DAY_HOURS).toFixed(2));
const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Overtime that actually counts: only what a PM or Admin has approved.
 *
 * `attendance.otMinutes` is the raw excess over the standard day, recorded the
 * moment someone checks out late — it is a *claim*, not an entitlement. The
 * request carries the decision, so an unapproved or rejected claim contributes
 * nothing to any total on any sheet. Anything still pending is called out in
 * the Notes column rather than silently dropped.
 */
function approvedOtHours(rec: Row): number {
  const req = rec.overtimeRequest;
  return req && req.status === 'APPROVED' ? hours(req.minutes) : 0;
}

/**
 * Overtime that was claimed but not counted, so its absence from the OT column
 * is explained rather than silent. Covers the case of a record carrying OT
 * minutes with no request attached at all — check-out always files one, but a
 * figure this sheet drops should never disappear without a word.
 */
function unapprovedOtNote(rec: Row): string | null {
  const req = rec.overtimeRequest;
  if (!req) {
    return rec.otMinutes > 0
      ? `${hours(rec.otMinutes).toFixed(2)} h OT never submitted for approval — not counted`
      : null;
  }
  if (req.status === 'APPROVED' || req.minutes <= 0) return null;
  const state = req.status === 'REJECTED' ? 'rejected' : 'pending approval';
  return `${hours(req.minutes).toFixed(2)} h OT ${state} — not counted`;
}

type Totals = { normal: number; ot: number; weekend: number };

/**
 * Hours a person accumulated over the period, split the same way the timesheet
 * splits them: worked time is Normal on a weekday and Weekend on a Sat/Sun,
 * never both. Single source for the roster and for the per-person totals row,
 * so the summary can never drift from the tab it summarises.
 */
function summarise(records: Map<string, Row>, days: Date[]): Totals {
  let normal = 0;
  let ot = 0;
  let weekend = 0;
  for (const d of days) {
    const rec = records.get(iso(d));
    if (!rec) continue;
    const worked = hours(rec.workMinutes);
    if (isWeekend(d)) weekend += worked;
    else normal += worked;
    ot += approvedOtHours(rec);
  }
  return { normal: round2(normal), ot: round2(ot), weekend: round2(weekend) };
}

/**
 * One timesheet per person, one tab each, laid out like the sheet the team
 * already keeps by hand:
 *
 *   Date · Day · Shift · Clock In · Clock Out · Normal Hours ·
 *   Overtime Hours · Weekend Hours · Notes · STAT SCREENSHOTS
 *
 * Every calendar day in the period gets a row whether or not anything was
 * logged — a timesheet is a record of the month, and a blank day is itself
 * information. Days with no record read `N/A`.
 *
 * Worked time lands in **Normal Hours** on a weekday and **Weekend Hours** on a
 * Saturday or Sunday, with the other column showing `N/A`, so the two never
 * double-count. Weekend rows are tinted the same way.
 *
 * Two columns are placeholders by design: **Shift** always reads `Day` (there
 * is no shift model yet) and **STAT SCREENSHOTS** is left empty for whoever
 * pastes them in.
 */
export async function buildAttendanceWorkbook(
  rows: Row[],
  meta: {
    generatedBy: string;
    filters: string;
    from: Date;
    to: Date;
    /** People to emit a tab for even with no records — e.g. a person filter. */
    alwaysInclude?: { id: string; name: string; resource: ExportProfile | null }[];
  },
) {
  const wb = new Workbook();
  wb.creator = 'PeopleFlow — Steel Horizon HRMS';
  wb.created = new Date();

  // Group by person; a timesheet belongs to one person.
  const byPerson = new Map<string, Person>();
  for (const r of rows) {
    let entry = byPerson.get(r.user.id);
    if (!entry) {
      entry = { name: r.user.name, profile: r.user.resource, rows: new Map() };
      byPerson.set(r.user.id, entry);
    }
    entry.rows.set(iso(r.date), r);
  }
  for (const p of meta.alwaysInclude ?? []) {
    if (!byPerson.has(p.id)) {
      byPerson.set(p.id, { name: p.name, profile: p.resource, rows: new Map() });
    }
  }

  const days = eachDay(meta.from, meta.to);
  // Alphabetical, so the roster reads like a staff list and the tabs follow it.
  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (!people.length) {
    const ws = wb.addWorksheet('Summary');
    ws.addRow(['No attendance records for the selected filters.']);
    ws.getRow(1).font = { bold: true };
  } else {
    writeRoster(wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3 }] }), people, days, meta);
  }

  // 'Summary' and 'Export info' are claimed up front so a person named either
  // gets a suffixed tab rather than colliding.
  const taken = new Set(['summary', 'export info']);
  for (const person of people) {
    const ws = wb.addWorksheet(sheetName(person.name, taken), {
      views: [{ state: 'frozen', ySplit: 2 }],
    });
    writeTimesheet(ws, person, days);
  }

  const info = wb.addWorksheet('Export info');
  info.columns = [
    { header: 'Field', key: 'k', width: 22 },
    { header: 'Value', key: 'v', width: 72 },
  ];
  info.getRow(1).font = { bold: true };
  info.addRows([
    { k: 'Generated at', v: new Date().toISOString() },
    { k: 'Generated by', v: meta.generatedBy },
    { k: 'Period', v: `${iso(meta.from)} to ${iso(meta.to)}` },
    { k: 'Filters applied', v: meta.filters || 'none — all records in scope' },
    { k: 'People', v: String(people.length) },
    { k: 'Normal vs Weekend', v: 'Worked hours land in Normal on a weekday and Weekend on Sat/Sun; the other reads N/A so they never double-count.' },
    { k: 'Overtime', v: 'Approved overtime only. Hours beyond the standard day are a claim until a PM or Admin approves them; anything pending or rejected is excluded from every total and flagged in the Notes column instead. The unpaid break is already excluded from every figure.' },
    { k: 'Shift', v: 'Always "Day" — there is no shift model yet.' },
    { k: 'N/A', v: 'No attendance was recorded for that day.' },
    { k: 'Man-days', v: `Hours divided by ${MAN_DAY_HOURS}, the standard working day used throughout the app.` },
    { k: 'Summary sheet', v: 'One line per person. Hours are what was actually measured — a person on several projects is listed once, with every project named, and their hours are never split between them.' },
  ]);

  return wb;
}

type Person = { name: string; profile: ExportProfile | null; rows: Map<string, Row> };

function writeTimesheet(ws: Worksheet, person: Person, days: Date[]) {
  const code = person.profile?.employeeCode ?? null;
  // A title line above the header, so a printed tab identifies its owner.
  const title = ws.addRow([code ? `${person.name} — ${code}` : person.name]);
  title.font = { bold: true, size: 13 };
  ws.mergeCells(1, 1, 1, 10);

  ws.columns = [
    { key: 'date', width: 12 },
    { key: 'day', width: 8 },
    { key: 'shift', width: 8 },
    { key: 'in', width: 11 },
    { key: 'out', width: 11 },
    { key: 'normal', width: 14 },
    { key: 'ot', width: 15 },
    { key: 'weekend', width: 15 },
    { key: 'notes', width: 40 },
    { key: 'screenshots', width: 22 },
  ];

  const header = ws.addRow({
    date: 'Date', day: 'Day', shift: 'Shift', in: 'Clock In', out: 'Clock Out',
    normal: 'Normal Hours', ot: 'Overtime Hours', weekend: 'Weekend Hours',
    notes: 'Notes', screenshots: 'STAT SCREENSHOTS',
  });
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  for (const d of days) {
    const rec = person.rows.get(iso(d));
    const weekend = isWeekend(d);
    const worked = rec ? hours(rec.workMinutes) : 0;
    const ot = rec ? approvedOtHours(rec) : 0;

    const row = ws.addRow({
      date: iso(d),
      day: DAY_NAMES[d.getUTCDay()],
      shift: 'Day',
      in: rec ? clock(rec.checkInAt) ?? NA : NA,
      out: rec ? clock(rec.checkOutAt) ?? 'still on the clock' : NA,
      // Exactly one of these carries a number, so a column total is meaningful.
      normal: weekend ? NA : worked,
      ot,
      weekend: weekend ? worked : NA,
      notes: [rec?.note ?? rec?.overtimeRequest?.reason, rec ? unapprovedOtNote(rec) : null]
        .filter(Boolean)
        .join(' · '),
      screenshots: '',
    });

    if (weekend) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WEEKEND_FILL } };
      });
    }
  }

  // Same figures the Summary sheet prints, from the same function.
  const t = summarise(person.rows, days);
  const totals = ws.addRow({
    date: 'Total Hours', normal: t.normal, ot: t.ot, weekend: t.weekend,
  });
  totals.font = { bold: true };
  totals.border = { top: { style: 'thin' } };

  for (const key of ['normal', 'ot', 'weekend']) {
    const col = ws.getColumn(key);
    col.alignment = { horizontal: 'right' };
    col.numFmt = '0.00';
  }
  for (const key of ['day', 'shift', 'in', 'out']) {
    ws.getColumn(key).alignment = { horizontal: 'center' };
  }
  ws.getColumn('notes').alignment = { vertical: 'top', wrapText: true };

  // Re-assert the header after column-level styling, which would otherwise
  // right-align and reformat the header cells too.
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell('I2').alignment = { vertical: 'middle', horizontal: 'left' };

  ws.autoFilter = { from: 'A2', to: { row: 2, column: 10 } };
}

/**
 * The summary page the client's own workbook opens with: one line per person,
 * their placement, the hours they logged over the period and the same figures
 * again as man-days.
 *
 * A person on several projects gets **one** line naming all of them. Their
 * hours are what the clock actually recorded and are never divided between
 * projects — attendance is logged against the person, not the project, so any
 * split would be invented.
 */
function writeRoster(
  ws: Worksheet,
  people: Person[],
  days: Date[],
  meta: { from: Date; to: Date },
) {
  const period = ws.addRow(['Period', `${longDate(meta.from)} - ${longDate(meta.to)}`]);
  period.font = { bold: true, size: 12 };
  ws.mergeCells(1, 2, 1, 4);
  ws.addRow([]);

  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'client', width: 24 },
    { key: 'project', width: 30 },
    { key: 'vendorId', width: 12 },
    { key: 'name', width: 24 },
    { key: 'jobFunction', width: 18 },
    { key: 'role', width: 24 },
    { key: 'seniority', width: 14 },
    { key: 'normal', width: 13 },
    { key: 'ot', width: 11 },
    { key: 'weekend', width: 14 },
    { key: 'total', width: 12 },
    { key: 'mdNormal', width: 17 },
    { key: 'mdOt', width: 14 },
    { key: 'mdWeekend', width: 18 },
    { key: 'mdTotal', width: 16 },
  ];

  const header = ws.addRow({
    n: '#', client: 'Client', project: 'Project', vendorId: 'Vendor ID', name: 'Name',
    jobFunction: 'Function', role: 'Role', seniority: 'Seniority',
    normal: 'Normal Hours', ot: 'OT Hours', weekend: 'Weekend Hours', total: 'Total Hours',
    mdNormal: 'Man-Days (Normal)', mdOt: 'Man-Days (OT)',
    mdWeekend: 'Man-Days (Weekend)', mdTotal: 'Total Man-Days',
  });
  const headerRowNumber = header.number;

  const grand: Totals = { normal: 0, ot: 0, weekend: 0 };

  people.forEach((person, i) => {
    const t = summarise(person.rows, days);
    grand.normal += t.normal;
    grand.ot += t.ot;
    grand.weekend += t.weekend;

    const placements = person.profile?.assignments ?? [];
    const totalHours = round2(t.normal + t.ot + t.weekend);

    ws.addRow({
      n: i + 1,
      client: uniq(placements.map((a) => a.project.client.name)).join(', ') || '—',
      project: uniq(placements.map((a) => a.project.name)).join(', ') || 'Not placed',
      vendorId: person.profile?.employeeCode ?? '',
      name: person.name,
      jobFunction: person.profile?.jobFunction
        ? FUNCTION_LABEL[person.profile.jobFunction] ?? person.profile.jobFunction
        : '',
      // What they do on the projects in question, falling back to the
      // company-wide title when no per-project role was recorded.
      role: uniq(placements.map((a) => a.roleOnProject)).join(', ')
        || person.profile?.designation
        || '',
      // Only ever set for external resources; internal staff are left blank.
      seniority: person.profile?.internalSeniority ?? '',
      normal: t.normal,
      ot: t.ot,
      weekend: t.weekend,
      total: totalHours,
      mdNormal: manDays(t.normal),
      mdOt: manDays(t.ot),
      mdWeekend: manDays(t.weekend),
      mdTotal: manDays(totalHours),
    });
  });

  const grandTotal = round2(grand.normal + grand.ot + grand.weekend);
  const totals = ws.addRow({
    name: 'Total',
    normal: round2(grand.normal),
    ot: round2(grand.ot),
    weekend: round2(grand.weekend),
    total: grandTotal,
    mdNormal: manDays(grand.normal),
    mdOt: manDays(grand.ot),
    mdWeekend: manDays(grand.weekend),
    mdTotal: manDays(grandTotal),
  });
  totals.font = { bold: true };
  totals.border = { top: { style: 'thin' } };

  const numeric = ['normal', 'ot', 'weekend', 'total', 'mdNormal', 'mdOt', 'mdWeekend', 'mdTotal'];
  for (const key of numeric) {
    const col = ws.getColumn(key);
    col.alignment = { horizontal: 'right' };
    col.numFmt = '0.00';
  }
  for (const key of ['n', 'vendorId', 'seniority']) {
    ws.getColumn(key).alignment = { horizontal: 'center' };
  }
  ws.getColumn('n').numFmt = '0';
  for (const key of ['client', 'project', 'role']) {
    ws.getColumn(key).alignment = { vertical: 'top', wrapText: true };
  }

  // Re-assert after the column styling above, which would otherwise right-align
  // and number-format the header cells too.
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 30;
  ws.getCell(headerRowNumber, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell(headerRowNumber, 2).alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell(headerRowNumber, 3).alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell(headerRowNumber, 5).alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell(headerRowNumber, 6).alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell(headerRowNumber, 7).alignment = { vertical: 'middle', horizontal: 'left' };

  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: 16 },
  };
}
