const IST_OFFSET_MINUTES = 330;

export function localDay(value = new Date()) {
  const shifted = new Date(value.getTime() + IST_OFFSET_MINUTES * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function periodBounds(period, value = new Date()) {
  if (period !== 'weekly' && period !== 'monthly') throw new TypeError('period must be weekly or monthly');
  const shifted = new Date(value.getTime() + IST_OFFSET_MINUTES * 60_000);
  const year = shifted.getUTCFullYear();
  const monthIndex = shifted.getUTCMonth();
  let startMs;
  let endMs;
  if (period === 'weekly') {
    const day = shifted.getUTCDay();
    const sinceMonday = (day + 6) % 7;
    startMs = Date.UTC(year, monthIndex, shifted.getUTCDate() - sinceMonday);
    endMs = startMs + 7 * 24 * 60 * 60 * 1000;
  } else {
    startMs = Date.UTC(year, monthIndex, 1);
    endMs = Date.UTC(year, monthIndex + 1, 1);
  }
  const from = new Date(startMs - IST_OFFSET_MINUTES * 60_000);
  const to = new Date(endMs - IST_OFFSET_MINUTES * 60_000);
  return { start: from.toISOString(), end: to.toISOString(), startLocal: new Date(startMs).toISOString().slice(0, 10), endLocal: new Date(endMs).toISOString().slice(0, 10) };
}

export function isoNow() { return new Date().toISOString(); }
