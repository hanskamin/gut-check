import { request as httpsRequest } from "node:https";
import { createGunzip } from "node:zlib";
import type { FdaPressRecord, FdaRecord, FsisRaw, FsisRecord, Subject } from "./types";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_RECORDS = 12;

/** FSIS returns some fields as arrays of strings and others as plain strings. */
function toText(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(", ");
  return typeof value === "string" ? value : "";
}

function trim(value: unknown, max = 320): string {
  const s = toText(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function stripHtml(value: unknown): string {
  return toText(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * openFDA food enforcement reports. Only records with status "Ongoing"
 * count as active recalls. openFDA returns HTTP 404 when nothing matches.
 */
export async function searchFda(subject: Subject): Promise<FdaRecord[]> {
  const phrases = [...subject.search_terms];
  if (subject.brand) phrases.push(subject.brand);
  const unique = [...new Set(phrases.map((p) => p.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return [];

  const fields = ["product_description", "recalling_firm", "reason_for_recall"];
  const clauses = unique.flatMap((term) =>
    fields.map((f) => `${f}:"${term.replace(/["+]/g, "")}"`),
  );
  const search = `status:"Ongoing"+AND+(${clauses.join("+OR+")})`;
  const url = `https://api.fda.gov/food/enforcement.json?search=${search.replace(/ /g, "+")}&limit=${MAX_RECORDS * 2}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`openFDA responded ${res.status}`);

  const data = (await res.json()) as { results?: Record<string, unknown>[] };
  return (data.results ?? []).slice(0, MAX_RECORDS).map((r) => ({
    recall_number: trim(r.recall_number, 40),
    classification: trim(r.classification, 40),
    recalling_firm: trim(r.recalling_firm, 120),
    product_description: trim(r.product_description),
    reason_for_recall: trim(r.reason_for_recall),
    recall_initiation_date: trim(r.recall_initiation_date, 20),
    distribution_pattern: trim(r.distribution_pattern, 160),
    code_info: trim(r.code_info, 200),
  }));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const FDA_PRESS_URL = "https://www.fda.gov/datatables/views/ajax";
const FDA_PRESS_ROWS_PER_TERM = 10;
const FDA_PRESS_MAX_TERMS = 5;

/**
 * One row of the recall datatable on
 * fda.gov/safety/recalls-market-withdrawals-safety-alerts: an array of eight
 * HTML strings — date, brand link, product description, product-type terms,
 * reason, company, status ("Terminated" or empty), and a search excerpt.
 */
type FdaPressRow = string[];

async function fetchFdaPressRows(term: string): Promise<FdaPressRow[]> {
  const params = new URLSearchParams({
    search_api_fulltext: term,
    length: String(FDA_PRESS_ROWS_PER_TERM),
    start: "0",
    draw: "1",
    view_name: "recall_solr_index",
    view_display_id: "recall_datatable_block_1",
    _wrapper_format: "drupal_ajax",
  });
  const res = await fetch(`${FDA_PRESS_URL}?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
    },
  });
  if (!res.ok) throw new Error(`FDA press feed responded ${res.status}`);
  const data = (await res.json()) as { data?: FdaPressRow[] };
  return data.data ?? [];
}

function parseFdaPressRow(row: FdaPressRow): FdaPressRecord {
  const [date, brandLink, description, productType, reason, company] = row;
  const path = /href="([^"]+)"/.exec(brandLink ?? "")?.[1] ?? "";
  return {
    posted_date: trim(decodeEntities(stripHtml(date)), 20),
    brand: trim(decodeEntities(stripHtml(brandLink)), 120),
    company: trim(decodeEntities(stripHtml(company)), 120),
    product_description: trim(decodeEntities(stripHtml(description))),
    reason: trim(decodeEntities(stripHtml(reason)), 200),
    product_type: trim(decodeEntities(stripHtml(productType)), 80),
    url: path ? `https://www.fda.gov${decodeEntities(path)}` : "",
  };
}

/**
 * The FDA recall press-release feed (the datatable on fda.gov). Announcements
 * appear here the day a recall is published — weeks before the openFDA
 * enforcement database, which only carries recalls after classification.
 * The endpoint's full-text search ANDs the words in one query, so each
 * phrase is searched separately and the results are merged.
 */
export async function searchFdaPress(subject: Subject): Promise<FdaPressRecord[]> {
  const phrases = [...subject.search_terms, subject.brand ?? "", subject.category];
  const unique = [...new Set(phrases.map((p) => p.trim().toLowerCase()).filter(Boolean))].slice(
    0,
    FDA_PRESS_MAX_TERMS,
  );
  if (unique.length === 0) return [];

  const settled = await Promise.allSettled(unique.map(fetchFdaPressRows));
  const fulfilled = settled.filter(
    (s): s is PromiseFulfilledResult<FdaPressRow[]> => s.status === "fulfilled",
  );
  if (fulfilled.length === 0) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }

  const seen = new Set<string>();
  const records: FdaPressRecord[] = [];
  for (const row of fulfilled.flatMap((s) => s.value)) {
    const terminated = (row[6] ?? "").includes("Terminated");
    const record = parseFdaPressRow(row);
    const key = record.url || `${record.posted_date} ${record.brand}`;
    if (terminated || seen.has(key)) continue;
    seen.add(key);
    records.push(record);
  }
  return records
    .sort((a, b) => Date.parse(b.posted_date) - Date.parse(a.posted_date))
    .slice(0, MAX_RECORDS);
}

const FSIS_URL = "https://www.fsis.usda.gov/fsis/api/recall/v/1";

const FSIS_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "Accept-Encoding": "gzip",
  Referer: "https://www.fsis.usda.gov/recalls",
};

/**
 * FSIS sits behind Akamai, which answers 403 to clients that do not look like
 * a browser — both the headers and the TLS client are checked, and datacenter
 * egress IPs can be rejected no matter what the client sends. Bun's global
 * fetch is rejected outright, so the request goes through node:https, which
 * passes under both Bun (dev) and Node (production) when the IP is allowed.
 * The primary path is the feed relayed from the shopper's browser (see
 * lib/fsis-client.ts); this server-side fetch is the fallback.
 */
function requestFsisFeed(): Promise<FsisRaw[]> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(FSIS_URL, { headers: FSIS_HEADERS }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`FSIS API responded ${res.statusCode}`));
        return;
      }
      const body =
        res.headers["content-encoding"] === "gzip" ? res.pipe(createGunzip()) : res;
      const chunks: Buffer[] = [];
      body.on("data", (c: Buffer) => chunks.push(c));
      body.on("error", reject);
      body.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as FsisRaw[]);
        } catch {
          reject(new Error("FSIS API returned unreadable JSON"));
        }
      });
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("FSIS API timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** Akamai rejects the odd request even from a browser-shaped client, so retry once. */
async function fetchFsisFeed(): Promise<FsisRaw[]> {
  try {
    return await requestFsisFeed();
  } catch {
    return requestFsisFeed();
  }
}

/**
 * USDA FSIS recall API. It has no server-side text search, so we pull the
 * feed, keep active notices, and match the subject's terms locally.
 * `feed` is the copy relayed from the shopper's browser; when absent, the
 * feed is fetched server-side.
 */
export async function searchFsis(
  subject: Subject,
  feed?: FsisRaw[] | null,
): Promise<FsisRecord[]> {
  const all = feed ?? (await fetchFsisFeed());

  const terms = [...new Set(
    [...subject.search_terms, subject.brand ?? "", subject.category]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 2),
  )];

  const active = all.filter((r) => r.field_active_notice === "True");
  const matched = active.filter((r) => {
    const haystack = [
      r.field_title,
      r.field_establishment,
      stripHtml(r.field_product_items),
      stripHtml(r.field_summary),
    ]
      .join(" ")
      .toLowerCase();
    return terms.some((t) => haystack.includes(t));
  });

  return matched.slice(0, MAX_RECORDS).map((r) => ({
    title: trim(r.field_title, 160),
    establishment: trim(r.field_establishment, 120),
    products: trim(stripHtml(r.field_product_items)),
    reason: trim(r.field_recall_reason, 160),
    date: trim(r.field_recall_date, 20),
    risk_level: trim(r.field_risk_level, 60),
    states: trim(r.field_states, 200),
    url: trim(r.field_recall_url, 300),
  }));
}
