import { z } from "zod";

/** What Claude vision extracts from the submitted photograph. */
export const SubjectSchema = z.object({
  is_consumable: z
    .boolean()
    .describe("True if the photo shows a food, beverage, or grocery item"),
  brand: z
    .string()
    .nullable()
    .describe("Brand name if visible or confidently inferable, else null"),
  product_name: z
    .string()
    .describe("Short product name, e.g. 'Creamy Peanut Butter'"),
  category: z
    .string()
    .describe("Product category, e.g. 'peanut butter', 'ground beef', 'infant formula'"),
  search_terms: z
    .array(z.string())
    .describe(
      "3-6 distinctive lowercase terms for searching recall databases: brand words, product type words. No generic words like 'food' or 'grocery'.",
    ),
  regulator: z
    .enum(["FDA", "USDA", "BOTH"])
    .describe(
      "USDA/FSIS regulates meat, poultry, and egg products; FDA regulates everything else. BOTH if mixed or unclear.",
    ),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  description: z
    .string()
    .describe("One factual sentence describing what is visible in the photo"),
});
export type Subject = z.infer<typeof SubjectSchema>;

export const RecallMatchSchema = z.object({
  source: z.enum(["FDA", "USDA"]),
  title: z.string().describe("Short recall title: firm + product"),
  reason: z.string().describe("Why the product was recalled, one sentence"),
  date: z.string().describe("Recall date as printed in the record"),
  match_strength: z.enum(["EXACT", "LIKELY", "POSSIBLE"]),
  url: z.string().nullable().describe("Recall notice URL if present in the record"),
});
export type RecallMatch = z.infer<typeof RecallMatchSchema>;

export const VerdictSchema = z.object({
  status: z
    .enum(["CLEAR", "RECALLED", "POSSIBLE_MATCH", "INCONCLUSIVE"])
    .describe(
      "RECALLED only for an exact brand+product match in an active recall. POSSIBLE_MATCH when the category matches but brand/lot is uncertain. CLEAR when no active recall plausibly covers this item. INCONCLUSIVE when the item could not be identified well enough to judge.",
    ),
  headline: z
    .string()
    .describe("Stamped sub-line, max 8 words, uppercase, e.g. 'NO ACTIVE RECALL ON FILE'"),
  reasoning: z
    .string()
    .describe("2-4 plain sentences explaining the verdict for a shopper"),
  guidance: z
    .string()
    .describe("1-2 sentences: what the shopper should do next"),
  matches: z.array(RecallMatchSchema),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/** Trimmed recall records handed to the adjudicator. */
export interface FdaRecord {
  recall_number: string;
  classification: string;
  recalling_firm: string;
  product_description: string;
  reason_for_recall: string;
  recall_initiation_date: string;
  distribution_pattern: string;
  code_info: string;
}

export interface FsisRecord {
  title: string;
  establishment: string;
  products: string;
  reason: string;
  date: string;
  risk_level: string;
  states: string;
  url: string;
}

/** Server-sent events streamed to the browser during an investigation. */
export type WireEvent =
  | { type: "log"; line: string }
  | { type: "phase"; phase: "identify" | "search" | "adjudicate" }
  | { type: "subject"; subject: Subject }
  | { type: "verdict"; verdict: Verdict }
  | { type: "error"; message: string };
