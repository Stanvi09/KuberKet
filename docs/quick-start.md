# Gnani Quick Start

Prerequisites:
- A valid API key (sign up on the Gnani API platform at https://app.gnani.ai/voice/)
- cURL or an API client such as Postman

Test audio requirements:
- Format: WAV, MP3, OGG, FLAC, AAC, or M4A
- Sample rate: 8 kHz to 44.1 kHz
- Maximum duration: 30 seconds

## Speech-to-Text (STT)

Prisma v2.5 is the default model. Add model=prisma-v3.0 to use Prisma v3.0.

Prisma v3.0 (curl):
curl -X POST https://api.vachana.ai/stt/v3 \
  -H 'X-API-Key-ID: <API_KEY>' \
  -F audio_file='@/path/to/your/audio.wav' \
  -F model=prisma-v3.0 \
  -F language_code=indic-auto

Prisma v3.0 (Python):
import requests
with open("/path/to/your/audio.wav", "rb") as f:
    r = requests.post(
        "https://api.vachana.ai/stt/v3",
        headers={"X-API-Key-ID": "<API_KEY>"},
        files={"audio_file": ("audio.wav", f, "audio/wav")},
        data={"model": "prisma-v3.0", "language_code": "indic-auto"},
        timeout=60,
    )
print(r.json())

One language and output style:
curl -X POST https://api.vachana.ai/stt/v3 \
  -H 'X-API-Key-ID: <API_KEY>' \
  -F audio_file='@/path/to/your/audio.wav' \
  -F model=prisma-v3.0 \
  -F language_code=hi-IN \
  -F format=transcribe

Prisma v2.5 (default):
curl -X POST https://api.vachana.ai/stt/v3 \
  -H 'Content-Type: multipart/form-data' \
  -H 'X-API-Key-ID: <API_KEY>' \
  -F audio_file='@/path/to/your/audio.wav' \
  -F language_code=hi-IN

Replace:
- <API_KEY>: your Gnani API key
- /path/to/your/audio.wav: path to your audio file
- hi-IN: language code (see Supported Languages on the STT REST page)

Expected STT response (Prisma v3.0):
{
  "success": true,
  "request_id": "5c1f0a52-6d62-4e0b-9a38-2f2b8a8f7a10",
  "transcript": "नमस्ते, आप कैसे हैं?",
  "model": "prisma-v3.0",
  "detected_language_code": "hi-IN",
  "processing_time": 0.58,
  "end_to_end_latency": 0.66
}

Expected STT response (Prisma v2.5):
{
  "success": true,
  "request_id": "019fd17d-1106-7265-88ab-3ed12d029292",
  "transcript": "नमस्ते, आप कैसे हैं?",
  "model": "prisma-v2.5"
}