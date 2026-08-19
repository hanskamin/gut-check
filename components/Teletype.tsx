"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface Props {
  lines: string[];
  /** true once the investigation has ended (hides the working cursor) */
  finished: boolean;
}

/** CRT terminal that types out investigation log lines. */
export default function Teletype({ lines, finished }: Props) {
  const reduceMotion = useReducedMotion();
  const [pos, setPos] = useState({ line: 0, char: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setPos((p) => {
        if (p.line >= lines.length) return p;
        const current = lines[p.line];
        if (p.char < current.length) return { line: p.line, char: p.char + 2 };
        return { line: p.line + 1, char: 0 };
      });
    }, 16);
    return () => clearInterval(id);
  }, [lines, reduceMotion]);

  const doneLines = reduceMotion ? lines : lines.slice(0, pos.line);
  const typingLine =
    !reduceMotion && pos.line < lines.length
      ? lines[pos.line].slice(0, pos.char)
      : null;
  const caughtUp = reduceMotion || pos.line >= lines.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [doneLines.length, typingLine]);

  return (
    <div className="border-2 border-ink bg-crt shadow-block-sm">
      <div className="flex items-center justify-between border-b-2 border-ink bg-ink px-3 py-1.5">
        <span className="font-typewriter text-[11px] tracking-widest text-paper">
          RECALL WIRE — TERMINAL 04
        </span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${finished ? "bg-paper/40" : "bg-phosphor"}`}
          aria-hidden
        />
      </div>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="crt h-56 overflow-y-auto p-4 font-typewriter text-[13px] leading-6 text-phosphor sm:text-sm"
      >
        {doneLines.map((line, i) => (
          <p key={i}>&gt;&nbsp;{line}</p>
        ))}
        {typingLine !== null && (
          <p>
            &gt;&nbsp;{typingLine}
            <span className="crt-cursor">▊</span>
          </p>
        )}
        {typingLine === null && caughtUp && !finished && (
          <p>
            &gt;&nbsp;<span className="crt-cursor">▊</span>
          </p>
        )}
      </div>
    </div>
  );
}
