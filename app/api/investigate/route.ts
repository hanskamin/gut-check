import OpenAI, { AuthenticationError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { searchFda, searchFsis } from "@/lib/recalls";
import {
  SubjectSchema,
  VerdictSchema,
  type Subject,
  type Verdict,
  type WireEvent,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "gpt-5.6-terra";
const client = new OpenAI();

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const);
type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/**
 * One structured call: GPT-5.6 Terra at medium reasoning effort.
 * The response is validated against the given Zod schema.
 */
async function callModel<S extends z.ZodTypeAny>(
  schema: S,
  instructions: string,
  content: OpenAI.Responses.ResponseInputContent[],
): Promise<z.infer<S>> {
  const response = await client.responses.parse({
    model: MODEL,
    max_output_tokens: 16000,
    reasoning: { effort: "medium" },
    instructions,
    text: { format: zodTextFormat(schema, "analysis") },
    input: [{ role: "user", content }],
  });

  const refused = response.output.some(
    (item) =>
      item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
  if (refused) {
    throw new Error("The analysis was declined by the model's safety system.");
  }
  if (response.output_parsed == null) {
    throw new Error("The model returned no analysis.");
  }
  return schema.parse(response.output_parsed);
}

async function identifySubject(image: string, mediaType: MediaType): Promise<Subject> {
  return callModel(
    SubjectSchema,
    "You identify food and grocery items from photographs for a product-recall lookup service. Be precise about brand and product names. Read all visible label text. If the item is not a food, beverage, or grocery product, set is_consumable to false.",
    [
      {
        type: "input_image",
        detail: "auto",
        image_url: `data:${mediaType};base64,${image}`,
      },
      {
        type: "input_text",
        text: "Identify this item for a recall database search.",
      },
    ],
  );
}

async function adjudicate(
  subject: Subject,
  fda: unknown[],
  fsis: unknown[],
  sourceErrors: string[],
): Promise<Verdict> {
  return callModel(
    VerdictSchema,
    `You are a food-recall adjudicator. You receive an identified grocery item plus candidate records pulled from the FDA enforcement database (status "Ongoing" only) and the USDA FSIS recall feed (active notices only). Decide whether an ACTIVE recall plausibly covers this specific item.

Rules:
- RECALLED requires the brand or firm AND the product type to match a record.
- POSSIBLE_MATCH when the product type matches but the brand, lot, or date cannot be confirmed from a photo.
- CLEAR when no record plausibly covers the item. Zero candidate records for a well-identified item means CLEAR.
- INCONCLUSIVE when identification confidence is LOW, or when a data source failed and the other found nothing.
- Recalls are lot- and date-specific. Never claim certainty a photo cannot provide; say what the shopper should check (lot code, best-by date) in guidance.
- Write reasoning and guidance in plain language for a shopper, not a regulator.`,
    [
      {
        type: "input_text",
        text: JSON.stringify({
          identified_item: subject,
          fda_candidate_records: fda,
          usda_fsis_candidate_records: fsis,
          data_source_errors: sourceErrors,
        }),
      },
    ],
  );
}

export async function POST(req: Request) {
  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { image, mediaType } = body;
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
        send({ type: "log", line: "QUERYING USDA/FSIS RECALL FILE…" });

        const sourceErrors: string[] = [];
        const [fdaResult, fsisResult] = await Promise.allSettled([
          searchFda(subject),
          searchFsis(subject),
        ]);
        const fda = fdaResult.status === "fulfilled" ? fdaResult.value : [];
        const fsis = fsisResult.status === "fulfilled" ? fsisResult.value : [];
        if (fdaResult.status === "rejected") {
          sourceErrors.push("FDA enforcement database was unreachable.");
          send({ type: "log", line: "FDA DATABASE: NO RESPONSE. NOTED." });
        } else {
          send({ type: "log", line: `FDA DATABASE: ${fda.length} CANDIDATE RECORD(S).` });
        }
        if (fsisResult.status === "rejected") {
          sourceErrors.push("USDA FSIS recall feed was unreachable.");
          send({ type: "log", line: "USDA/FSIS FILE: NO RESPONSE. NOTED." });
        } else {
          send({ type: "log", line: `USDA/FSIS FILE: ${fsis.length} CANDIDATE RECORD(S).` });
        }

        send({ type: "phase", phase: "adjudicate" });
        send({ type: "log", line: "ADJUDICATING FINDINGS…" });

        const verdict = await adjudicate(subject, fda, fsis, sourceErrors);
        send({ type: "log", line: "DETERMINATION REACHED." });
        send({ type: "verdict", verdict });
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        const message =
          err instanceof AuthenticationError || raw.includes("API key")
            ? "Gut Check has no credentials. Set OPENAI_API_KEY in .env.local and restart the server."
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
