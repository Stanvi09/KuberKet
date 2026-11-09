import os
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import BinaryIO

import requests
from dotenv import load_dotenv

import config

load_dotenv()


class GnaniAPIError(RuntimeError):
    """A safe, user-facing error raised for Gnani API failures."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


_request_lock = threading.Lock()
_tts_lock = threading.Lock()
_cache_lock = threading.Lock()
_tts_cache: OrderedDict[tuple[object, ...], bytes] = OrderedDict()


def _api_key() -> str:
    key = os.getenv("GNANI_API_KEY", "").strip()
    if not key:
        raise GnaniAPIError(
            "Gnani API key is missing. Add GNANI_API_KEY to your local .env file."
        )
    return key


def _http_error(status_code: int) -> GnaniAPIError:
    messages = {
        401: "Gnani could not authenticate the request. Check that GNANI_API_KEY is valid.",
        402: "Gnani credits are insufficient. Check the account's available balance.",
        403: "The Gnani API key does not have access to this service.",
        429: "Gnani is processing another request. Please wait a moment and try again.",
        500: "Gnani is temporarily unavailable. Please try again later.",
    }
    return GnaniAPIError(
        messages.get(status_code, f"Gnani rejected the request (HTTP {status_code})."),
        status_code,
    )


def _post(url: str, **kwargs: object) -> requests.Response:
    with _request_lock:
        for attempt in range(2):
            try:
                response = requests.post(url, **kwargs)
            except requests.Timeout as exc:
                raise GnaniAPIError(
                    "The request to Gnani timed out. Please try again."
                ) from exc
            except requests.ConnectionError as exc:
                raise GnaniAPIError(
                    "Could not connect to Gnani. Check your internet connection."
                ) from exc
            except requests.RequestException as exc:
                raise GnaniAPIError(
                    "The request to Gnani could not be completed."
                ) from exc

            if response.status_code == 429 and attempt == 0:
                response.close()
                time.sleep(config.RATE_LIMIT_RETRY_DELAY_SECONDS)
                continue
            if response.status_code != 200:
                response.close()
                raise _http_error(response.status_code)
            return response

    raise _http_error(429)


def _audio_payload(
    audio: bytes | bytearray | memoryview | str | os.PathLike[str] | BinaryIO,
) -> tuple[str, bytes]:
    if isinstance(audio, (bytes, bytearray, memoryview)):
        payload = bytes(audio)
        filename = "audio.wav"
    elif isinstance(audio, (str, os.PathLike)):
        path = Path(audio)
        try:
            payload = path.read_bytes()
        except OSError as exc:
            raise GnaniAPIError(f"Could not read the audio file: {path.name}.") from exc
        filename = path.name
    else:
        name = getattr(audio, "name", "audio.wav")
        filename = Path(str(name)).name or "audio.wav"
        try:
            if hasattr(audio, "getvalue"):
                payload = audio.getvalue()
            else:
                payload = audio.read()
        except (OSError, ValueError) as exc:
            raise GnaniAPIError("Could not read the supplied audio recording.") from exc
        if not isinstance(payload, (bytes, bytearray, memoryview)):
            raise GnaniAPIError("The supplied audio recording is not valid bytes.")
        payload = bytes(payload)

    if not payload:
        raise GnaniAPIError("The audio recording is empty.")
    return filename, payload


def transcribe(
    audio: bytes | bytearray | memoryview | str | os.PathLike[str] | BinaryIO,
    *,
    language_code: str | None = None,
    output_format: str | None = None,
) -> str:
    """Transcribe an audio file or file-like recording with Prisma."""
    selected_language = (
        config.STT_LANGUAGE_CODE if language_code is None else language_code
    )
    if selected_language not in config.STT_SUPPORTED_LANGUAGE_CODES:
        raise ValueError("Unsupported Prisma language code.")
    if output_format not in config.STT_SUPPORTED_FORMATS:
        raise ValueError("Unsupported Prisma output format.")

    filename, payload = _audio_payload(audio)
    form_data = {
        "model": config.STT_MODEL,
        "language_code": selected_language,
    }
    if output_format is not None:
        form_data["format"] = output_format
    response = _post(
        config.STT_URL,
        headers={"X-API-Key-ID": _api_key()},
        files={"audio_file": (filename, payload)},
        data=form_data,
        timeout=config.API_TIMEOUT_SECONDS,
    )
    try:
        result = response.json()
    except ValueError as exc:
        raise GnaniAPIError("Gnani returned an unreadable transcription response.") from exc
    finally:
        response.close()

    if not isinstance(result, dict) or result.get("success") is not True:
        raise GnaniAPIError("Gnani could not transcribe this recording.")
    transcript = result.get("transcript")
    if not isinstance(transcript, str):
        raise GnaniAPIError("Gnani's transcription response did not contain text.")
    return transcript


def _cache_key(
    text: str,
    language: str | None = None,
    speed: float | None = None,
) -> tuple[object, ...]:
    return (
        text,
        config.TTS_MODEL,
        config.TTS_VOICE,
        language or config.TTS_LANGUAGE,
        config.TTS_SPEED if speed is None else speed,
        tuple(sorted(config.TTS_AUDIO_CONFIG.items())),
    )


def speak(
    text: str,
    *,
    language: str | None = None,
    speed: float | None = None,
) -> bytes:
    """Return a WAV audio response from Timbre, caching successful phrases."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Text to speak must be a non-empty string.")
    selected_language = language or config.TTS_LANGUAGE
    if selected_language not in config.TTS_SUPPORTED_LANGUAGES:
        raise ValueError("Unsupported Timbre language.")
    selected_speed = config.TTS_SPEED if speed is None else speed
    if (
        isinstance(selected_speed, bool)
        or not isinstance(selected_speed, (int, float))
        or not 0.85 <= selected_speed <= 1.15
    ):
        raise ValueError("Timbre speech speed must be from 0.85 to 1.15.")

    key = _cache_key(text, selected_language, float(selected_speed))
    with _cache_lock:
        cached_audio = _tts_cache.get(key)
        if cached_audio is not None:
            _tts_cache.move_to_end(key)
            return cached_audio

    with _tts_lock:
        with _cache_lock:
            cached_audio = _tts_cache.get(key)
            if cached_audio is not None:
                _tts_cache.move_to_end(key)
                return cached_audio

        response = _post(
            config.TTS_URL,
            headers={
                "X-API-Key-ID": _api_key(),
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model": config.TTS_MODEL,
                "voice": config.TTS_VOICE,
                "language": selected_language,
                "speed": selected_speed,
                "audio_config": dict(config.TTS_AUDIO_CONFIG),
            },
            timeout=config.API_TIMEOUT_SECONDS,
        )
        try:
            audio = response.content
        finally:
            response.close()
        if not audio:
            raise GnaniAPIError("Gnani returned an empty audio response.")

        with _cache_lock:
            _tts_cache[key] = audio
            _tts_cache.move_to_end(key)
            while len(_tts_cache) > config.TTS_CACHE_SIZE:
                _tts_cache.popitem(last=False)
        return audio
