STT_URL = "https://api.vachana.ai/stt/v3"
STT_MODEL = "prisma-v3.0"
STT_LANGUAGE_CODE = "hi-IN"
STT_SUPPORTED_LANGUAGE_CODES = ("hi-IN", "en-IN", "indic-auto")
STT_SUPPORTED_FORMATS = (None, "verbatim", "transcribe", "codemix", "transliterate")

TTS_URL = "https://api.vachana.ai/api/v1/tts/inference"
TTS_MODEL = "timbre-v3.0"
TTS_VOICE = "Shivani"
TTS_LANGUAGE = "hi-IN"
TTS_SUPPORTED_LANGUAGES = ("hi-IN", "en-IN")  # KuberKet speaks only Hindi and English
TTS_SPEED = 1.0
TTS_AUDIO_CONFIG = {
    "sample_rate": 24000,
    "num_channels": 1,
    "sample_width": 2,
    "encoding": "linear_pcm",
    "container": "wav",
}

API_TIMEOUT_SECONDS = 60
RATE_LIMIT_RETRY_DELAY_SECONDS = 1
TTS_CACHE_SIZE = 32
