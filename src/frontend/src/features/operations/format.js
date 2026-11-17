/** Display helpers for the operations dashboard. Every function accepts missing values. */

export const formatCount = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-KE').format(n));

/** 12.5 → "12.5 min"; 135 → "2 h 15 min"; null → "—". */
export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

export const formatPercent = (value) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`);

/** Bucket label in the facility time zone: "14:00" for hours, "16 Nov" for days. */
export function bucketLabel(iso, bucket, timeZone) {
  const options = bucket === 'hour'
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }
    : { day: 'numeric', month: 'short', timeZone };
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(iso));
}

/** Rounded axis maximum and up to four evenly spaced integer ticks, starting at 0. */
export function niceTicks(max) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rough = max / 4, magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough));
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}
