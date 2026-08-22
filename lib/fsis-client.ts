import type { FsisRaw } from "./types";

const FSIS_URL = "https://www.fsis.usda.gov/fsis/api/recall/v/1";
const TIMEOUT_MS = 8_000;
const MAX_RECORDS = 400;
const MAX_FIELD_CHARS = 20_000;

const KEEP_FIELDS = [
  "field_title",
  "field_active_notice",
  "field_establishment",
  "field_product_items",
  "field_recall_reason",
  "field_recall_date",
  "field_risk_level",
  "field_states",
  "field_recall_url",
  "field_summary",
] as const;

function slim(record: Record<string, unknown>): FsisRaw {
  const out: Record<string, string | string[]> = {};
  for (const key of KEEP_FIELDS) {
    const value = record[key];
    if (typeof value === "string") out[key] = value.slice(0, MAX_FIELD_CHARS);
    else if (Array.isArray(value))
      out[key] = value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.slice(0, MAX_FIELD_CHARS));
  }
  return out as FsisRaw;
}

/**
 * Reduces an untrusted copy of the FSIS feed to active notices with only the
 * known fields, capped in count and size. Used on the raw feed in the browser
 * and again on the relayed copy by the server. Returns null when the value is
 * not a feed at all; an empty array is a valid "no active recalls" result.
 */
export function sanitizeFsisFeed(value: unknown): FsisRaw[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && (r as FsisRaw).field_active_notice === "True",
    )
    .slice(0, MAX_RECORDS)
    .map(slim);
}

/**
 * Fetches the FSIS recall feed from the shopper's browser. Akamai fronts
 * fsis.usda.gov and rejects most non-browser and datacenter clients, so the
 * server cannot reliably reach the feed from hosting infrastructure — but a
 * real browser always passes, and the API answers `access-control-allow-origin: *`.
 * Returns only active notices, slimmed to the fields the server uses.
 * Resolves to null on any failure so the server can fall back to its own fetch.
 */
export async function fetchFsisFeedInBrowser(): Promise<FsisRaw[] | null> {
  try {
    const res = await fetch(FSIS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return sanitizeFsisFeed(await res.json());
  } catch {
    return null;
  }
}
