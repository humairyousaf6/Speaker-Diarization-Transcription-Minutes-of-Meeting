/** @jest-environment node */

import { POST } from "@/app/api/analyze/route";
import { GET } from "@/app/api/transcripts/[session_id]/route";
import { PATCH } from "@/app/api/transcripts/[session_id]/segments/[segment_id]/route";
import { PATCH as PATCHMinutes, POST as POSTMinutes } from "@/app/api/transcripts/[session_id]/minutes/route";
import { PATCH as PATCHSpeaker } from "@/app/api/transcripts/[session_id]/speakers/[speaker_id]/route";

describe("POST /api/analyze", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("proxies success responses", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: "session_1",
        turns: [{ start: 0, end: 1, speaker: "SPEAKER_00" }],
        transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "hello" }],
        merged_transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "hello" }],
      }),
    });

    const form = new FormData();
    form.append("audio", new File(["data"], "test.wav", { type: "audio/wav" }));
    const request = new Request("http://localhost/api/analyze", { method: "POST", body: form });
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.turns).toHaveLength(1);
    expect(body.transcript_segments).toHaveLength(1);
  });

  it("forwards backend errors", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "PYANNOTEAI_API_KEY not set on server" }),
    });

    const form = new FormData();
    form.append("audio", new File(["data"], "test.wav", { type: "audio/wav" }));
    const request = new Request("http://localhost/api/analyze", { method: "POST", body: form });
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.detail).toMatch(/PYANNOTEAI_API_KEY/i);
  });

  it("loads saved transcript sessions", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: "session_1",
        turns: [],
        transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "hello" }],
        merged_transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "hello" }],
      }),
    });

    const response = await GET(new Request("http://localhost/api/transcripts/session_1"), {
      params: Promise.resolve({ session_id: "session_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session_id).toBe("session_1");
  });

  it("patches transcript segment text", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: "session_1",
        turns: [],
        transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
        merged_transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
      }),
    });

    const request = new Request("http://localhost/api/transcripts/session_1/segments/seg_1", {
      method: "PATCH",
      body: JSON.stringify({ text: "edited" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ session_id: "session_1", segment_id: "seg_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transcript_segments[0].text).toBe("edited");
  });

  it("patches saved speaker names", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: "session_1",
        turns: [],
        transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
        merged_transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
        speaker_names: { SPEAKER_00: "Sameed" },
        minutes: null,
        minutes_generated_at: null,
        minutes_model: null,
      }),
    });

    const request = new Request("http://localhost/api/transcripts/session_1/speakers/SPEAKER_00", {
      method: "PATCH",
      body: JSON.stringify({ name: "Sameed" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCHSpeaker(request, {
      params: Promise.resolve({ session_id: "session_1", speaker_id: "SPEAKER_00" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.speaker_names.SPEAKER_00).toBe("Sameed");
  });

  it("posts minutes generation requests", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: "session_1",
        turns: [],
        transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
        merged_transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
        minutes: "Meeting summary\nA concise summary.",
        minutes_model: "gpt-4o-mini",
      }),
    });

    const request = new Request("http://localhost/api/transcripts/session_1/minutes", {
      method: "POST",
      body: JSON.stringify({ regenerate: true }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POSTMinutes(request, {
      params: Promise.resolve({ session_id: "session_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.minutes_model).toBe("gpt-4o-mini");
  });

  it("patches saved minutes text", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: "session_1",
        turns: [],
        transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
        merged_transcript_segments: [{ id: "seg_1", start: 0, end: 1, speaker: "SPEAKER_00", text: "edited" }],
        minutes: "Edited minutes",
        minutes_generated_at: "2026-05-26T00:00:00Z",
        minutes_model: "gpt-4o-mini",
      }),
    });

    const request = new Request("http://localhost/api/transcripts/session_1/minutes", {
      method: "PATCH",
      body: JSON.stringify({ minutes: "Edited minutes" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCHMinutes(request, {
      params: Promise.resolve({ session_id: "session_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.minutes).toBe("Edited minutes");
  });
});
