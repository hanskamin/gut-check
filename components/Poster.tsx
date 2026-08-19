"use client";

import { useRef } from "react";
import { motion } from "framer-motion";

interface Props {
  onPhoto: (file: File) => void;
}

const TAPE_TEXT =
  "OFFICIAL USE ★ PUBLIC ADVISORY NO. 86-014 ★ BUREAU OF CONSUMABLE GOODS INTEGRITY ★ ACTIVE RECALL REGISTER ★ ";

const STEPS = [
  {
    n: "1",
    title: "Photograph the item",
    body: "Frame the front label. Brand and product name must be readable.",
  },
  {
    n: "2",
    title: "The Bureau investigates",
    body: "Your photo is identified, then checked against every active FDA and USDA recall notice.",
  },
  {
    n: "3",
    title: "Receive your verdict",
    body: "A stamped determination, the findings, and links to the official notices.",
  },
];

const rise = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Poster({ onPhoto }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) onPhoto(file);
      }}
    >
      {/* Classification tape */}
      <div className="overflow-hidden border-b-2 border-ink bg-poster text-paper">
        <div className="tape-track py-1 font-typewriter text-[11px] tracking-[0.2em]">
          <span className="whitespace-pre">{TAPE_TEXT.repeat(4)}</span>
          <span className="whitespace-pre" aria-hidden>
            {TAPE_TEXT.repeat(4)}
          </span>
        </div>
      </div>

      {/* Masthead */}
      <header className="flex items-center justify-between border-b-2 border-ink px-4 py-3 sm:px-8">
        <p className="font-display text-2xl font-bold uppercase tracking-tight">
          Gut Check
        </p>
        <p className="hidden font-typewriter text-[11px] tracking-widest text-ink-soft sm:block">
          FORM GC-1984 · REV. 3
        </p>
      </header>

      {/* Poster hero */}
      <section className="halftone border-b-2 border-ink">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:py-20">
          <motion.p
            variants={rise}
            initial="hidden"
            animate="show"
            custom={0}
            className="font-typewriter text-xs tracking-[0.3em] text-ink-soft"
          >
            A PUBLIC SERVICE ANNOUNCEMENT · EST. 1984
          </motion.p>
          <motion.h1
            variants={rise}
            initial="hidden"
            animate="show"
            custom={1}
            data-text="SAY NO TO SALMONELLA"
            className="overprint mx-auto mt-4 max-w-3xl font-display text-6xl font-bold uppercase leading-[0.95] tracking-tight sm:text-8xl"
          >
            Say No To Salmonella
          </motion.h1>
          <motion.p
            variants={rise}
            initial="hidden"
            animate="show"
            custom={2}
            className="mx-auto mt-6 max-w-xl text-base leading-7 text-ink-soft sm:text-lg"
          >
            Photograph any food or grocery item. The Bureau cross-checks all
            active FDA and USDA recall notices and stamps your verdict in
            seconds.
          </motion.p>
          <motion.div variants={rise} initial="hidden" animate="show" custom={3}>
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-10 border-2 border-ink bg-poster px-5 py-3.5 font-display text-lg font-bold uppercase tracking-widest text-paper shadow-block transition-transform hover:-translate-y-1 hover:shadow-[8px_8px_0_0_var(--color-ink)] focus-visible:outline-4 focus-visible:outline-federal sm:px-8 sm:py-4 sm:text-xl"
            >
              Submit item for inspection
            </button>
            <p className="mt-4 font-typewriter text-[11px] tracking-widest text-ink-soft">
              TAKE A PHOTO, UPLOAD A FILE, OR DROP ONE HERE.
              <br />
              PHOTOGRAPHS ARE PROCESSED, NOT RETAINED.
            </p>
          </motion.div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Photograph or upload a food item"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPhoto(file);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {/* Compliance steps */}
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide">
          How to comply
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.45 }}
              className="border-2 border-ink bg-paper p-4 shadow-block-sm"
            >
              <p className="font-display text-4xl font-bold text-poster">{s.n}.</p>
              <p className="mt-2 font-display text-lg font-semibold uppercase tracking-wide">
                {s.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-soft">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t-2 border-ink bg-manila px-4 py-6 sm:px-8">
        <p className="mx-auto max-w-4xl font-typewriter text-[11px] leading-5 text-ink-soft">
          NOTICE: GUT CHECK IS NOT A GOVERNMENT AGENCY. VERDICTS ARE AI-ASSISTED
          READINGS OF PUBLIC FDA (OPENFDA) AND USDA (FSIS) RECALL DATA AND CAN BE
          WRONG OR INCOMPLETE. RECALLS ARE OFTEN LIMITED TO SPECIFIC LOTS AND
          DATES. ALWAYS VERIFY AT FDA.GOV/SAFETY/RECALLS AND
          FSIS.USDA.GOV/RECALLS.
        </p>
      </footer>
    </div>
  );
}
