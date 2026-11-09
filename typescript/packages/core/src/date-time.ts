// The JSON Schema `date-time` format, as ajv-formats@3.0.1 checks it in its
// default "full" mode: `fullFormats["date-time"] = getDateTime(true)` in
// `dist/formats.js` (registration at line 12, `date` at lines 70-88,
// `getTime` at lines 98-122, the separator and `date_time` at lines 145-152).
// The logic below follows that code step by step so that `validateRecord` and
// a schema validator agree on every timestamp. There is no intended
// divergence.
//
// ajv-formats is more permissive than a strict reading of RFC 3339 § 5.6 in
// these ways, which are mirrored on purpose:
// - `T`/`Z` are case-insensitive, and the separator may also be any
//   whitespace character (`\s`), not only `T`;
// - the offset may omit its colon (`+0100`) or its minutes (`+01`);
// - year `0000` is accepted;
// - a leap second (`:60`) is accepted whenever the time is 23:59 in UTC once
//   the offset is applied, whatever the date.

const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
const DATE_TIME_SEPARATOR = /t|\s/i;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isDate(value: string): boolean {
  const matches = DATE.exec(value);
  if (!matches) return false;
  const year = Number(matches[1]);
  const month = Number(matches[2]);
  const day = Number(matches[3]);
  const lastDay = month === 2 && isLeapYear(year) ? 29 : (DAYS[month] ?? 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDay;
}

/** A time with a mandatory timezone (ajv-formats' `getTime(true)`). */
function isTime(value: string): boolean {
  const matches = TIME.exec(value);
  if (!matches) return false;
  const hour = Number(matches[1]);
  const minute = Number(matches[2]);
  const second = Number(matches[3]);
  const zone = matches[4];
  const zoneSign = matches[5] === "-" ? -1 : 1;
  const zoneHour = Number(matches[6] ?? 0);
  const zoneMinute = Number(matches[7] ?? 0);
  if (zoneHour > 23 || zoneMinute > 59 || !zone) return false;
  if (hour <= 23 && minute <= 59 && second < 60) return true;
  // Leap second: only at 23:59 UTC.
  const utcMinute = minute - zoneMinute * zoneSign;
  const utcHour = hour - zoneHour * zoneSign - (utcMinute < 0 ? 1 : 0);
  return (
    (utcHour === 23 || utcHour === -1) && (utcMinute === 59 || utcMinute === -1) && second < 61
  );
}

/** Whether `value` is a `date-time` as ajv-formats defines it (see above). */
export function isDateTime(value: string): boolean {
  const parts = value.split(DATE_TIME_SEPARATOR);
  return parts.length === 2 && isDate(parts[0] ?? "") && isTime(parts[1] ?? "");
}
