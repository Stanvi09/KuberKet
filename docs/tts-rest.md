# Gnani Timbre Text-to-Speech (REST)

Synchronous text-to-speech. Full audio is returned in one response.

Endpoint: POST https://api.vachana.ai/api/v1/tts/inference

Authentication: header X-API-Key-ID with your Gnani API key (required).

Note: Passing numbers, IDs, dates or currency as raw strings causes mispronunciations. Pass them as spoken words.

## Models
- timbre-v3.0: 10 Indian languages, every voice speaks all 10. Supports language, speed, and inline audio tags in text.
- timbre-v2.5: 10 Indian languages. Supports language, speed.
Supported languages: Hindi, English, Tamil, Telugu, Kannada, Malayalam, Marathi, Punjabi, Bengali, Gujarati.
Each model has its own voices. A voice from one model cannot be used with the other.

## Request body (JSON)
{
  "text": "नमस्ते, आप कैसे हैं?",
  "voice": "Shivani",
  "model": "timbre-v3.0",
  "language": "hi-IN",
  "speed": 1.0,
  "audio_config": {
    "sample_rate": 24000,
    "num_channels": 1,
    "sample_width": 2,
    "encoding": "linear_pcm",
    "container": "wav"
  }
}

## Parameters
- text (string, required): text to synthesize.
- model (string, required): timbre-v2.5 or timbre-v3.0.
- voice (string): voice name from the chosen model's catalog.
  - timbre-v3.0 voices: Avinash, Shivani, Lakshmi, Kalpana, Shubham, Prakash, Devansh, Yashraj, Chetana, Vasudha, Riyaa, Tarika, Harshad (each speaks all languages).
  - timbre-v2.5 example voices: Nalini (Hindi), Kaveri (English), Deepak (Hindi), Poorvi (Hinglish).
- language (string): auto, hi-IN, en-IN, hi-en (Hinglish), ta-IN, te-IN, kn-IN, ml-IN, mr-IN, pa-IN, bn-IN, gu-IN.
- speed (number): 0.85 to 1.15. Default 1.0.
- audio_config (object, required): output format.

## Audio formats (audio_config.container)
- wav + linear_pcm: WAV file, 8000-48000 Hz, audio/wav
- raw + linear_pcm: raw 16-bit PCM
- mp3: MP3, 8000-48000 Hz, bitrate 32k-192k, audio/mpeg
- ogg: OGG Opus, audio/ogg
- mulaw / alaw: 8000 Hz forced
Valid sample_rate values: 8000, 16000, 22050, 24000, 44100, 48000.

## Audio tags (timbre-v3.0 only)
<coughs>, <excited>, <exhales>, <giggle>, <laugh>, <pauses>, <shouting>, <sigh>, <slow>, <sniffles>, <whispers>, <yawns>, <clears throat>
Removed (not spoken) on timbre-v2.5.

## Response
200 OK: raw binary audio in the requested container format.

## Errors
Flat body for 400/500 errors:
{"success": false, "message": "...", "status_code": 400}
- 400: missing or invalid parameter, or unknown model.
- 500: unexpected failure, including text that is too long. Try again later.
Auth and rate-limit errors:
{"detail": {"error_code": "...", "message": "...", "status_code": 401}}
- 401 MISSING_API_KEY: header missing or empty.
- 401 INVALID_API_KEY: key not valid.
- 402: insufficient credit.
- 403 SCOPE_NOT_ALLOWED: key lacks scope for this service.
- 429 RATE_LIMITED: only 1 active request at a time. Wait and retry with backoff. No Retry-After header.

## Working Python example (tested)
import requests
r = requests.post(
    "https://api.vachana.ai/api/v1/tts/inference",
    headers={"X-API-Key-ID": key, "Content-Type": "application/json"},
    json={
        "text": "नमस्ते! आपकी किस्त हर महीने लगभग बारह हजार रुपये होगी।",
        "voice": "Shivani",
        "model": "timbre-v3.0",
        "language": "hi-IN",
        "speed": 1.0,
        "audio_config": {"sample_rate": 24000, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "wav"},
    },
    timeout=60,
)
open("output.wav", "wb").write(r.content)