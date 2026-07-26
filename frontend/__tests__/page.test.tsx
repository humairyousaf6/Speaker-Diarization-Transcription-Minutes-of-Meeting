import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import Home from "@/app/page";

function buildSession(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "session_1",
    turns: [{ start: 0, end: 3, speaker: "SPEAKER_00" }],
    transcript_segments: [{ id: "seg_1", start: 0, end: 3, speaker: "SPEAKER_00", text: "Hello there" }],
    merged_transcript_segments: [{ id: "seg_1", start: 0, end: 3, speaker: "SPEAKER_00", text: "Hello there" }],
    speaker_names: {},
    minutes: null,
    minutes_generated_at: null,
    minutes_model: null,
    ...overrides,
  };
}

describe("Home page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    window.history.replaceState({}, "", "/");
    window.URL.createObjectURL = jest.fn(() => "blob:minutes");
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("26/05/2026");
    jest.spyOn(Date.prototype, "toLocaleTimeString").mockImplementation(function (
      this: Date,
      _locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      if (options?.timeZoneName) {
        return "12:52 PKT";
      }
      return "12:52";
    });
    jest.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "en-US",
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    } as Intl.ResolvedDateTimeFormatOptions);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders upload form", () => {
    render(<Home />);
    expect(screen.getByText(/Turn a meeting recording into a speaker timeline/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Analyze audio/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Selected audio preview/i)).not.toBeInTheDocument();
  });

  it("shows an inline audio player after file selection and updates it when the file changes", () => {
    (window.URL.createObjectURL as jest.Mock)
      .mockReturnValueOnce("blob:first-audio")
      .mockReturnValueOnce("blob:second-audio");

    render(<Home />);
    const input = screen.getByLabelText(/Audio file/i);
    const firstFile = new File(["audio-one"], "first.wav", { type: "audio/wav" });
    const secondFile = new File(["audio-two"], "second.wav", { type: "audio/wav" });

    fireEvent.change(input, { target: { files: [firstFile] } });
    const audioPlayer = screen.getByLabelText(/Selected audio preview/i) as HTMLAudioElement;
    expect(audioPlayer).toBeInTheDocument();
    expect(audioPlayer).toHaveAttribute("src", "blob:first-audio");

    fireEvent.change(input, { target: { files: [secondFile] } });
    expect(screen.getByLabelText(/Selected audio preview/i)).toHaveAttribute("src", "blob:second-audio");
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:first-audio");
  });

  it("shows results table on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => buildSession(),
    });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("SPEAKER_00")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
  });

  it("switches between transcript views", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () =>
        buildSession({
          transcript_segments: [{ id: "seg_1", start: 0, end: 1.5, speaker: "SPEAKER_00", text: "Hello" }],
          merged_transcript_segments: [
            { id: "seg_1", start: 0, end: 3, speaker: "SPEAKER_00", text: "Hello there world" },
          ],
        }),
    });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Merged transcript/i }));
    await waitFor(() => expect(screen.getByText("Hello there world")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Raw turns/i }));
    await waitFor(() => expect(screen.getByText("SPEAKER_00")).toBeInTheDocument());
  });

  it("edits and saves a transcript segment", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildSession(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            transcript_segments: [{ id: "seg_1", start: 0, end: 3, speaker: "SPEAKER_00", text: "Edited hello" }],
            merged_transcript_segments: [
              { id: "seg_1", start: 0, end: 3, speaker: "SPEAKER_00", text: "Edited hello" },
            ],
          }),
      });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    const textarea = screen.getByLabelText(/Edit transcript segment 1/i);
    fireEvent.change(textarea, { target: { value: "Edited hello" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => expect(screen.getByText("Edited hello")).toBeInTheDocument());
  });

  it("shows error on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "model error" }),
    });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/model error/i)).toBeInTheDocument());
  });

  it("generates AI minutes from a saved session", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildSession(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            minutes:
              "Meeting Minutes\nDate: 26/05/2026\nTime: 12:52 Asia/Karachi\nParticipants: SPEAKER_00\n\nMeeting summary\nA concise summary.",
            minutes_generated_at: "2026-05-26T00:00:00Z",
            minutes_model: "gpt-4o-mini",
          }),
      });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /AI minutes/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate minutes/i }));

    const minutesRequest = (global.fetch as jest.Mock).mock.calls[1];
    expect(minutesRequest?.[1]?.body).toContain("\"local_date\":\"26/05/2026\"");
    expect(minutesRequest?.[1]?.body).toContain("\"local_time\":\"12:52\"");
    expect(minutesRequest?.[1]?.body).toContain("\"local_timezone\":\"Asia/Karachi\"");
    await waitFor(() => expect(screen.getByText(/Meeting Minutes/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Date: 26\/05\/2026/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Time: 12:52 Asia\/Karachi/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Participants: SPEAKER_00/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Meeting summary/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/A concise summary./i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: /Regenerate/i })).toBeDisabled());
    await waitFor(() =>
      expect(screen.getByText(/Minutes are up to date\. Save transcript edits to enable regeneration\./i)).toBeInTheDocument(),
    );
  });

  it("keeps regenerate disabled until transcript changes are saved", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            minutes: "Meeting summary\nA concise summary.",
            minutes_generated_at: "2026-05-26T00:00:00Z",
            minutes_model: "gpt-4o-mini",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            transcript_segments: [{ id: "seg_1", start: 0, end: 3, speaker: "SPEAKER_00", text: "Edited hello" }],
            merged_transcript_segments: [
              { id: "seg_1", start: 0, end: 3, speaker: "SPEAKER_00", text: "Edited hello" },
            ],
          }),
      });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /AI minutes/i }));
    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^Transcript$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.change(screen.getByLabelText(/Edit transcript segment 1/i), { target: { value: "Edited hello" } });
    fireEvent.click(screen.getByRole("button", { name: /^AI minutes$/i }));

    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^Transcript$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    fireEvent.click(screen.getByRole("button", { name: /^AI minutes$/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Generate minutes/i })).toBeEnabled());
  });

  it("edits and saves the whole AI minutes text", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            minutes:
              "Meeting Minutes\nDate: 26/05/2026\nTime: 12:52 Asia/Karachi\nParticipants: SPEAKER_00\n\nMeeting summary\nOriginal minutes.",
            minutes_generated_at: "2026-05-26T00:00:00Z",
            minutes_model: "gpt-4o-mini",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            minutes:
              "Meeting Minutes\nDate: 26/05/2026\nTime: 12:52 Asia/Karachi\nParticipants: SPEAKER_00\n\nMeeting summary\nEdited minutes.",
            minutes_generated_at: "2026-05-26T00:00:00Z",
            minutes_model: "gpt-4o-mini",
          }),
      });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^AI minutes$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    const textarea = screen.getByLabelText(/Edit AI minutes/i);
    fireEvent.change(textarea, { target: { value: "Meeting summary\nEdited minutes." } });
    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => expect(screen.getByText(/Edited minutes\./i)).toBeInTheDocument());
  });

  it("downloads AI minutes as a PDF", async () => {
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createdAnchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = jest.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        createdAnchors.push(element as HTMLAnchorElement);
      }
      return element;
    }) as typeof document.createElement);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () =>
          buildSession({
            minutes:
              "Meeting Minutes\nDate: 26/05/2026\nTime: 12:52 Asia/Karachi\nParticipants: SPEAKER_00\n\nMeeting summary\nOriginal minutes.",
            minutes_generated_at: "2026-05-26T00:00:00Z",
            minutes_model: "gpt-4o-mini",
          }),
    });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^AI minutes$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/i }));

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:minutes");
    const anchor = createdAnchors[0];
    expect(anchor?.download).toBe("meeting-minutes-2026-05-26.pdf");

    clickSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it("renames a speaker globally and re-enables minutes generation", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            turns: [
              { start: 0, end: 3, speaker: "SPEAKER_00" },
              { start: 3, end: 5, speaker: "SPEAKER_00" },
            ],
            transcript_segments: [
              { id: "seg_1", start: 0, end: 2, speaker: "SPEAKER_00", text: "Hello there" },
              { id: "seg_2", start: 2, end: 5, speaker: "SPEAKER_00", text: "Welcome back" },
            ],
            merged_transcript_segments: [
              { id: "seg_1", start: 0, end: 5, speaker: "SPEAKER_00", text: "Hello there Welcome back" },
            ],
            minutes: "Meeting summary\nOriginal minutes.",
            minutes_generated_at: "2026-05-26T00:00:00Z",
            minutes_model: "gpt-4o-mini",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildSession({
            turns: [
              { start: 0, end: 3, speaker: "SPEAKER_00" },
              { start: 3, end: 5, speaker: "SPEAKER_00" },
            ],
            transcript_segments: [
              { id: "seg_1", start: 0, end: 2, speaker: "SPEAKER_00", text: "Hello there" },
              { id: "seg_2", start: 2, end: 5, speaker: "SPEAKER_00", text: "Welcome back" },
            ],
            merged_transcript_segments: [
              { id: "seg_1", start: 0, end: 5, speaker: "SPEAKER_00", text: "Hello there Welcome back" },
            ],
            speaker_names: { SPEAKER_00: "Sameed" },
            minutes: null,
            minutes_generated_at: null,
            minutes_model: null,
          }),
      });

    render(<Home />);
    const file = new File(["audio"], "test.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText(/Audio file/i), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: /Analyze audio/i }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/i })[0]);
    fireEvent.change(screen.getByLabelText(/Edit speaker name for SPEAKER_00/i), {
      target: { value: "Sameed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => expect(screen.getAllByText("Sameed").length).toBeGreaterThanOrEqual(2));
    fireEvent.click(screen.getByRole("button", { name: /Merged transcript/i }));
    await waitFor(() => expect(screen.getAllByText("Sameed").length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getByRole("button", { name: /Raw turns/i }));
    await waitFor(() => expect(screen.getAllByText("Sameed").length).toBeGreaterThanOrEqual(2));
    fireEvent.click(screen.getByRole("button", { name: /^AI minutes$/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Generate minutes/i })).toBeEnabled());
  });
});
