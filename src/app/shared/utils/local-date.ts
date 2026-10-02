/**
 * YYYY-MM-DD for the date as the user sees it. `toISOString().slice(0, 10)` uses UTC, which
 * turns a local-midnight date in Kigali (UTC+2) into the previous day.
 */
export function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
