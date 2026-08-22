"use client";

import { useCallback, useRef, useState } from "react";
import Poster from "@/components/Poster";
import CaseFile from "@/components/CaseFile";
import { preparePhoto } from "@/lib/client-image";
import type { Subject, Verdict, WireEvent } from "@/lib/types";

type Stage = "poster" | "case";

export default function Home() {
  const [stage, setStage] = useState<Stage>("poster");
  const [caseNo, setCaseNo] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStage("poster");
    setPhotoDataUrl(null);
    setLogs([]);
    setSubject(null);
    setVerdict(null);
    setError(null);
  }, []);

  const investigate = useCallback(async (file: File) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setStage("case");
    setCaseNo(`NO. 86-${String(Math.floor(Math.random() * 9000) + 1000)}`);
    setLogs([]);
    setSubject(null);
    setVerdict(null);
    setError(null);

    try {
      const photo = await preparePhoto(file);
      setPhotoDataUrl(photo.dataUrl);

      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo.base64, mediaType: photo.mediaType }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Gut Check responded ${res.status}.`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as WireEvent;
          switch (event.type) {
            case "log":
              setLogs((prev) => [...prev, event.line]);
              break;
            case "subject":
              setSubject(event.subject);
              break;
            case "verdict":
              setVerdict(event.verdict);
              break;
            case "error":
              setError(event.message);
              break;
            case "phase":
              break;
          }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : "The investigation failed.");
    }
  }, []);

  return (
    <main className="flex-1">
      {stage === "poster" ? (
        <Poster onPhoto={investigate} />
      ) : (
        <CaseFile
          caseNo={caseNo}
          photoDataUrl={photoDataUrl ?? ""}
          logs={logs}
          subject={subject}
          verdict={verdict}
          error={error}
          onReset={reset}
        />
      )}
    </main>
  );
}
