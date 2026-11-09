from unittest.mock import Mock

import pytest
import requests

import config
from gnani_client import GnaniAPIError, speak, transcribe, _tts_cache


@pytest.fixture(autouse=True)
def clear_tts_cache():
    _tts_cache.clear()
    yield
    _tts_cache.clear()


def _response(status_code=200, *, json_data=None, content=b"RIFF-test-audio"):
    response = Mock()
    response.status_code = status_code
    response.content = content
    response.json.return_value = json_data
    response.close = Mock()
    return response


def test_prisma_uses_documented_multipart_fields_and_hindi_language(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-key-not-a-real-secret")
    response = _response(json_data={"success": True, "transcript": "मुझे tractor loan चाहिए"})
    post = Mock(return_value=response)
    monkeypatch.setattr(requests, "post", post)

    transcript = transcribe(b"sample", language_code="hi-IN")

    assert transcript == "मुझे tractor loan चाहिए"
    args, kwargs = post.call_args
    assert args == (config.STT_URL,)
    assert kwargs["headers"] == {"X-API-Key-ID": "test-key-not-a-real-secret"}
    assert kwargs["files"]["audio_file"] == ("audio.wav", b"sample")
    assert kwargs["data"] == {"model": "prisma-v3.0", "language_code": "hi-IN"}
    assert kwargs["timeout"] == config.API_TIMEOUT_SECONDS
    assert response.close.called


def test_prisma_supports_documented_auto_detection_and_format(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-key")
    response = _response(json_data={"success": True, "transcript": "tractor loan"})
    post = Mock(return_value=response)
    monkeypatch.setattr(requests, "post", post)

    transcribe(b"sample", language_code="indic-auto", output_format="codemix")

    assert post.call_args.kwargs["data"] == {
        "model": "prisma-v3.0",
        "language_code": "indic-auto",
        "format": "codemix",
    }


@pytest.mark.parametrize(
    ("language_code", "output_format"),
    [("ta-IN", None), ("hi-IN", "unknown"), ("", "codemix")],
)
def test_prisma_rejects_undocumented_options(monkeypatch, language_code, output_format):
    post = Mock()
    monkeypatch.setattr(requests, "post", post)

    with pytest.raises(ValueError):
        transcribe(
            b"sample",
            language_code=language_code,
            output_format=output_format,
        )
    post.assert_not_called()


def test_prisma_reports_authentication_failure_without_exposing_key(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-key")
    response = _response(status_code=401)
    monkeypatch.setattr(requests, "post", Mock(return_value=response))

    with pytest.raises(GnaniAPIError) as error:
        transcribe(b"sample")

    assert error.value.status_code == 401
    assert "test-key" not in str(error.value)
    assert response.close.called


@pytest.mark.parametrize("language", ["hi-IN", "en-IN"])
def test_timbre_uses_documented_request_and_language(monkeypatch, language):
    monkeypatch.setenv("GNANI_API_KEY", "test-key")
    response = _response(content=b"RIFF-wav-data")
    post = Mock(return_value=response)
    monkeypatch.setattr(requests, "post", post)

    audio = speak("नमस्ते, आपकी किस्त होगी।", language=language)

    assert audio == b"RIFF-wav-data"
    args, kwargs = post.call_args
    assert args == (config.TTS_URL,)
    assert kwargs["headers"] == {
        "X-API-Key-ID": "test-key",
        "Content-Type": "application/json",
    }
    assert kwargs["json"] == {
        "text": "नमस्ते, आपकी किस्त होगी।",
        "model": "timbre-v3.0",
        "voice": "Shivani",
        "language": language,
        "speed": 1.0,
        "audio_config": config.TTS_AUDIO_CONFIG,
    }
    assert response.close.called


def test_timbre_cache_is_separated_by_language(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-key")
    post = Mock(side_effect=[_response(content=b"hindi"), _response(content=b"english")])
    monkeypatch.setattr(requests, "post", post)

    assert speak("Hello", language="hi-IN") == b"hindi"
    assert speak("Hello", language="hi-IN") == b"hindi"
    assert speak("Hello", language="en-IN") == b"english"
    assert post.call_count == 2
    assert [item.kwargs["json"]["language"] for item in post.call_args_list] == [
        "hi-IN",
        "en-IN",
    ]


def test_timbre_speed_is_sent_and_separates_cached_audio(monkeypatch):
    monkeypatch.setenv("GNANI_API_KEY", "test-key")
    post = Mock(side_effect=[
        _response(content=b"normal-speed"),
        _response(content=b"slower-speed"),
    ])
    monkeypatch.setattr(requests, "post", post)

    assert speak("किस्त की बात", language="hi-IN", speed=1.0) == b"normal-speed"
    assert speak("किस्त की बात", language="hi-IN", speed=0.9) == b"slower-speed"
    assert speak("किस्त की बात", language="hi-IN", speed=0.9) == b"slower-speed"

    assert post.call_count == 2
    assert [item.kwargs["json"]["speed"] for item in post.call_args_list] == [1.0, 0.9]


def test_timbre_rejects_language_not_in_documentation(monkeypatch):
    post = Mock()
    monkeypatch.setattr(requests, "post", post)

    with pytest.raises(ValueError, match="Unsupported Timbre language"):
        speak("Hello", language="xx-XX")
    post.assert_not_called()
