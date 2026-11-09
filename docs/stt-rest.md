# Gnani Prisma Speech-to-Text (STT)

Gnani Prisma turns speech into text in Indian languages and English.
Two separate choices: a model, and an access method (how audio is sent).

## Access methods
- REST: short recording (up to 30 seconds), one file upload, transcript returned in the response. Endpoint: POST https://api.vachana.ai/stt/v3
- Realtime streaming: live audio over WebSocket. Endpoint: WS /stt/v3/stream
- Batch: long recordings or many files, runs as a background job. Endpoint: POST /stt/v3/batch/jobs

KuberKet uses REST only (push-to-talk, short recordings).

## Models
- prisma-v3.0: multilingual audio, automatic language detection, speech that mixes languages, context hints (names, topics). Select with model=prisma-v3.0
- prisma-v2.5 (default): transcribes in the language(s) you specify. Select with model=prisma-v2.5 or leave out model.
Note: the 3 in /stt/v3 is the URL version, not the model version. Both models are served from /stt/v3. Only the model value decides which model runs.

## Authentication
Header X-API-Key-ID with your Gnani API key.

## REST request (multipart form)
- audio_file: the audio file (WAV, MP3, OGG, FLAC, AAC or M4A; sample rate 8 kHz to 44.1 kHz; max 30 seconds)
- model: prisma-v3.0 (optional; default is prisma-v2.5)
- language_code: for example hi-IN, or indic-auto (auto detection, prisma-v3.0 only)
- format (optional): verbatim, transcribe, and with prisma-v3.0 also codemix and transliterate

## REST response (JSON)
{
  "success": true,
  "request_id": "...",
  "transcript": "...",
  "model": "prisma-v3.0",
  "detected_language_code": "hi-IN",
  "processing_time": 0.58,
  "end_to_end_latency": 0.66
}

## Features by model (REST)
- Language detection (indic-auto, or 1 to 4 languages): prisma-v3.0
- codemix output style: prisma-v3.0
- transliterate output style (Latin letters): prisma-v3.0
- Context hints (keyterms, topic, previous text, speaker names): prisma-v3.0
- Speaker diarization: not available on REST

## Tested results for KuberKet (spoken: "Mujhe tractor loan lena hai, EMI kitni hogi?")
- language_code=hi-IN returned: मुझे tractor loan लेना है, EMI कितनी होगी?  (best: keeps English words as spoken)
- language_code=indic-auto returned: मुझे ट्रैक्टर ऋण लेना है, ई एम आई कितनी होगी?  (works, but converts English words into Devanagari)
Decision: use language_code=hi-IN with model=prisma-v3.0.

## Errors
401 missing or invalid API key, 402 insufficient credit, 429 rate limit (one active request at a time), 500 temporary failure.
See the Gnani Error Reference for details.

## Working Python example (tested)
import requests
with open("test.m4a", "rb") as f:
    r = requests.post(
        "https://api.vachana.ai/stt/v3",
        headers={"X-API-Key-ID": key},
        files={"audio_file": ("test.m4a", f)},
        data={"model": "prisma-v3.0", "language_code": "hi-IN"},
        timeout=60,
    )
print(r.json()["transcript"])