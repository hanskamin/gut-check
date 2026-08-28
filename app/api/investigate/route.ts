import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { sanitizeFsisFeed } from "@/lib/fsis-client";
import { searchFda, searchFdaPress, searchFsis } from "@/lib/recalls";
import {
  SubjectSchema,
  VerdictSchema,
  type Subject,
  type Verdict,
  type WireEvent,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5";
const client = new Anthropic();

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const);
type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * One structured call: Opus 5 with server-side refusal fallback to Opus 4.8.
 * The response text is validated against the given Zod schema.
 */
async function callClaude<S extends z.ZodTypeAny>(
  schema: S,
  system: string,
  content: Anthropic.Beta.BetaContentBlockParam[],
): Promise<z.infer<S>> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    system,
    output_config: { format: zodOutputFormat(schema) },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The analysis was declined by the model's safety system.");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("The model returned no analysis.");
  return schema.parse(JSON.parse(text));
}

async function identifySubject(image: string, mediaType: MediaType): Promise<Subject> {
  return callClaude(
    SubjectSchema,
    "You identify food and grocery items from photographs for a product-recall lookup service. Be precise about brand and product names. Read all visible label text. If the item is not a food, beverage, or grocery product, set is_consumable to false.",
    [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: image },
      },
      {
        type: "text",
        text: "Identify this item for a recall database search.",
      },
    ],
  );
}

async function adjudicate(
  subject: Subject,
  fda: unknown[],
  fdaPress: unknown[],
  fsis: unknown[],
  sourceErrors: string[],
): Promise<Verdict> {
  return callClaude(
    VerdictSchema,
    `You are a food-recall adjudicator. You receive an identified grocery item plus candidate records pulled from three sources: the FDA enforcement database (status "Ongoing" only; it lags announcements by weeks because recalls enter it only after classification), the FDA recall press-release feed (announcements published the day a recall goes public — this is the freshest FDA source; treat these as active recalls), and the USDA FSIS recall feed (active notices only). Decide whether an ACTIVE recall plausibly covers this specific item.

Rules:
- RECALLED requires the brand or firm AND the product type to match a record.
- POSSIBLE_MATCH when the product type matches but the brand, lot, or date cannot be confirmed from a photo.
- CLEAR when no record plausibly covers the item. Zero candidate records for a well-identified item means CLEAR.
- INCONCLUSIVE when identification confidence is LOW, or when a data source failed and the other found nothing.
- Recalls are lot- and date-specific. Never claim certainty a photo cannot provide; say what the shopper should check (lot code, best-by date) in guidance.
- Write reasoning and guidance in plain language for a shopper, not a regulator.
- Never mention data_source_errors, feeds, APIs, or database problems in reasoning or guidance. Those are internal plumbing. Use them only to pick INCONCLUSIVE when a failed source could have changed the answer.`,
    [
      {
        type: "text",
        text: JSON.stringify({
          identified_item: subject,
          fda_candidate_records: fda,
          fda_press_announcements: fdaPress,
          usda_fsis_candidate_records: fsis,
          data_source_errors: sourceErrors,
        }),
      },
    ],
  );
}

/** Surfaces why a source failed on the wire log instead of a bare "NO RESPONSE". */
function reasonOf(result: PromiseRejectedResult): string {
  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return (message || "unknown error").toUpperCase();
}

export async function POST(req: Request) {
  let body: { image?: string; mediaType?: string; fsisFeed?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { image, mediaType } = body;
  // The browser relays the FSIS feed because Akamai blocks this host's
  // egress; the copy is untrusted input, so it is re-sanitized here. It only
  // shapes the sender's own verdict. Absent or malformed → server-side fetch.
  const fsisFeed = body.fsisFeed === undefined ? null : sanitizeFsisFeed(body.fsisFeed);
  if (!image || !mediaType || !ALLOWED_MEDIA.has(mediaType as MediaType)) {
    return Response.json({ error: "A photo is required." }, { status: 400 });
  }
  if (image.length > 8_000_000) {
    return Response.json({ error: "The photo is too large." }, { status: 413 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: WireEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        send({ type: "phase", phase: "identify" });
        send({ type: "log", line: "CASE OPENED. EVIDENCE RECEIVED." });
        send({ type: "log", line: "ANALYZING PHOTOGRAPH…" });

        const subject = await identifySubject(image, mediaType as MediaType);
        send({ type: "subject", subject });

        if (!subject.is_consumable) {
          send({ type: "log", line: "SUBJECT IS NOT A CONSUMABLE GOOD." });
          send({
            type: "verdict",
            verdict: {
              status: "INCONCLUSIVE",
              headline: "NOT A CONSUMABLE GOOD",
              reasoning: `This does not appear to be a food or grocery item (${subject.description}). Food recall databases do not apply to it.`,
              guidance: "Submit a photo of a food, beverage, or grocery product.",
              matches: [],
            },
          });
          controller.close();
          return;
        }

        const label = [subject.brand, subject.product_name]
          .filter(Boolean)
          .join(" — ")
          .toUpperCase();
        send({ type: "log", line: `SUBJECT IDENTIFIED: ${label}` });
        send({ type: "log", line: `CATEGORY: ${subject.category.toUpperCase()}` });
        send({ type: "log", line: `IDENTIFICATION CONFIDENCE: ${subject.confidence}` });

        send({ type: "phase", phase: "search" });
        send({ type: "log", line: "QUERYING FDA ENFORCEMENT DATABASE…" });
        send({ type: "log", line: "QUERYING FDA RECALL ANNOUNCEMENTS…" });
        send({ type: "log", line: "QUERYING USDA/FSIS RECALL FILE…" });

        const sourceErrors: string[] = [];
        const [fdaResult, fdaPressResult, fsisResult] = await Promise.allSettled([
          searchFda(subject),
          searchFdaPress(subject),
          searchFsis(subject, fsisFeed),
        ]);
        const fda = fdaResult.status === "fulfilled" ? fdaResult.value : [];
        const fdaPress = fdaPressResult.status === "fulfilled" ? fdaPressResult.value : [];
        const fsis = fsisResult.status === "fulfilled" ? fsisResult.value : [];
        if (fdaResult.status === "rejected") {
          sourceErrors.push("FDA enforcement database was unreachable.");
          send({ type: "log", line: `FDA DATABASE: NO RESPONSE — ${reasonOf(fdaResult)}` });
        } else {
          send({ type: "log", line: `FDA DATABASE: ${fda.length} CANDIDATE RECORD(S).` });
        }
        if (fdaPressResult.status === "rejected") {
          sourceErrors.push("FDA recall announcements feed was unreachable.");
          send({
            type: "log",
            line: `FDA ANNOUNCEMENTS: NO RESPONSE — ${reasonOf(fdaPressResult)}`,
          });
        } else {
          send({
            type: "log",
            line: `FDA ANNOUNCEMENTS: ${fdaPress.length} CANDIDATE RECORD(S).`,
          });
        }
        if (fsisResult.status === "rejected") {
          sourceErrors.push("USDA FSIS recall feed was unreachable.");
          send({ type: "log", line: `USDA/FSIS FILE: NO RESPONSE — ${reasonOf(fsisResult)}` });
        } else {
          send({ type: "log", line: `USDA/FSIS FILE: ${fsis.length} CANDIDATE RECORD(S).` });
        }

        send({ type: "phase", phase: "adjudicate" });
        send({ type: "log", line: "ADJUDICATING FINDINGS…" });

        const verdict = await adjudicate(subject, fda, fdaPress, fsis, sourceErrors);
        send({ type: "log", line: "DETERMINATION REACHED." });
        send({ type: "verdict", verdict });
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        const message =
          err instanceof Anthropic.AuthenticationError ||
          raw.includes("authentication method")
            ? "Gut Check has no credentials. Set ANTHROPIC_API_KEY in .env.local and restart the server."
            : raw || "The investigation failed for an unknown reason.";
        send({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
