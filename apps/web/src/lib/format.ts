import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns';
import type { LeaveType, ResourceFunction, Role, TaskSeverity } from './types';

export const toDate = (v: string | Date | null | undefined) =>
  !v ? null : typeof v === 'string' ? parseISO(v) : v;

export function fmtDate(v?: string | Date | null, pattern = 'd MMM yyyy') {
  const d = toDate(v);
  return d ? format(d, pattern) : '—';
}

export function fmtTime(v?: string | Date | null) {
  const d = toDate(v);
  return d ? format(d, 'HH:mm') : '—';
}

export function fmtDateTime(v?: string | Date | null) {
  const d = toDate(v);
  return d ? format(d, 'd MMM yyyy, HH:mm') : '—';
}

/** "Today", "Yesterday", or a date — used down the attendance table. */
export function fmtDayLabel(v?: string | Date | null) {
  const d = toDate(v);
  if (!d) return '—';
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, d MMM');
}

export function fmtRelative(v?: string | Date | null) {
  const d = toDate(v);
  return d ? `${formatDistanceToNowStrict(d)} ago` : '—';
}

/** Minutes → "8h 30m". The unit the whole attendance module speaks in. */
export function fmtDuration(minutes?: number | null) {
  if (minutes == null) return '—';
  if (minutes === 0) return '0h';
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  if (!h) return `${sign}${m}m`;
  return m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

export function fmtHours(minutes?: number | null) {
  if (minutes == null) return '—';
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h`;
}

export type Currency = 'MYR' | 'PKR';

const LOCALES: Record<Currency, string> = { MYR: 'en-MY', PKR: 'en-PK' };
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(code: Currency) {
  const key = code;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALES[code] ?? 'en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      // en-PK defaults PKR to whole rupees; pin both to 2dp so a mixed-currency
      // column lines up instead of showing "Rs 9,400" beside "RM 12,160.00".
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Money always carries its currency — there is no house currency. */
export function fmtMoney(v?: number | string | null, code: Currency = 'PKR') {
  if (v == null) return '—';
  return formatterFor(code).format(Number(v));
}

/**
 * Renders a per-currency map, skipping zeros. Amounts in different currencies
 * are never added together, so a mixed total reads "RM 1,200 · ₨ 45,000".
 */
export function fmtMoneyMulti(
  totals?: Partial<Record<Currency, number>> | null,
  opts: { showZero?: boolean } = {},
) {
  if (!totals) return '—';
  const parts = (Object.entries(totals) as [Currency, number][])
    .filter(([, amount]) => opts.showZero || amount > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => fmtMoney(amount, code));
  return parts.length ? parts.join(' · ') : fmtMoney(0);
}

export function fmtNumber(v?: number | null) {
  return v == null ? '—' : new Intl.NumberFormat('en-SG').format(v);
}

export function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Acronyms that should stay upper-case in generated labels. */
const ACRONYMS = new Set(['ot', 'mr', 'pm', 'sh', 'id', 'url', 'qa', 'hr', 'ui', 'ux']);

/**
 * Enum or camelCase key → readable label.
 *   IN_PROGRESS → "In progress"
 *   OT_APPROVED → "OT approved"
 *   decidedBy   → "Decided by"
 */
export function humanise(v?: string | null) {
  if (!v) return '—';
  const words = v
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '—';
  return words
    .map((w, i) =>
      ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w,
    )
    .join(' ');
}

/**
 * `yyyy-MM-dd` for a `<input type="date">`, built from LOCAL calendar parts.
 * `toISOString()` would shift the day in any timezone offset from UTC.
 */
export function toDateInput(v: Date | string | null | undefined): string {
  const d = toDate(v);
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}

/**
 * One spelling of each access level, everywhere it shows up. Role is authority
 * layered on a person's profile — PM and EM run the same projects, they differ
 * only in who signs off resource assignments.
 */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  PM: 'Project Manager',
  EM: 'Engineering Manager',
  RESOURCE: 'Resource',
};

/** Compact form for table cells and pills, where the full title is too long. */
export const ROLE_SHORT: Record<Role, string> = {
  ADMIN: 'Admin',
  PM: 'PM',
  EM: 'EM',
  RESOURCE: 'Resource',
};

/**
 * How each function reads in the UI. Kept in step with the ResourceFunction enum
 * in `apps/api/prisma/schema.prisma` and with FUNCTION_LABEL in
 * `apps/api/src/attendance/attendance-export.ts`, which prints the same words
 * into the roster sheet.
 */
export const FUNCTION_LABEL: Record<ResourceFunction, string> = {
  DEVELOPER: 'Developer',
  SQA: 'SQA',
  TEAM_LEAD: 'Team Lead',
  DESIGNER: 'Designer',
  DEVOPS: 'DevOps',
  BUSINESS_ANALYST: 'Business Analyst',
  OTHER: 'Other',
};

export const FUNCTIONS: ResourceFunction[] = [
  'DEVELOPER', 'SQA', 'TEAM_LEAD', 'DESIGNER', 'DEVOPS', 'BUSINESS_ANALYST', 'OTHER',
];

/** How each leave type reads in the UI. */
export const LEAVE_LABEL: Record<LeaveType, string> = {
  ANNUAL: 'Annual',
  SICK: 'Sick',
  CASUAL: 'Casual',
  UNPAID: 'Unpaid',
  OTHER: 'Other',
};

/**
 * Working days in an inclusive range, Mon–Fri. Mirrors countLeaveDays() in
 * `apps/api/src/leave/leave.constants.ts` so the form can preview the figure
 * while you pick dates — the server recomputes it and stores the authority.
 *
 * Public holidays aren't modelled, so a range covering one still counts it.
 */
export function countLeaveDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;

  let days = 0;
  for (let t = from; t <= to; t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** "12–16 Sep 2026", or a single date when the range is one day. */
export function fmtDateRange(start?: string | null, end?: string | null) {
  if (!start) return '—';
  if (!end || start.slice(0, 10) === end.slice(0, 10)) return fmtDate(start);
  const a = toDate(start)!;
  const b = toDate(end)!;
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${format(a, 'd')}–${format(b, 'd MMM yyyy')}`
    : `${fmtDate(start, 'd MMM')} – ${fmtDate(end)}`;
}

/**
 * Severity is how bad the problem is; priority is what we're doing about it.
 * Labelling both makes the two columns readable side by side.
 */
export const SEVERITY_LABEL: Record<TaskSeverity, string> = {
  S1: 'S1 · Critical',
  S2: 'S2 · Major',
  S3: 'S3 · Minor',
  S4: 'S4 · Cosmetic',
};

export const SEVERITIES: TaskSeverity[] = ['S1', 'S2', 'S3', 'S4'];
