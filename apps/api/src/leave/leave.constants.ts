/**
 * Leave is counted in **whole working days, Mon–Fri**. Weekends inside a range
 * are not charged, so a Friday-to-Monday absence is 2 days, not 4.
 *
 * Public holidays are not modelled anywhere in the system, so they are not
 * deducted — a range covering one still counts it. Worth knowing before this is
 * used for anything that feeds payroll.
 *
 * The web form mirrors this to preview the figure while you pick dates; the
 * server is the authority and stores what it computed.
 */
export function countLeaveDays(start: Date, end: Date): number {
  const from = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const to = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (to < from) return 0;

  let days = 0;
  for (let t = from; t <= to; t += 86_400_000) {
    const dow = new Date(t).getUTCDay(); // 0 Sun … 6 Sat
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** Midnight-UTC date key, so a range means whole days in any timezone. */
export function dateOnly(value: string | Date): Date {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
