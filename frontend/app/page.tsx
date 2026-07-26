"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Turn = {
  start: number;
  end: number;
  speaker: string;
};

type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
};

type SessionPayload = {
  session_id: string;
  turns: Turn[];
  transcript_segments: TranscriptSegment[];
  merged_transcript_segments: TranscriptSegment[];
  speaker_names?: Record<string, string>;
  minutes?: string | null;
  minutes_generated_at?: string | null;
  minutes_model?: string | null;
  minutes_local_date?: string | null;
  minutes_local_time?: string | null;
  minutes_local_timezone?: string | null;
};

type ViewMode = "transcript" | "merged" | "turns" | "minutes";

const SPEAKER_STYLES = [
  "bg-[#d4f0ff] text-[#0b4f6c]",
  "bg-[#dff4cf] text-[#335c2e]",
  "bg-[#ffe0c7] text-[#8b4a1f]",
  "bg-[#f2d9ff] text-[#5d2d7a]",
  "bg-[#ffe6ef] text-[#7d2144]",
];

function speakerColor(speaker: string) {
  const numericSuffix = Number.parseInt(speaker.replace(/\D/g, ""), 10) || 0;
  return SPEAKER_STYLES[numericSuffix % SPEAKER_STYLES.length];
}

function getLocalMinutesMetadata() {
  const now = new Date();
  const localDate = now.toLocaleDateString("en-GB");
  const localTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const timezoneLabel =
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    now.toLocaleTimeString([], { timeZoneName: "short" }).split(" ").slice(-1)[0] ||
    "Local";

  return {
    local_date: localDate,
    local_time: localTime,
    local_timezone: timezoneLabel,
  };
}

function escapePdfText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function wrapPdfLine(text: string, maxChars: number) {
  if (!text.trim()) {
    return [""];
  }

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    if (word.length <= maxChars) {
      currentLine = word;
      continue;
    }

    let remainingWord = word;
    while (remainingWord.length > maxChars) {
      lines.push(remainingWord.slice(0, maxChars));
      remainingWord = remainingWord.slice(maxChars);
    }
    currentLine = remainingWord;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function buildMinutesPdf(title: string, minutesText: string) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 48;
  const marginTop = 64;
  const lineHeight = 18;
  const maxCharsPerLine = 68;
  const pageBottom = 52;

  const lines = minutesText
    .split(/\r?\n/)
    .flatMap((line) => wrapPdfLine(line, maxCharsPerLine));

  const pages: string[][] = [];
  let currentPage: string[] = [];
  let y = pageHeight - marginTop;

  const pushLine = (line: string, fontSize = 12) => {
    currentPage.push(`BT /F1 ${fontSize} Tf 1 0 0 1 ${marginX} ${y} Tm (${escapePdfText(line)}) Tj ET`);
    y -= lineHeight;
  };

  pushLine(title, 18);
  y -= 8;

  for (const line of lines) {
    if (y <= pageBottom) {
      pages.push(currentPage);
      currentPage = [];
      y = pageHeight - marginTop;
      pushLine(title, 18);
      y -= 8;
    }
    pushLine(line || " ");
  }

  if (!currentPage.length) {
    pushLine(title, 18);
  }
  pages.push(currentPage);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, index) => `${3 + index} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);

  const contentObjectNumbers: number[] = [];
  pages.forEach((_, index) => {
    const pageObjectNumber = 3 + index;
    const contentObjectNumber = 3 + pages.length + index;
    contentObjectNumbers.push(contentObjectNumber);
    objects[pageObjectNumber - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
  });

  pages.forEach((commands, index) => {
    const content = commands.join("\n");
    objects[contentObjectNumbers[index] - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  const fontObjectNumber = 3 + pages.length * 2;
  objects[fontObjectNumber - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[] | null>(null);
  const [mergedTranscriptSegments, setMergedTranscriptSegments] = useState<TranscriptSegment[] | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState<string | null>(null);
  const [minutesGeneratedAt, setMinutesGeneratedAt] = useState<string | null>(null);
  const [minutesModel, setMinutesModel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("transcript");
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingSpeakerName, setEditingSpeakerName] = useState("");
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [editingMinutesText, setEditingMinutesText] = useState("");
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const hasGeneratedMinutes = Boolean(minutes && minutesGeneratedAt);
  const canGenerateMinutes = !minutesLoading && !editingMinutes && !hasGeneratedMinutes;

  const applySessionPayload = useCallback((data: SessionPayload) => {
    setSessionId(data.session_id);
    setTurns(data.turns);
    setTranscriptSegments(data.transcript_segments);
    setMergedTranscriptSegments(data.merged_transcript_segments);
    setSpeakerNames(data.speaker_names ?? {});
    setMinutes(data.minutes ?? null);
    setMinutesGeneratedAt(data.minutes_generated_at ?? null);
    setMinutesModel(data.minutes_model ?? null);
    setEditingMinutes(false);
    setEditingMinutesText(data.minutes ?? "");
  }, []);

  useEffect(() => {
    if (!file) {
      setAudioPreviewUrl((currentUrl) => {
        if (currentUrl) {
          window.URL.revokeObjectURL(currentUrl);
        }
        return null;
      });
      return;
    }

    const nextUrl = window.URL.createObjectURL(file);
    setAudioPreviewUrl((currentUrl) => {
      if (currentUrl) {
        window.URL.revokeObjectURL(currentUrl);
      }
      return nextUrl;
    });

    return () => {
      window.URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  const displaySpeaker = useCallback(
    (speakerId: string) => {
      const savedName = speakerNames[speakerId]?.trim();
      return savedName || speakerId;
    },
    [speakerNames],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const existingSessionId = url.searchParams.get("session_id");
    if (!existingSessionId) {
      return;
    }

    let cancelled = false;
    async function loadSavedSession() {
      try {
        const response = await fetch(`/api/transcripts/${existingSessionId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Failed to load saved transcript");
        }
        if (!cancelled) {
          applySessionPayload(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load saved transcript");
        }
      }
    }

    void loadSavedSession();
    return () => {
      cancelled = true;
    };
  }, [applySessionPayload]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }

    setLoading(true);
    setError("");
    setTurns(null);
    setTranscriptSegments(null);
    setMergedTranscriptSegments(null);
    setSpeakerNames({});
    setMinutes(null);
    setMinutesGeneratedAt(null);
    setMinutesModel(null);
    setViewMode("transcript");
    setSessionId(null);
    setEditingSegmentId(null);
    setEditingText("");
    setEditingSpeakerId(null);
    setEditingSpeakerName("");
    setEditingMinutes(false);
    setEditingMinutesText("");

    const form = new FormData();
    form.append("audio", file);

    try {
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Analysis failed");
      }
      applySessionPayload(data);
      const url = new URL(window.location.href);
      url.searchParams.set("session_id", data.session_id);
      window.history.replaceState({}, "", url.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function generateMinutes(regenerate: boolean) {
    if (!sessionId) {
      setError("No transcript session is available for minutes generation");
      return;
    }

    setMinutesLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/transcripts/${sessionId}/minutes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regenerate, ...getLocalMinutesMetadata() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to generate meeting minutes");
      }
      applySessionPayload(data);
      setViewMode("minutes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate meeting minutes");
    } finally {
      setMinutesLoading(false);
    }
  }

  function startEditing(segment: TranscriptSegment) {
    setEditingSegmentId(segment.id);
    setEditingText(segment.text);
    setEditingSpeakerId(segment.speaker);
    setEditingSpeakerName(speakerNames[segment.speaker] ?? "");
  }

  function cancelEditing() {
    setEditingSegmentId(null);
    setEditingText("");
    setEditingSpeakerId(null);
    setEditingSpeakerName("");
  }

  function startEditingMinutes() {
    setEditingMinutes(true);
    setEditingMinutesText(minutes ?? "");
  }

  function cancelEditingMinutes() {
    setEditingMinutes(false);
    setEditingMinutesText(minutes ?? "");
  }

  async function saveSegment(segment: TranscriptSegment) {
    if (!sessionId) {
      setError("No transcript session is available to save");
      return;
    }

    const nextText = editingText.trim();
    const originalText = segment.text;
    const nextSpeakerName = editingSpeakerName.trim();
    const originalSpeakerName = (speakerNames[segment.speaker] ?? "").trim();
    const textChanged = nextText !== originalText;
    const speakerChanged = nextSpeakerName !== originalSpeakerName;

    if (!textChanged && !speakerChanged) {
      cancelEditing();
      return;
    }

    setSavingSegmentId(segment.id);
    setError("");
    try {
      if (textChanged) {
        const response = await fetch(`/api/transcripts/${sessionId}/segments/${segment.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: nextText }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Failed to save transcript edit");
        }
        applySessionPayload(data);
      }

      if (speakerChanged) {
        const response = await fetch(`/api/transcripts/${sessionId}/speakers/${encodeURIComponent(segment.speaker)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: nextSpeakerName }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Failed to save speaker name");
        }
        applySessionPayload(data);
      }
      cancelEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transcript changes");
    } finally {
      setSavingSegmentId(null);
    }
  }

  async function saveMinutes() {
    if (!sessionId) {
      setError("No transcript session is available to save minutes");
      return;
    }

    setSavingMinutes(true);
    setError("");
    try {
      const response = await fetch(`/api/transcripts/${sessionId}/minutes`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ minutes: editingMinutesText }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to save meeting minutes");
      }
      applySessionPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save meeting minutes");
    } finally {
      setSavingMinutes(false);
    }
  }

  function downloadMinutesPdf() {
    if (!minutes) {
      return;
    }

    const title = "Meeting Minutes";
    const pdfContent = buildMinutesPdf(title, minutes);
    const blob = new Blob([pdfContent], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateSuffix = minutesGeneratedAt ? new Date(minutesGeneratedAt).toISOString().slice(0, 10) : null;
    link.download = dateSuffix ? `meeting-minutes-${dateSuffix}.pdf` : "meeting-minutes.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff5d6_0%,_#f1efe8_40%,_#dce5ec_100%)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="p-6 md:p-10">
            <div className="space-y-5">
              <p className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                Speaker Diarization POC
              </p>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-slate-900 md:text-6xl">
                  Turn a meeting recording into a speaker timeline.
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                  Upload MP3, WAV, FLAC, or another audio file that our backend can decode. The app will estimate
                  who spoke when and return segment timings you can inspect immediately.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 md:grid-cols-[0.95fr_1.05fr]">
          <form
            onSubmit={handleSubmit}
            className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
          >
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="audio-file">
                  Audio file
                </label>
                <input
                  id="audio-file"
                  aria-label="Audio file"
                  type="file"
                  accept="audio/*"
                  required
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="block w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Analyzing..." : "Analyze audio"}
              </button>

              {audioPreviewUrl ? (
                <audio
                  controls
                  preload="metadata"
                  src={audioPreviewUrl}
                  className="block w-full"
                  aria-label="Selected audio preview"
                >
                  Your browser does not support audio playback.
                </audio>
              ) : null}

              {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            </div>
          </form>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-900">Attributed transcript</h2>
                <p className="mt-1 text-sm text-slate-500">Review what was said and who most likely said it.</p>
              </div>
              {transcriptSegments ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {transcriptSegments.length} segment(s)
                </span>
              ) : null}
            </div>

            {transcriptSegments ? (
              <>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setViewMode("transcript")}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      viewMode === "transcript" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Transcript
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("merged")}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      viewMode === "merged" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Merged transcript
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("turns")}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      viewMode === "turns" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Raw turns
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("minutes")}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      viewMode === "minutes" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    AI minutes
                  </button>
                </div>

                {viewMode === "minutes" ? (
                  <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">AI minutes</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Generate concise meeting minutes from the latest saved transcript.
                        </p>
                        {minutesGeneratedAt ? (
                          <p className="mt-2 text-xs text-slate-400">
                            Generated {new Date(minutesGeneratedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void generateMinutes(Boolean(minutes))}
                        disabled={!canGenerateMinutes}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {minutesLoading ? "Working..." : minutes ? "Regenerate" : "Generate minutes"}
                      </button>
                      {minutes ? (
                        editingMinutes ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void saveMinutes()}
                              disabled={savingMinutes}
                              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingMinutes ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingMinutes}
                              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={downloadMinutesPdf}
                              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                            >
                              Download PDF
                            </button>
                            <button
                              type="button"
                              onClick={startEditingMinutes}
                              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                            >
                              Edit
                            </button>
                          </div>
                        )
                      ) : null}
                    </div>

                    {hasGeneratedMinutes && !minutesLoading && !editingMinutes ? (
                      <p className="mt-3 text-xs text-slate-400">
                        Minutes are up to date. Save transcript edits to enable regeneration.
                      </p>
                    ) : null}

                    {minutes ? (
                      editingMinutes ? (
                        <textarea
                          aria-label="Edit AI minutes"
                          value={editingMinutesText}
                          onChange={(event) => setEditingMinutesText(event.target.value)}
                          className="mt-5 min-h-80 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-slate-900"
                        />
                      ) : (
                        <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                          {minutes}
                        </div>
                      )
                    ) : (
                      <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                        No minutes generated yet. Save any transcript edits you want first, then generate minutes from
                        the final transcript.
                      </div>
                    )}
                  </div>
                ) : viewMode === "turns" ? (
                  <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">#</th>
                          <th className="px-4 py-3 font-medium">Start</th>
                          <th className="px-4 py-3 font-medium">End</th>
                          <th className="px-4 py-3 font-medium">Speaker</th>
                        </tr>
                      </thead>
                      <tbody>
                        {turns?.map((turn, index) => (
                          <tr key={`${turn.speaker}-${turn.start}-${index}`} className="border-t border-slate-100">
                            <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                            <td className="px-4 py-3">{turn.start.toFixed(2)}s</td>
                            <td className="px-4 py-3">{turn.end.toFixed(2)}s</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${speakerColor(turn.speaker)}`}
                              >
                                {displaySpeaker(turn.speaker)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">#</th>
                          <th className="px-4 py-3 font-medium">Start</th>
                          <th className="px-4 py-3 font-medium">End</th>
                          <th className="px-4 py-3 font-medium">Speaker</th>
                          <th className="px-4 py-3 font-medium">Text</th>
                          {viewMode === "transcript" ? <th className="px-4 py-3 font-medium">Actions</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {(viewMode === "merged" ? mergedTranscriptSegments : transcriptSegments)?.map((segment, index) => (
                          <tr key={`${segment.speaker}-${segment.start}-${index}`} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                            <td className="px-4 py-3">{segment.start.toFixed(2)}s</td>
                            <td className="px-4 py-3">{segment.end.toFixed(2)}s</td>
                            <td className="px-4 py-3">
                              {viewMode === "transcript" && editingSegmentId === segment.id ? (
                                <div className="space-y-2">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${speakerColor(segment.speaker)}`}
                                  >
                                    {segment.speaker}
                                  </span>
                                  <input
                                    aria-label={`Edit speaker name for ${segment.speaker}`}
                                    value={editingSpeakerId === segment.speaker ? editingSpeakerName : ""}
                                    onChange={(event) => setEditingSpeakerName(event.target.value)}
                                    placeholder="Assign speaker name"
                                    className="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                                  />
                                  <p className="text-xs text-slate-400">Saving this name updates every row for this speaker.</p>
                                </div>
                              ) : (
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${speakerColor(segment.speaker)}`}
                                >
                                  {displaySpeaker(segment.speaker)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 leading-6 text-slate-700">
                              {viewMode === "transcript" && editingSegmentId === segment.id ? (
                                <textarea
                                  aria-label={`Edit transcript segment ${index + 1}`}
                                  value={editingText}
                                  onChange={(event) => setEditingText(event.target.value)}
                                  className="min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                                />
                              ) : (
                                segment.text
                              )}
                            </td>
                            {viewMode === "transcript" ? (
                              <td className="px-4 py-3">
                                {editingSegmentId === segment.id ? (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void saveSegment(segment)}
                                      disabled={savingSegmentId === segment.id}
                                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {savingSegmentId === segment.id ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditing}
                                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startEditing(segment)}
                                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                                  >
                                    Edit
                                  </button>
                                )}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                Upload audio to generate a speaker-attributed transcript.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

