// Converts a wall-clock time ("HH:MM") in a target IANA timezone into the
// correct UTC instant — used to compute YouTube's publishAt value so a
// video actually goes live at, say, 6:00 AM US Eastern, regardless of what
// timezone the server/computer doing the upload is in.
//
// Handles daylight saving correctly by round-tripping through the actual
// Intl timezone formatting rather than assuming a fixed offset.
function wallClockToUTC(timezone, year, month, day, hour, minute) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(guess);
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  const wallAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') === 24 ? 0 : get('hour'), get('minute'), 0);
  const targetAsUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(guess.getTime() + (targetAsUTC - wallAsUTC));
}

// The next upcoming occurrence of "HH:MM" in the given timezone — today's
// occurrence if it hasn't passed yet, otherwise tomorrow's.
export function getNextOccurrenceUTC(timezone, hhmm) {
  const [targetH, targetM] = hhmm.split(':').map(Number);
  const now = new Date();
  const nowParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type) => parseInt(nowParts.find((p) => p.type === type).value, 10);
  const y = get('year'), mo = get('month'), d = get('day');

  let candidate = wallClockToUTC(timezone, y, mo, d, targetH, targetM);
  if (candidate.getTime() <= now.getTime()) {
    const tomorrow = new Date(Date.UTC(y, mo - 1, d + 1));
    candidate = wallClockToUTC(timezone, tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), targetH, targetM);
  }
  return candidate;
}

// The target-timezone calendar date (YYYY-MM-DD) that a given UTC instant
// falls on — used as the tracking key so we don't queue the same slot twice.
export function getDateStringForInstant(timezone, date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}
