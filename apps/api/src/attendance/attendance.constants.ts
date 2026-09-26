/** Standard working day in minutes. Work beyond this becomes overtime. */
export const STANDARD_DAY_MINUTES = 8 * 60;

/** Unpaid break deducted from a full shift, per policy. */
export const DEFAULT_BREAK_MINUTES = 60;

/**
 * Shifts of 6 hours or less take no break deduction — the break only applies
 * once someone has worked past this point.
 */
export const BREAK_THRESHOLD_MINUTES = 6 * 60;

export interface ShiftTotals {
  elapsedMinutes: number;
  /** Break actually applied to this shift — 0 on a short day. */
  breakMinutes: number;
  workMinutes: number;
  otMinutes: number;
}

/**
 * How much unpaid break a shift actually attracts.
 *
 * The deduction is also capped so it can never pull payable time back below the
 * 6h threshold — without that, a 6h01m shift would pay less than a 6h00m one.
 */
export function breakFor(elapsedMinutes: number, policyBreak = DEFAULT_BREAK_MINUTES): number {
  if (elapsedMinutes <= BREAK_THRESHOLD_MINUTES) return 0;
  return Math.min(policyBreak, elapsedMinutes - BREAK_THRESHOLD_MINUTES);
}

/**
 * Turns a check-in/check-out pair into payable minutes.
 *
 *   elapsed − break            → total worked   (no break at or under 6h)
 *   min(worked, 8h)            → regular work minutes
 *   max(worked − 8h, 0)        → overtime, pending approval
 *
 * e.g. 09:00–18:00 = 9h elapsed − 1h break = 8h work, 0 OT
 *      09:00–20:00 = 11h elapsed − 1h break = 8h work + 2h OT
 *      09:00–14:00 = 5h elapsed − 0h break = 5h work, 0 OT
 */
export function computeShift(
  checkInAt: Date,
  checkOutAt: Date,
  policyBreak = DEFAULT_BREAK_MINUTES,
): ShiftTotals {
  const elapsedMinutes = Math.max(
    0,
    Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000),
  );
  const breakMinutes = breakFor(elapsedMinutes, policyBreak);
  const payable = Math.max(0, elapsedMinutes - breakMinutes);
  return {
    elapsedMinutes,
    breakMinutes,
    workMinutes: Math.min(payable, STANDARD_DAY_MINUTES),
    otMinutes: Math.max(0, payable - STANDARD_DAY_MINUTES),
  };
}

/** Calendar day a shift belongs to, normalised to UTC midnight for the `@db.Date` column. */
export function dayKey(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
