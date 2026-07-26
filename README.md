# Speaker Diarization + Transcription POC

This project is a proof of concept for speaker-attributed transcription using:

- pyannote `community-1` for speaker diarization
- local `openai-whisper` for transcription
- FastAPI for the backend
- Next.js for the frontend

The app accepts an uploaded audio file, detects speaker turns, generates transcript segments, maps each transcript segment to the speaker with the greatest timestamp overlap, produces merged same-speaker transcript blocks for easier reading, and can generate AI meeting minutes from the saved reviewed transcript.

## Output Shape

The backend returns:

- `turns`
- `transcript_segments`
- `merged_transcript_segments`
- `minutes`
- `transcription`

Example response shape:

```json
{
  "turns": [
    { "start": 0.96, "end": 5.11, "speaker": "SPEAKER_02" }
  ],
  "transcript_segments": [
    {
      "start": 0.0,
      "end": 5.0,
      "speaker": "SPEAKER_02",
      "text": "Paul is the Human Resources Manager at Quartz Power Group."
    }
  ],
  "merged_transcript_segments": [
    {
      "start": 0.0,
      "end": 10.0,
      "speaker": "SPEAKER_02",
      "text": "Paul is the Human Resources Manager at Quartz Power Group. He has called a meeting with some of his colleagues to discuss a new training program."
    }
  ],
  "minutes": null,
  "transcription": {
    "provider": "openai-whisper",
    "model": "base"
  }
}
```

## Stack

- Backend: FastAPI, local pyannote `community-1` diarization, `openai-whisper`, OpenAI SDK for minutes
- Frontend: Next.js App Router, React, Tailwind CSS
- Tests: `pytest`, Jest, React Testing Library

## Important Environment Notes

- Diarization runs through the `community-1` model in the current project flow.
- Transcription runs locally through the free Python Whisper library.
- The diarization model is downloaded from Hugging Face once and then reused locally from `backend/.cache/huggingface`.
- The backend keeps Whisper model downloads inside `backend/.cache/whisper`.
- Keep your Hugging Face token out of source code. Set `HF_TOKEN` through `backend/.env`.
- AI meeting minutes are optional and generated on demand from the saved transcript session.
- This v1 uses segment-level timestamp alignment. It does not fully solve simultaneous overlapping-speech separation into two independent transcripts.

## Third-Party Attribution

This project uses the `pyannote/speaker-diarization-community-1` model for speaker diarization. That model is subject to its own third-party license terms under `CC-BY-4.0`.

- Canonical license URL: https://creativecommons.org/licenses/by/4.0/
- Attribution details: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## Backend Setup

```powershell
cd C:\Users\Sameed\Desktop\Speaker_Diarization
.\.venv\Scripts\Activate.ps1
python -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r backend\requirements.txt
```

Configuration:

```text
backend/.env.example
```

Copy it to:

```text
backend/.env
```

Then add:

```text
HF_TOKEN=your_hugging_face_token_here
OPENAI_API_KEY=your_openai_key_here
```

Run the backend:

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Health check:

```powershell
python -c "import requests; r=requests.get('http://127.0.0.1:8000/health'); print(r.status_code, r.text)"
```

## Frontend Setup

```powershell
cd C:\Users\Sameed\Desktop\Speaker_Diarization\frontend
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

## UI Behavior

The frontend shows four result views:

- `Transcript`
- `Merged transcript`
- `Raw turns`
- `AI minutes`

`Transcript` is the default view.

Transcript sessions are saved under:

```text
backend/data/transcripts/{session_id}.json
```

If a reviewer edits transcript text, any previously generated minutes are cleared so regenerated minutes always use the latest saved transcript.

## Real Sample Test

Provided sample file used for validation:

```text
Test_Audio\Business English_ Participating in meetings 2-[AudioTrimmer.com]-[AudioTrimmer.com].mp3.mpeg
```

Direct combined validation:

```powershell
cd C:\Users\Sameed\Desktop\Speaker_Diarization
.\.venv\Scripts\Activate.ps1
python -c "import os, json; from backend.diarize import run_diarization; from backend.transcribe import run_transcription; from backend.attribution import build_attributed_transcript_segments, merge_consecutive_same_speaker_segments; p=r'Test_Audio\Business English_ Participating in meetings 2-[AudioTrimmer.com]-[AudioTrimmer.com].mp3.mpeg'; turns=run_diarization(p, token=os.environ['HF_TOKEN'], num_speakers=4); transcript=run_transcription(p); attributed=build_attributed_transcript_segments(transcript, turns); merged=merge_consecutive_same_speaker_segments(attributed); print('TURNS', len(turns)); print('TRANSCRIPT', len(transcript)); print('ATTRIBUTED', len(attributed)); print('MERGED', len(merged)); print('SPEAKERS', sorted({segment['speaker'] for segment in attributed})); print(json.dumps(merged[:4], indent=2))"
```

Validated result on the provided sample:

- `TURNS 20`
- `TRANSCRIPT 24`
- `ATTRIBUTED 24`
- `MERGED 11`
- `SPEAKERS ['SPEAKER_00', 'SPEAKER_01', 'SPEAKER_02', 'SPEAKER_03']`

## Tests

Backend:

```powershell
cd C:\Users\Sameed\Desktop\Speaker_Diarization
.\.venv\Scripts\Activate.ps1
python -m pytest backend\tests -v
```

Frontend:

```powershell
cd C:\Users\Sameed\Desktop\Speaker_Diarization\frontend
npm.cmd test
npm.cmd run build
```

## What Was Verified

- Backend automated tests passed: `19/19`
- Frontend automated tests passed: `6/6`
- Frontend production build passed
- Whisper transcription completed on the provided sample audio
- local `community-1` diarization completed on the provided sample audio
- Speaker attribution and merged transcript generation completed on the provided sample audio
- FastAPI route logic returned diarization + transcript outputs in-process with a real uploaded file

## Known Limitation

This implementation maps one transcript segment to one speaker using maximum-overlap timestamp alignment. That works well for normal turn-taking speech, but it is still an approximation for interruptions and true overlapping simultaneous speech.
