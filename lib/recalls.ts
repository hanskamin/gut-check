import type { FdaRecord, FsisRecord, Subject } from "./types";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_RECORDS = 12;

function trim(value: unknown, max = 320): string {
  const s = Array.isArray(value)
    ? value.filter((v) => typeof v === "string").join(", ")
    : typeof value === "string"
      ? value
      : "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

interface FsisRaw {
  field_title?: string;
  field_active_notice?: string;
  field_establishment?: string;
  field_product_items?: string;
  field_recall_reason?: string | string[];
  field_recall_date?: string;
  field_risk_level?: string;
  field_states?: string;
  field_recall_url?: string;
  field_summary?: string;
}

/**
 * USDA FSIS recall API. It has no server-side text search, so we pull the
 * feed, keep active notices, and match the subject's terms locally.
 */
export async function searchFsis(subject: Subject): Promise<FsisRecord[]> {
  const res = await fetch("https://www.fsis.usda.gov/fsis/api/recall/v/1", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`FSIS API responded ${res.status}`);
  const all = (await res.json()) as FsisRaw[];

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
      r.field_product_items,
      stripHtml(r.field_summary ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    return terms.some((t) => haystack.includes(t));
  });

  return matched.slice(0, MAX_RECORDS).map((r) => ({
    title: trim(r.field_title, 160),
    establishment: trim(r.field_establishment, 120),
    products: trim(stripHtml(r.field_product_items ?? "")),
    reason: trim(r.field_recall_reason, 160),
    date: trim(r.field_recall_date, 20),
    risk_level: trim(r.field_risk_level, 60),
    states: trim(r.field_states, 200),
    url: trim(r.field_recall_url, 300),
  }));
}
