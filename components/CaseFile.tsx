"use client";

import { motion } from "framer-motion";
import Teletype from "./Teletype";
import VerdictPanel from "./VerdictPanel";
import type { Subject, Verdict } from "@/lib/types";

interface Props {
  caseNo: string;
  photoDataUrl: string;
  logs: string[];
  subject: Subject | null;
  verdict: Verdict | null;
  error: string | null;
  onReset: () => void;
}

export default function CaseFile({
  caseNo,
  photoDataUrl,
  logs,
  subject,
  verdict,
  error,
  onReset,
}: Props) {
  const finished = verdict !== null || error !== null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="border-2 border-ink bg-manila shadow-block"
      >
        {/* Folder tab */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 border-b-2 border-ink bg-manila-deep px-4 py-2">
          <p className="font-typewriter text-xs font-bold tracking-widest">
            CASE FILE {caseNo}
          </p>
          <p className="hidden font-typewriter text-[11px] tracking-widest text-ink-soft min-[420px]:block">
            RECALL DETERMINATION
          </p>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          {/* Evidence photo, paper-clipped in */}
          <div className="flex flex-wrap items-start gap-5">
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: -2 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="relative shrink-0 border-2 border-ink bg-paper p-2 pb-6 shadow-block-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoDataUrl}
                alt="Submitted item"
                className="h-40 w-40 border border-ink/30 object-cover sm:h-48 sm:w-48"
              />
              <p className="absolute bottom-1 left-2 font-typewriter text-[10px] tracking-widest text-ink-soft">
                EXHIBIT A
              </p>
            </motion.div>
            <div className="min-w-48 flex-1">
              <p className="font-typewriter text-[11px] tracking-widest text-ink-soft">
                SUBJECT OF INVESTIGATION
              </p>
              {subject ? (
                <>
                  <p className="mt-1 font-display text-2xl font-semibold uppercase leading-tight">
                    {[subject.brand, subject.product_name].filter(Boolean).join(" — ")}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{subject.description}</p>
                  <p className="mt-2 font-typewriter text-[11px] tracking-widest text-ink-soft">
                    CATEGORY: {subject.category.toUpperCase()} · JURISDICTION:{" "}
                    {subject.regulator} · CONFIDENCE: {subject.confidence}
                  </p>
                </>
              ) : (
                <p className="mt-1 font-display text-2xl font-semibold uppercase text-ink-soft">
                  Pending identification…
                </p>
              )}
            </div>
          </div>

          <Teletype lines={logs} finished={finished} />

          {error && (
            <div className="border-2 border-poster bg-paper p-4 shadow-block-sm">
              <p className="font-display text-lg font-bold uppercase tracking-wide text-poster">
                Investigation halted
              </p>
              <p className="mt-1 text-sm leading-6">{error}</p>
            </div>
          )}

          {verdict && (
            <VerdictPanel
              verdict={verdict}
              subject={subject}
              photoDataUrl={photoDataUrl}
              caseNo={caseNo}
            />
          )}

          {finished && (
            <button
              onClick={onReset}
              className="border-2 border-ink bg-paper px-4 py-2 font-display text-base font-semibold uppercase tracking-widest shadow-block-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-federal"
            >
              ← Open a new case
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
