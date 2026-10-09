/**
 * YYYY-MM-DD for the date as the user sees it. `toISOString().slice(0, 10)` uses UTC, which
 * turns a local-midnight date in Kigali (UTC+2) into the previous day.
 */
export function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Release times are scheduled in Kigali time (the API's TIME_ZONE, UTC+2 all year, no DST),
 * whatever the admin's browser time zone is.
 */
const KIGALI_OFFSET = '+02:00';
const KIGALI_OFFSET_MS = 2 * 3600 * 1000;

/** "2030-05-01" + "18:30" (Kigali) → ISO string with offset, for `release_at`. */
export function kigaliDateTimeToIso(date: string, time: string | null | undefined): string {
  return `${date}T${time || '00:00'}:00${KIGALI_OFFSET}`;
}

/** An ISO instant → { date: YYYY-MM-DD, time: HH:mm } in Kigali time. */
export function isoToKigaliParts(iso: string): { date: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + KIGALI_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}
