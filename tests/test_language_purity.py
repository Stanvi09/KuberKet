"""Hindi means every word in Hindi; English means every word in English.

Walks the API in each language and fails if a message meant for the farmer is written in the other
language's script. Brand names (KuberKet, Gnani), scheme acronyms and machine codes are allowed.
"""

import re

import pytest
from fastapi.testclient import TestClient

import api
from gnani_client import GnaniAPIError
from test_api import _numbers_request, _pdf_document, _wav_recording

client = TestClient(api.app)
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
ENGLISH_SENTENCE = re.compile(r"\b[A-Za-z]{3,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}")
# Keys holding data rather than farmer-facing words.
SKIP_KEYS = {"source", "transcript", "audio_base64", "filename", "session_id", "chart_id", "field_id", "id",
             "url", "mime_type", "role", "unit", "units", "value", "exclusions", "status", "name"}
# Data that legitimately carries both languages for the screen to choose from.
SKIP_PATHS = re.compile(r"^\.(?:schemes|tractor_classes)|\.label_(?:hi|en)$|\.(?:hi|en)(?:\[\])?$|\.messages\[\]\.text$")


def _texts(obj, path=""):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key not in SKIP_KEYS:
                yield from _texts(value, f"{path}.{key}")
    elif isinstance(obj, list):
        for value in obj:
            yield from _texts(value, f"{path}[]")
    elif isinstance(obj, str) and not SKIP_PATHS.search(path):
        yield path, obj


def _wrong_script(language, response):
    try:
        body = response.json()
    except ValueError:
        return []
    bad = []
    for path, text in _texts(body):
        if language == "en" and (DEVANAGARI.search(text) or re.search(r"\bkists?\b", text, re.I)):
            bad.append((path, text))  # "kist" is a Hindi word; English says "instalment"
        if language == "hi" and ENGLISH_SENTENCE.search(text) and "GNANI_API_KEY" not in text:
            bad.append((path, text))
    return bad


@pytest.mark.parametrize("language", ["hi", "en"])
def test_every_farmer_facing_message_is_in_the_chosen_language(monkeypatch, language):
    monkeypatch.setattr(api, "speak", lambda text, *, language, speed=1.0: b"wav")
    problems = []

    def call(method, url, **kwargs):
        response = getattr(client, method)(url, **kwargs)
        problems.extend((method, url, *item) for item in _wrong_script(language, response))
        return response

    sid = client.post("/api/sessions").json()["session_id"]
    call("patch", f"/api/sessions/{sid}", json={"language": language, "input_mode": "audio"})
    call("post", f"/api/sessions/{sid}/conversation/start")
    yes = "yes" if language == "en" else "हाँ"
    for answer in ["6 lakh", yes, "1 lakh", yes, "9", yes, "5", yes, "480000", yes, "18000", yes, "3000", yes,
                   "0", yes, "no", yes]:
        call("post", f"/api/sessions/{sid}/messages", json={"text": answer})
    call("post", f"/api/sessions/{sid}/numbers/calculate", json=_numbers_request())
    call("post", f"/api/sessions/{sid}/numbers/calculate", json=_numbers_request(asset_price=100_000, down_payment=200_000))
    for chart in ("cash_flow", "repayment_breakdown", "income_scenarios", "buy_hire"):
        call("post", f"/api/sessions/{sid}/numbers/chart-explanation", json={"chart_id": chart, "explanation_mode": "detailed"})
    pdf = _pdf_document(["Loan amount: INR 600,000", "Interest rate: 10%", "Loan tenure: 5 years", "Interest rate: 12%"])
    call("post", f"/api/sessions/{sid}/documents/upload", files={"upload": ("loan.pdf", pdf, "application/pdf")})
    call("post", f"/api/sessions/{sid}/documents/upload", files={"upload": ("loan.txt", b"x", "text/plain")})
    call("post", f"/api/sessions/{sid}/documents/explain", json={"field_id": None})
    for audio in (b"", b"RIFFjunk", _wav_recording(40)):
        call("post", f"/api/sessions/{sid}/transcribe", files={"audio_file": ("a.wav", audio, "audio/wav")})
    monkeypatch.setattr(api, "transcribe", lambda *a, **k: (_ for _ in ()).throw(GnaniAPIError("x", status_code=429)))
    call("post", f"/api/sessions/{sid}/transcribe", files={"audio_file": ("a.wav", _wav_recording(), "audio/wav")})
    body = {"crop": "paddy", "yearly_income": 480000, "monthly_costs": 18000, "asset_price": 600000,
            "down_payment": 100000, "loan_rate": 9, "tenure_years": 5, "language": language}
    call("post", "/api/cashflow", json=body)
    call("post", "/api/cashflow", json={**body, "down_payment": 900000}, headers={"X-KuberKet-Language": language})
    call("get", f"/api/demo/farmer-year?language={language}")

    assert problems == [], "\n".join(f"{m.upper()} {u} {p}: {t[:120]}" for m, u, p, t in problems)
