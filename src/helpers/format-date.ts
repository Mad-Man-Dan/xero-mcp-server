/**
 * Format a Xero date value for display as a date-only string (YYYY-MM-DD) in UTC.
 *
 * Xero stores transaction dates as a calendar date at midnight UTC. The
 * xero-node SDK deserializes these into JS Date objects, whose default
 * `.toString()` renders in the server's local timezone — making e.g.
 * 2026-06-09 look like "Mon Jun 08 2026 20:00 GMT-0400". Normalising to UTC
 * date-only here avoids that off-by-one confusion in tool output.
 */
export function formatXeroDate(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    // Already a bare date — return as-is.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toISOString().split("T")[0];
  }
  return String(value);
}
