import { describe, expect, it } from "vite-plus/test";

import { isDateTime } from "../src/date-time.ts";

describe("isDateTime", () => {
  it.each([
    ["UTC with Z", "2025-01-15T10:30:00Z"],
    ["fractional seconds", "2025-01-15T10:30:00.123456789Z"],
    ["positive offset", "2025-01-15T10:30:00+02:00"],
    ["negative offset", "2025-01-15T10:30:00-05:30"],
    ["leap day", "2024-02-29T00:00:00Z"],
    ["leap day of a 400-year", "2000-02-29T00:00:00Z"],
    ["end of a 31-day month", "2025-12-31T23:59:59Z"],
    ["leap second in UTC", "2016-12-31T23:59:60Z"],
    ["leap second with fraction", "2016-12-31T23:59:60.5Z"],
    ["leap second shifted by an offset", "2016-12-31T18:59:60-05:00"],
    // Accepted by ajv-formats although stricter readings of RFC 3339 differ.
    ["lowercase separator and zone", "2025-01-15t10:30:00z"],
    ["space separator", "2025-01-15 10:30:00Z"],
    ["tab separator", "2025-01-15\t10:30:00Z"],
    ["offset without colon", "2025-01-15T10:30:00+0100"],
    ["offset without minutes", "2025-01-15T10:30:00+01"],
    ["year zero", "0000-01-01T00:00:00Z"],
  ])("accepts %s", (_, value) => {
    expect(isDateTime(value)).toBe(true);
  });

  it.each([
    ["no timezone", "2025-01-15T10:30:00"],
    ["date only", "2025-01-15"],
    ["time only", "10:30:00Z"],
    ["empty string", ""],
    ["no seconds", "2025-01-15T10:30Z"],
    ["month 13", "2025-13-01T00:00:00Z"],
    ["month 00", "2025-00-01T00:00:00Z"],
    ["day 00", "2025-01-00T00:00:00Z"],
    ["31 April", "2025-04-31T00:00:00Z"],
    ["29 February of a common year", "2025-02-29T00:00:00Z"],
    ["29 February of a century year", "1900-02-29T00:00:00Z"],
    ["hour 24", "2025-01-15T24:00:00Z"],
    ["minute 60", "2025-01-15T10:60:00Z"],
    ["second 60 outside a leap second", "2025-01-15T10:30:60Z"],
    ["leap second not at 23:59 UTC", "2016-12-31T23:59:60+01:00"],
    ["offset hour 24", "2025-01-15T10:30:00+24:00"],
    ["offset minute 60", "2025-01-15T10:30:00+01:60"],
    ["two separators", "2025-01-15T10:30:00ZT"],
    ["trailing space", "2025-01-15T10:30:00Z "],
    ["empty fraction", "2025-01-15T10:30:00.Z"],
    ["short year", "25-01-15T10:30:00Z"],
    ["non-ASCII digits", "２０２５-01-15T10:30:00Z"],
  ])("rejects %s", (_, value) => {
    expect(isDateTime(value)).toBe(false);
  });
});
