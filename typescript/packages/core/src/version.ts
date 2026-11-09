/** Format version written by this package, as defined by the specification. */
export const SCHEMA_VERSION = "1.1" as const;

/** Major format version this package reads; any minor version is accepted. */
export const SUPPORTED_SCHEMA_MAJOR = 1 as const;

/** `"<major>.<minor>"`: ASCII digits, no leading zero except `0` itself. */
const WELL_FORMED = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SUPPORTED = new RegExp(`^${SUPPORTED_SCHEMA_MAJOR}\\.(0|[1-9]\\d*)$`);

/** Whether `value` is a well-formed version string of any major. */
export function isWellFormedSchemaVersion(value: string): boolean {
  return WELL_FORMED.test(value);
}

/**
 * Whether `value` is a `schemaVersion` this package reads: a string
 * `"1.<minor>"` where the minor version is ASCII digits without a leading
 * zero (`"0"` itself is allowed).
 *
 * Minor versions are forward compatible within a major version, so `"1.42"`
 * is accepted; another major (`"2.0"`) or a malformed value (`"1"`, `"v1.1"`,
 * `"01.1"`, `"1.01"`) is not.
 */
export function isSupportedSchemaVersion(value: unknown): boolean {
  return typeof value === "string" && SUPPORTED.test(value);
}
