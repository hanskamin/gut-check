"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { toBlob } from "html-to-image";
import type { Subject, Verdict } from "@/lib/types";

const STATUS: Record<
  Verdict["status"],
  { stamp: string; color: string }
> = {
  CLEAR: { stamp: "CLEARED", color: "text-approve" },
  RECALLED: { stamp: "RECALLED", color: "text-poster" },
  POSSIBLE_MATCH: { stamp: "CAUTION", color: "text-caution" },
  INCONCLUSIVE: { stamp: "UNRESOLVED", color: "text-ink-soft" },
};

interface Props {
  verdict: Verdict;
  subject: Subject | null;
  photoDataUrl: string | null;
  caseNo: string;
}

export default function VerdictPanel({ verdict, subject, photoDataUrl, caseNo }: Props) {
  const { stamp, color } = STATUS[verdict.status];
  const releaseRef = useRef<HTMLDivElement>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const subjectLine = subject
    ? [subject.brand, subject.product_name].filter(Boolean).join(" — ")
    : "UNIDENTIFIED ITEM";

  function saveViaLink(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    // The anchor must be in the document for the click to count as a download.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function downloadRelease() {
    if (!releaseRef.current || issuing) return;
    setIssuing(true);
    setIssueError(null);
    try {
      // A Blob URL, not a data URL: iOS Safari silently drops multi-megabyte
      // data: downloads after showing its view/download sheet.
      const blob = await toBlob(releaseRef.current, { pixelRatio: 2 });
      if (!blob) throw new Error("empty render");

      const slug = caseNo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const filename = `gut-check-${slug || "case"}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      // On iOS the share sheet is the only route that actually saves the file.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
          // Share was blocked (lost user gesture, unsupported target) — fall through.
        }
      }

      saveViaLink(blob, filename);
    } catch {
      setIssueError("The press jammed — the release could not be printed.");
    } finally {
      setIssuing(false);
    }
  }

  return (
    <section aria-label="Verdict">
      {/* The stamp slams down over the case file */}
      <div className="relative flex justify-center py-6">
        <motion.div
          initial={{ scale: 3.2, opacity: 0, rotate: 4 }}
          animate={{ scale: 1, opacity: 1, rotate: -6 }}
          transition={{ type: "spring", stiffness: 380, damping: 22, mass: 0.9 }}
          className={`stamp text-4xl min-[420px]:text-5xl sm:text-7xl ${color}`}
        >
          {stamp}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="space-y-4"
      >
        <p className="text-center font-display text-xl font-semibold uppercase tracking-wide">
          {verdict.headline}
        </p>
        <div className="border-2 border-ink bg-paper p-4 shadow-block-sm">
          <p className="font-typewriter text-[11px] tracking-widest text-ink-soft">
            FINDINGS
          </p>
          <p className="mt-2 text-sm leading-6">{verdict.reasoning}</p>
          <p className="mt-3 border-l-4 border-federal pl-3 text-sm font-semibold leading-6">
            {verdict.guidance}
          </p>
        </div>

        {verdict.matches.length > 0 && (
          <div className="border-2 border-ink bg-paper shadow-block-sm">
            <p className="border-b-2 border-ink bg-poster px-4 py-1.5 font-display text-sm font-semibold uppercase tracking-widest text-paper">
              Recall notices on file — {verdict.matches.length}
            </p>
            <ul>
              {verdict.matches.map((m, i) => (
                <li key={i} className="border-b border-ink/20 px-4 py-3 last:border-b-0">
                  <p className="font-typewriter text-[11px] tracking-widest text-ink-soft">
                    {m.source} · {m.date} · MATCH: {m.match_strength}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{m.title}</p>
                  <p className="mt-1 text-sm leading-6">{m.reason}</p>
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-typewriter text-xs font-bold text-federal underline underline-offset-4"
                    >
                      READ THE FULL NOTICE →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={downloadRelease}
            disabled={issuing}
            className="border-2 border-ink bg-federal px-4 py-2 font-display text-base font-semibold uppercase tracking-widest text-paper shadow-block-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {issuing ? "Printing…" : "Issue press release (PNG)"}
          </button>
          <p className="font-typewriter text-[11px] text-ink-soft">
            Verify at fda.gov and fsis.usda.gov before you act.
          </p>
          {issueError && (
            <p role="alert" className="w-full font-typewriter text-[11px] text-poster">
              {issueError}
            </p>
          )}
        </div>
      </motion.div>

      {/* Off-screen press-release card captured for the PNG download */}
      <div className="pointer-events-none fixed -left-[2000px] top-0" aria-hidden>
        <div
          ref={releaseRef}
          className="w-[720px] border-4 border-ink bg-paper p-10 font-body text-ink"
        >
          <p className="font-typewriter text-xs tracking-widest">
            FOR IMMEDIATE RELEASE · {caseNo}
          </p>
          <p className="mt-1 font-display text-4xl font-bold uppercase tracking-tight">
            Gut Check
          </p>
          <p className="font-typewriter text-xs tracking-widest text-ink-soft">
            CONSUMABLE GOODS INTEGRITY — RECALL DETERMINATION
          </p>
          <div className="mt-6 flex gap-6">
            {photoDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoDataUrl}
                alt=""
                className="h-40 w-40 rotate-[-2deg] border-2 border-ink object-cover"
              />
            )}
            <div className="flex-1">
              <p className="font-typewriter text-[11px] tracking-widest text-ink-soft">
                SUBJECT
              </p>
              <p className="font-display text-2xl font-semibold uppercase leading-tight">
                {subjectLine}
              </p>
              <div className={`stamp mt-4 inline-block text-4xl ${color}`}>{stamp}</div>
              <p className="mt-2 font-display text-base font-semibold uppercase tracking-wide">
                {verdict.headline}
              </p>
            </div>
          </div>
          <p className="mt-6 text-sm leading-6">{verdict.reasoning}</p>
          <p className="mt-4 border-t-2 border-ink pt-3 font-typewriter text-[10px] leading-4 text-ink-soft">
            AI-assisted reading of public FDA (openFDA) and USDA (FSIS) recall data.
            Not a government determination. Verify at fda.gov · fsis.usda.gov
          </p>
        </div>
      </div>
    </section>
  );
}
