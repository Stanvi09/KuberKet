"""Thin local API adapter for KuberKet's existing deterministic Python logic."""

from __future__ import annotations

import base64
from dataclasses import asdict, dataclass, field
import io
import os
from pathlib import Path
import re
from typing import Literal
from uuid import uuid4
import wave

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StrictFloat, StrictInt
from finance_engine import FinanceInputError, calculate_farm_loan, monthly_story
from narration import SPOKEN_MODES, build_cashflow_report
from schemes_data import AS_OF as SCHEMES_AS_OF, SCHEMES, TRACTOR_CAPS_LAKH
from schemes_engine import evaluate_schemes
from server_text import localize, localize_result
from starlette.exceptions import HTTPException as StarletteHTTPException
from documents_service import MAX_PDF_BYTES, extract_pdf, numeric_value

from conversation_agent import ConversationAgent, extract_slot_values
from explanation_engine import (
    LOAN_PURPOSES,
    DEFAULT_PURPOSE,
    detect_loan_purpose,
    format_rupees,
    numbers_to_spoken_words,
)
from gnani_client import GnaniAPIError, speak, transcribe


MAX_RECORDING_BYTES = 10 * 1024 * 1024
MAX_RECORDING_SECONDS = 30
_SPEECH_SPLIT_RE = re.compile(r"(?<=[।.!?])\s+")


class Message(BaseModel):
    role: Literal["assistant", "farmer"]
    text: str


class SpeechClip(BaseModel):
    label: str
    text: str
    audio_base64: str
    mime_type: Literal["audio/wav"] = "audio/wav"


class PendingConfirmation(BaseModel):
    slot: str
    value: float | int


class FinancialInputSnapshot(BaseModel):
    value: StrictFloat | StrictInt | None
    status: Literal["given", "assumed", "missing"]
    source: Literal["document", "conversation", "manual"] | None = None


class DocumentTermSnapshot(BaseModel):
    field_id: str
    label: str
    value: str | None
    status: Literal["found", "confirmed", "missing"]
    origin: Literal["document", "farmer"]
    page: int | None
    source: str | None
    issue: str | None


class DocumentSnapshot(BaseModel):
    document_id: str
    filename: str
    page_count: int
    scanned_only: bool
    terms: dict[str, DocumentTermSnapshot]


class DocumentTermUpdate(BaseModel):
    field_id: str = Field(min_length=1, max_length=60)
    value: str | None = Field(default=None, max_length=300)
    confirmed: bool = False


class DocumentTermsUpdateRequest(BaseModel):
    updates: list[DocumentTermUpdate] = Field(min_length=1, max_length=20)


class DocumentExplanationRequest(BaseModel):
    field_id: str | None = Field(default=None, max_length=60)


class DocumentTransferRequest(BaseModel):
    field_ids: list[str] = Field(min_length=1, max_length=8)
    overwrite_approved: list[str] = Field(default_factory=list, max_length=8)
    income_drop_percent: StrictFloat | StrictInt = Field(default=25, ge=0, le=100)


class ChartContextSnapshot(BaseModel):
    chart_id: Literal["cash_flow", "repayment_breakdown", "income_scenarios", "buy_hire"]
    title: str
    description: str
    units: str
    labels: list[str]
    data: list[dict[str, str | float | int | None]]
    input_statuses: dict[str, FinancialInputSnapshot]
    selected_scenario: float | None
    methodology: str
    limitations: list[str]
    selected_point: str | None
    explanation_mode: Literal["simple", "detailed"]
    speech_speed: float


class SessionSnapshot(BaseModel):
    session_id: str
    language: Literal["hi", "en"]
    section: Literal["home", "numbers", "documents", "schemes"]
    loan_purpose: Literal["equipment", "irrigation", "livestock", "other"]
    crop: Literal["paddy", "wheat", "maize"]
    input_mode: Literal["audio", "chat"]
    messages: list[Message]
    conversation_state: str
    current_slot: str | None
    awaiting_confirmation: PendingConfirmation | None
    current_prompt: str | None
    slots: dict[str, dict[str, float | int | str | None]]
    finance_result: dict | None
    screen_explanation: str | None
    latest_speech: list[SpeechClip]
    speech_error: str | None
    numbers_inputs: dict[str, "FinancialInputSnapshot"]
    numbers_result: dict | None
    numbers_income_drop_percent: float
    numbers_workspace_active: bool
    chart_context: ChartContextSnapshot | None
    chart_context_stale: bool
    document: DocumentSnapshot | None
    explanation_mode: Literal["simple", "detailed"]
    speech_speed: float


class NumbersCalculationRequest(BaseModel):
    inputs: dict[str, StrictFloat | StrictInt | None]
    input_statuses: dict[str, Literal["given", "assumed", "missing"]]
    input_sources: dict[str, Literal["document", "conversation", "manual"]] = Field(default_factory=dict)
    income_drop_percent: StrictFloat | StrictInt = Field(default=25, ge=0, le=100)


class ChartContextRequest(BaseModel):
    chart_id: Literal["cash_flow", "repayment_breakdown", "income_scenarios", "buy_hire"]
    selected_scenario: StrictFloat | StrictInt | None = Field(default=None, ge=0, le=100)
    selected_point: str | None = Field(default=None, max_length=80)
    explanation_mode: Literal["simple", "detailed"] = "simple"
    speech_speed: StrictFloat = Field(default=1.0, ge=0.85, le=1.15)


class ExplanationPreferencesRequest(BaseModel):
    explanation_mode: Literal["simple", "detailed"]
    speech_speed: StrictFloat = Field(ge=0.85, le=1.15)


class CashflowRequest(BaseModel):
    crop: Literal["paddy", "wheat", "maize"]
    yearly_income: float = Field(ge=0, le=1_000_000_000)
    monthly_costs: float = Field(ge=0, le=100_000_000)
    monthly_existing_loan_payments: float = Field(default=0, ge=0, le=100_000_000)
    asset_price: float = Field(default=0, ge=0, le=1_000_000_000)
    down_payment: float = Field(default=0, ge=0, le=1_000_000_000)
    loan_rate: float = Field(default=0, ge=0, le=100)
    tenure_years: int = Field(default=0, ge=0, le=40)
    savings: float = Field(default=0, ge=0, le=1_000_000_000)
    income_drop_percent: float = Field(default=25, ge=0, le=60)
    language: Literal["hi", "en"] = "hi"


class CashflowSpeakRequest(CashflowRequest):
    mode: Literal["narration", "answer"] = "narration"
    index: int = Field(default=0, ge=0, le=10)
    speed: float = Field(default=1.0, ge=0.85, le=1.15)


class SchemesRequest(BaseModel):
    crop: Literal["paddy", "wheat", "maize"]
    yearly_income: float = Field(ge=0, le=1_000_000_000)
    monthly_costs: float = Field(ge=0, le=100_000_000)
    monthly_existing_loan_payments: float = Field(default=0, ge=0, le=100_000_000)
    asset_price: float = Field(default=0, ge=0, le=1_000_000_000)
    down_payment: float = Field(default=0, ge=0, le=1_000_000_000)
    loan_rate: float = Field(default=0, ge=0, le=100)
    tenure_years: int = Field(default=0, ge=0, le=40)
    alternative_rate: float | None = Field(default=None, ge=0, le=100)
    savings: float = Field(default=0, ge=0, le=1_000_000_000)
    small_or_marginal: bool = True
    sc_st_or_women: bool = False
    buying_machinery: bool = False
    tractor_class: str | None = None
    post_harvest_project: bool = False
    pays_income_tax: bool = False
    government_employee_or_pensioner: bool = False
    sum_insured: float | None = Field(default=None, ge=0, le=1_000_000_000)
    crop_loan_amount: float | None = Field(default=None, ge=0, le=1_000_000_000)


class SessionUpdate(BaseModel):
    language: Literal["hi", "en"] | None = None
    loan_purpose: Literal["equipment", "irrigation", "livestock", "other"] | None = None
    crop: Literal["paddy", "wheat", "maize"] | None = None
    input_mode: Literal["audio", "chat"] | None = None
    speech_speed: StrictFloat | None = Field(default=None, ge=0.85, le=1.15)
    section: Literal["home", "numbers", "documents", "schemes"] | None = None


class MessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class TranscriptionResponse(BaseModel):
    transcript: str
    language_code: str


@dataclass
class _Session:
    language: Literal["hi", "en"] = "hi"
    section: Literal["home", "numbers", "documents", "schemes"] = "home"
    loan_purpose: Literal["equipment", "irrigation", "livestock", "other"] = DEFAULT_PURPOSE
    crop: Literal["paddy", "wheat", "maize"] = "paddy"
    input_mode: Literal["audio", "chat"] = "audio"
    messages: list[Message] = field(default_factory=list)
    agent: ConversationAgent | None = None
    latest_speech: list[SpeechClip] = field(default_factory=list)
    speech_error: str | None = None
    numbers_inputs: dict[str, dict[str, float | int | None | str]] = field(default_factory=dict)
    document: dict | None = None
    document_text: str = ""
    numbers_result: dict | None = None
    numbers_income_drop_percent: float = 25
    numbers_workspace_active: bool = False
    chart_context: dict | None = None
    chart_context_stale: bool = False
    explanation_mode: Literal["simple", "detailed"] = "simple"
    speech_speed: float = 1.0


_sessions: dict[str, _Session] = {}

app = FastAPI(title="KuberKet local API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-KuberKet-Language"],
)


def _request_language(request: Request) -> str | None:
    """The farmer's language for this request: the session's, else what the screen sent."""
    session = _sessions.get(str(request.path_params.get("session_id", "")))
    if session is not None:
        return session.language
    for candidate in (request.query_params.get("language"), request.headers.get("x-kuberket-language")):
        if candidate in ("hi", "en"):
            return candidate
    return None


@app.exception_handler(StarletteHTTPException)
async def _localized_http_error(request: Request, exc: StarletteHTTPException):
    """Every error message leaves the server in the farmer's language."""
    language = _request_language(request)
    if language and isinstance(exc.detail, str):
        exc = HTTPException(status_code=exc.status_code, detail=localize(exc.detail, language), headers=exc.headers)
    return await http_exception_handler(request, exc)


def _session_or_404(session_id: str) -> _Session:
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="This KuberKet session was not found.")
    return session


def _snapshot(session_id: str, session: _Session) -> SessionSnapshot:
    agent = session.agent
    slots: dict[str, dict[str, float | int | str | None]] = {}
    if agent is not None:
        slots = {
            name: {"value": item.value, "status": item.status}
            for name, item in agent.slots.items()
        }
    if session.numbers_inputs:
        numbers_inputs = session.numbers_inputs
        numbers_result = session.numbers_result
    elif agent is not None:
        numbers_inputs = {
            name: {"value": item.value, "status": item.status, "source": "conversation"}
            for name, item in agent.slots.items()
        }
        numbers_result = asdict(agent.result) if agent.result else None
    else:
        numbers_inputs = {
            name: {"value": None, "status": "missing", "source": None}
            for name in (
                "asset_price",
                "down_payment",
                "yearly_interest_rate_percent",
                "tenure_years",
                "yearly_farm_income",
                "monthly_costs",
                "monthly_existing_loan_payments",
                "yearly_hiring_spend",
            )
        }
        numbers_result = None

    return SessionSnapshot(
        session_id=session_id,
        language=session.language,
        section=session.section,
        loan_purpose=session.loan_purpose,
        crop=session.crop,
        input_mode=session.input_mode,
        messages=session.messages,
        conversation_state=agent.state if agent else "not_started",
        current_slot=agent.current_slot if agent else None,
        awaiting_confirmation=(
            {"slot": agent.pending[0], "value": agent.pending[1]}
            if agent is not None and agent.pending is not None
            else None
        ),
        current_prompt=(
            agent.text["questions"].get(agent.current_slot)
            if agent is not None and agent.current_slot is not None
            else None
        ),
        slots=slots,
        finance_result=localize_result(asdict(agent.result), session.language) if agent is not None and agent.result else None,
        screen_explanation=agent.screen_explanation if agent is not None else None,
        latest_speech=session.latest_speech,
        speech_error=session.speech_error,
        numbers_inputs=numbers_inputs,
        numbers_result=localize_result(numbers_result, session.language),
        numbers_income_drop_percent=session.numbers_income_drop_percent,
        numbers_workspace_active=session.numbers_workspace_active,
        chart_context=session.chart_context,
        chart_context_stale=session.chart_context_stale,
        document=_document_for_screen(session.document, session.language),
        explanation_mode=session.explanation_mode,
        speech_speed=session.speech_speed,
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _key_configured() -> bool:
    return bool(os.getenv("GNANI_API_KEY", "").strip())


@app.get("/api/voice/status")
def voice_status() -> dict[str, bool]:
    """Cheap check the page makes on load: is a Gnani key present on this computer?"""
    return {"key_configured": _key_configured()}


def _silent_wav(seconds: float = 1.0, rate: int = 16_000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00" * int(rate * seconds))
    return buffer.getvalue()


@app.post("/api/voice/check")
def voice_check(language: Literal["hi", "en"] = "hi") -> dict:
    """Try Timbre (speaking) and Prisma (listening) once, and say in plain words what is wrong."""
    configured = _key_configured()
    if not configured:
        problem = _voice_setup_problem(GnaniAPIError("Gnani API key is missing."), language) or ""
        return {
            "key_configured": False,
            "speech": {"ok": False, "message": problem},
            "listening": {"ok": False, "message": problem},
        }
    result: dict = {"key_configured": True}
    try:
        speak(
            "नमस्ते" if language == "hi" else "Hello",
            language="hi-IN" if language == "hi" else "en-IN",
        )
        result["speech"] = {"ok": True, "message": ""}
    except GnaniAPIError as exc:
        result["speech"] = {"ok": False, "message": _friendly_speech_error(exc, language)}
    try:
        transcribe(_silent_wav(), language_code="hi-IN" if language == "hi" else "en-IN")
        result["listening"] = {"ok": True, "message": ""}
    except GnaniAPIError as exc:
        # Silence cannot be transcribed. That still proves the key reached Prisma.
        reached = exc.status_code is None and "could not transcribe" in str(exc).casefold()
        result["listening"] = {
            "ok": reached,
            "message": "" if reached else _friendly_transcription_error(exc, language),
        }
    return result


# A made-up farmer for the landing-page story. Never a real person's data.
_DEMO_FARMER = {
    "crop": "paddy",
    "yearly_income": 480_000,
    "monthly_costs": 18_000,
    "monthly_existing_loan_payments": 3_000,
    "asset_price": 600_000,
    "down_payment": 100_000,
    "loan_rate": 9,
    "tenure_years": 5,
}


@app.get("/api/demo/farmer-year")
def demo_farmer_year(
    income_drop_percent: float = Query(default=0, ge=0, le=60),
    language: Literal["hi", "en"] = "hi",
) -> dict:
    """One harvest-based year for the synthetic demo farmer, from the finance engine."""
    report = build_cashflow_report(
        **_DEMO_FARMER, income_drop_percent=income_drop_percent, language=language
    )
    return {"synthetic": True, "farmer": {"name": "रामू", "inputs": _DEMO_FARMER}, **report}


@app.post("/api/cashflow")
def cashflow(request: CashflowRequest) -> dict:
    """The 12-month cash flow for a crop, with sentences built from engine outputs."""
    try:
        return build_cashflow_report(**request.model_dump())
    except FinanceInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/cashflow/speak", response_model=SpeechClip)
def cashflow_speak(request: CashflowSpeakRequest) -> SpeechClip:
    """Speak one engine-built sentence. One clip per call so the page can play them in order."""
    fields = request.model_dump(exclude={"mode", "index", "speed"})
    try:
        report = build_cashflow_report(**fields)
    except FinanceInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    assert request.mode in SPOKEN_MODES
    if request.mode == "narration":
        items = [item["text"] for item in report["narration"]]
    else:
        items = [item["answer"] for item in report["answers"]]
    if request.index >= len(items):
        raise HTTPException(status_code=404, detail="No such sentence.")
    from explanation_engine import numbers_to_spoken_words as _words

    spoken = _words(items[request.index].replace("₹", ""), request.language)
    try:
        audio = speak(
            spoken,
            language={"hi": "hi-IN", "en": "en-IN"}[request.language],
            speed=request.speed,
        )
    except GnaniAPIError as exc:
        raise HTTPException(
            status_code=502, detail=_friendly_speech_error(exc, request.language)
        ) from exc
    return SpeechClip(
        label=request.mode,
        text=spoken,
        audio_base64=base64.b64encode(audio).decode("ascii"),
    )


@app.get("/api/schemes")
def schemes_info() -> dict:
    """What each scheme is, its terms with sources, and the date those were read."""
    return {"as_of": SCHEMES_AS_OF, "schemes": SCHEMES, "tractor_classes": TRACTOR_CAPS_LAKH}


@app.post("/api/schemes/evaluate")
def schemes_evaluate(request: SchemesRequest) -> dict:
    """Compare the five schemes on this farmer's own numbers. Not advice."""
    try:
        return evaluate_schemes(**request.model_dump())
    except FinanceInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/sessions", response_model=SessionSnapshot)
def create_session() -> SessionSnapshot:
    session_id = str(uuid4())
    session = _Session()
    _sessions[session_id] = session
    return _snapshot(session_id, session)


@app.get("/api/sessions/{session_id}", response_model=SessionSnapshot)
def get_session(session_id: str) -> SessionSnapshot:
    session = _session_or_404(session_id)
    return _snapshot(session_id, session)


@app.patch("/api/sessions/{session_id}", response_model=SessionSnapshot)
def update_session(session_id: str, update: SessionUpdate) -> SessionSnapshot:
    session = _session_or_404(session_id)
    changes = update.model_dump(exclude_unset=True)
    if "language" in changes and session.agent is not None:
        session.agent.set_language(changes["language"])
        if session.agent.result is not None:
            session.agent.spoken_explanation, session.agent.screen_explanation = (
                build_explanations(session.agent.result, changes["language"])
            )
        session.latest_speech = []
        session.speech_error = None
        session.latest_speech = []
        session.speech_error = None
    if "loan_purpose" in changes and session.agent is not None:
        changes.pop("loan_purpose")  # the running conversation keeps its purpose
    if "language" in changes:
        session.chart_context = None
        session.chart_context_stale = False
    if (
        "section" in changes
        and changes["section"] != "numbers"
        and session.chart_context_stale
    ):
        session.chart_context = None
        session.chart_context_stale = False
        session.latest_speech = []
        session.speech_error = None
    switched_to_audio = changes.get("input_mode") == "audio" and session.input_mode != "audio"
    for key, value in changes.items():
        setattr(session, key, value)
    if "input_mode" in changes:
        session.latest_speech = []
        session.speech_error = None
    if switched_to_audio and session.agent is not None and session.messages:
        last = session.messages[-1]
        if last.role == "assistant":
            # Speak what is already on screen, so switching to audio never leaves the farmer in silence.
            _prepare_speech(session, "collecting", last.text)
    return _snapshot(session_id, session)


@app.post(
    "/api/sessions/{session_id}/documents/upload",
    response_model=SessionSnapshot,
)
def upload_document(session_id: str, upload: UploadFile = File(...)) -> SessionSnapshot:
    session = _session_or_404(session_id)
    filename = (upload.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    if not filename.casefold().endswith(".pdf") or upload.content_type not in {
        "application/pdf",
        "application/octet-stream",
    }:
        raise HTTPException(status_code=415, detail="Upload a PDF document only.")
    payload = upload.file.read(MAX_PDF_BYTES + 1)
    if len(payload) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="The PDF exceeds the 10 MB limit.")
    try:
        parsed = extract_pdf(filename, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    terms = parsed.terms
    session.document = {
        "document_id": str(uuid4()),
        "filename": filename[:120],
        "page_count": parsed.page_count,
        "scanned_only": not bool(parsed.text.strip()),
        "terms": terms,
    }
    session.document_text = parsed.text
    session.section = "documents"
    session.latest_speech = []
    session.speech_error = None
    return _snapshot(session_id, session)


@app.delete(
    "/api/sessions/{session_id}/documents",
    response_model=SessionSnapshot,
)
def remove_document(session_id: str) -> SessionSnapshot:
    session = _session_or_404(session_id)
    session.document = None
    session.document_text = ""
    session.latest_speech = []
    session.speech_error = None
    return _snapshot(session_id, session)


@app.patch(
    "/api/sessions/{session_id}/documents/terms",
    response_model=SessionSnapshot,
)
def update_document_terms(
    session_id: str,
    request: DocumentTermsUpdateRequest,
) -> SessionSnapshot:
    session = _session_or_404(session_id)
    if session.document is None:
        raise HTTPException(status_code=404, detail="Upload a document before reviewing its terms.")

    terms = session.document["terms"]
    for update in request.updates:
        term = terms.get(update.field_id)
        if term is None:
            raise HTTPException(status_code=422, detail="This document term is not supported.")
        value = update.value.strip() if update.value is not None else None
        if update.confirmed and not value:
            raise HTTPException(status_code=422, detail="Enter a value before confirming it.")
        if update.value is not None and value != term["value"]:
            term.update(
                value=value or None,
                status="found" if value else "missing",
                origin="farmer",
                page=None,
                source="Corrected by farmer",
                issue=None,
            )
        if update.confirmed:
            term["status"] = "confirmed"
            term["origin"] = "farmer"
            if term["source"] is None or term["source"] == "Corrected by farmer":
                term["source"] = "Confirmed by farmer"
        elif not value and update.value is not None:
            term["status"] = "missing"
    return _snapshot(session_id, session)


@app.post(
    "/api/sessions/{session_id}/documents/explain",
    response_model=SessionSnapshot,
)
def explain_document(
    session_id: str,
    request: DocumentExplanationRequest,
) -> SessionSnapshot:
    session = _session_or_404(session_id)
    if session.document is None:
        raise HTTPException(status_code=409, detail="Upload a document before asking for an explanation.")
    reply = _document_explanation(session.document, request.field_id, session.language)
    prompt = _document_explanation_prompt(session.document, request.field_id, session.language)
    _prepare_chart_speech(session, reply)
    session.messages.extend(
        [Message(role="farmer", text=prompt), Message(role="assistant", text=reply)]
    )
    return _snapshot(session_id, session)


@app.post(
    "/api/sessions/{session_id}/documents/transfer",
    response_model=SessionSnapshot,
)
def transfer_document_values(
    session_id: str,
    request: DocumentTransferRequest,
) -> SessionSnapshot:
    session = _session_or_404(session_id)
    if session.document is None:
        raise HTTPException(status_code=409, detail="Upload a document before transferring values.")
    if len(set(request.field_ids)) != len(request.field_ids):
        raise HTTPException(status_code=422, detail="A document term was selected more than once.")

    targets = {
        "tractor_price": "asset_price",
        "down_payment": "down_payment",
        "interest_rate": "yearly_interest_rate_percent",
        "tenure": "tenure_years",
    }
    inputs: dict[str, int | float] = {}
    statuses: dict[str, Literal["given", "assumed", "missing"]] = {}
    sources: dict[str, Literal["document", "conversation", "manual"]] = {}
    terms = session.document["terms"]
    if not set(request.overwrite_approved).issubset(request.field_ids):
        raise HTTPException(status_code=422, detail="Overwrite approval must match selected document values.")
    for field_id in request.field_ids:
        if field_id not in targets:
            raise HTTPException(
                status_code=422,
                detail=f"{field_id} cannot be transferred directly into My Numbers.",
            )
        term = terms[field_id]
        if term["status"] != "confirmed" or not term["value"]:
            raise HTTPException(
                status_code=422,
                detail="Only values confirmed by the farmer can be transferred.",
            )
        value = numeric_value(str(term["value"]))
        if value is None:
            raise HTTPException(
                status_code=422,
                detail=f"The confirmed {term['label']} is not a usable number.",
            )
        if field_id == "tenure":
            duration = re.search(
                r"(\d+(?:\.\d+)?)\s*(years?|yrs?)\b",
                str(term["value"]),
                re.I,
            )
            if not duration or not float(duration.group(1)).is_integer():
                raise HTTPException(
                    status_code=422,
                    detail="Only a tenure stated as a whole number of years can be transferred.",
                )
            value = int(float(duration.group(1)))
        target = targets[field_id]
        current = session.numbers_inputs.get(target, {}).get("value")
        if current is None and session.agent is not None:
            current = getattr(session.agent.slots.get(target), "value", None)
        if current is not None and current != value and field_id not in request.overwrite_approved:
            raise HTTPException(
                status_code=409,
                detail=f"Review and approve replacing the existing {target} value.",
            )
        inputs[target] = value
        statuses[target] = "given"
        sources[target] = "document"

    calculation = NumbersCalculationRequest(
        inputs=inputs,
        input_statuses=statuses,
        input_sources=sources,
        income_drop_percent=request.income_drop_percent,
    )
    calculate_numbers(session_id, calculation)
    session.section = "numbers"
    return _snapshot(session_id, session)


@app.post("/api/sessions/{session_id}/conversation/start", response_model=SessionSnapshot)
def start_conversation(session_id: str) -> SessionSnapshot:
    session = _session_or_404(session_id)
    if session.agent is None:
        session.agent = ConversationAgent(
            language=session.language, purpose=session.loan_purpose
        )
        opening = session.agent.start()
        session.messages.append(Message(role="assistant", text=opening))
        _prepare_speech(session, "not_started", opening)
    return _snapshot(session_id, session)


@app.post("/api/sessions/{session_id}/conversation/reset", response_model=SessionSnapshot)
def reset_conversation(session_id: str) -> SessionSnapshot:
    """Begin again: forget the answers, the numbers calculated from them, and any spoken reply."""
    session = _session_or_404(session_id)
    session.agent = None
    session.messages = []
    session.latest_speech = []
    session.speech_error = None
    session.numbers_inputs = {}
    session.numbers_result = None
    session.numbers_workspace_active = False
    session.chart_context = None
    session.chart_context_stale = False
    return _snapshot(session_id, session)


@app.post("/api/sessions/{session_id}/messages", response_model=SessionSnapshot)
def send_message(session_id: str, request: MessageRequest) -> SessionSnapshot:
    session = _session_or_404(session_id)
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Please enter a message.")

    if session.chart_context_stale:
        detail = (
            "The numbers changed. Wait for the chart to refresh before asking about it."
            if session.language == "en"
            else "नंबर बदल गए हैं। चार्ट का नया हिसाब आने के बाद ही उसके बारे में पूछें।"
        )
        raise HTTPException(status_code=409, detail=detail)

    if session.section == "documents" and session.document is not None:
        reply = _answer_document_question(
            session.document,
            session.document_text,
            text,
            session.language,
        )
        _prepare_chart_speech(session, reply)
        session.messages.extend(
            [Message(role="farmer", text=text), Message(role="assistant", text=reply)]
        )
        return _snapshot(session_id, session)

    if session.chart_context is not None:
        reply = _explain_chart_question(session.chart_context, text, session.language)
        _prepare_chart_speech(session, reply)
        session.messages.extend(
            [Message(role="farmer", text=text), Message(role="assistant", text=reply)]
        )
        return _snapshot(session_id, session)

    if session.agent is None:
        loan_words = ("loan", "कर्ज़", "कर्ज", "ऋण", "kist", "emi")
        spoken_purpose = detect_loan_purpose(text)
        first_answer = extract_slot_values(text, "asset_price")
        if (
            spoken_purpose is None
            and not any(word in text.casefold() for word in loan_words)
            and not first_answer
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "KuberKet explains farm loans. Say what the loan is for, "
                    "such as a tractor, borewell or dairy animals."
                ),
            )
        if spoken_purpose is not None:
            session.loan_purpose = spoken_purpose
        session.agent = ConversationAgent(
            language=session.language, purpose=session.loan_purpose
        )
        opening = session.agent.start()
        if first_answer:
            previous_state = session.agent.state
            reply = session.agent.respond(text)
        else:
            previous_state = "not_started"
            reply = opening
    else:
        previous_state = session.agent.state
        reply = session.agent.respond(text)

    _prepare_speech(session, previous_state, reply)
    session.messages.extend(
        [Message(role="farmer", text=text), Message(role="assistant", text=reply)]
    )
    return _snapshot(session_id, session)


@app.patch(
    "/api/sessions/{session_id}/numbers/preferences",
    response_model=SessionSnapshot,
)
def update_explanation_preferences(
    session_id: str,
    request: ExplanationPreferencesRequest,
) -> SessionSnapshot:
    session = _session_or_404(session_id)
    session.explanation_mode = request.explanation_mode
    session.speech_speed = float(request.speech_speed)
    if session.chart_context is not None:
        session.chart_context["explanation_mode"] = session.explanation_mode
        session.chart_context["speech_speed"] = session.speech_speed
    return _snapshot(session_id, session)


@app.post(
    "/api/sessions/{session_id}/numbers/chart-context",
    response_model=SessionSnapshot,
)
def select_chart_context(
    session_id: str,
    request: ChartContextRequest,
) -> SessionSnapshot:
    session = _session_or_404(session_id)
    if session.numbers_workspace_active:
        result = session.numbers_result
        inputs = session.numbers_inputs
    elif session.agent is not None and session.agent.result is not None:
        result = asdict(session.agent.result)
        inputs = {
            name: {"value": slot.value, "status": slot.status}
            for name, slot in session.agent.slots.items()
        }
    else:
        result = None
        inputs = {}
    if result is None:
        session.chart_context_stale = False
        raise HTTPException(
            status_code=409,
            detail="Complete the required loan inputs before asking about a chart.",
        )

    labels = _chart_labels(session.language)
    selected_scenario = (
        float(request.selected_scenario)
        if request.selected_scenario is not None
        else None
    )
    selected_point = request.selected_point
    data: list[dict[str, str | float | int | None]]

    if request.chart_id == "repayment_breakdown":
        allowed_points = {"loan_amount", "total_interest"}
        if selected_point is not None and selected_point not in allowed_points:
            raise HTTPException(status_code=422, detail="Unsupported repayment chart point.")
        data = [
            {"id": "loan_amount", "label": labels["borrowed"], "value": result["loan_amount"], "unit": "INR"},
            {"id": "total_interest", "label": labels["interest"], "value": result["total_interest"], "unit": "INR"},
            {"id": "total_repayment", "label": labels["total"], "value": result["total_repayment"], "unit": "INR"},
        ]
        title = labels["repayment_title"]
        description = labels["repayment_description"]
        units = "INR"
        methodology = labels["repayment_method"]
        limitations = [
            labels["fixed_monthly"],
            labels["no_fees"],
        ]
    elif request.chart_id == "cash_flow":
        baseline = next(
            (
                scenario
                for scenario in result.get("scenarios", [])
                if scenario["income_drop_percent"] == 0
            ),
            None,
        )
        required_cash_values = (
            inputs.get("yearly_farm_income", {}).get("value"),
            inputs.get("monthly_costs", {}).get("value"),
            inputs.get("monthly_existing_loan_payments", {}).get("value"),
        )
        if baseline is None or any(value is None for value in required_cash_values):
            session.chart_context_stale = False
            raise HTTPException(
                status_code=409,
                detail="Complete the income and monthly cost inputs before asking about cash flow.",
            )
        monthly_income = float(required_cash_values[0]) / 12
        monthly_costs = float(required_cash_values[1])
        existing_payments = float(required_cash_values[2])
        monthly_kist = float(result["monthly_kist"])
        monthly_remaining = float(baseline["affordability"]["monthly_money_left"])
        if monthly_income <= 0 or monthly_remaining < 0:
            session.chart_context_stale = False
            raise HTTPException(
                status_code=409,
                detail="A positive income and non-negative remainder are needed for this allocation chart.",
            )
        allowed_points = {
            "monthly_income",
            "monthly_costs",
            "existing_loan_payments",
            "loan_kist",
            "monthly_remaining",
        }
        if selected_point is not None and selected_point not in allowed_points:
            raise HTTPException(status_code=422, detail="Unsupported cash-flow chart point.")
        data = [
            {"id": "monthly_costs", "label": labels["monthly_costs"], "value": monthly_costs, "unit": "INR per month"},
            {"id": "existing_loan_payments", "label": labels["existing_payments"], "value": existing_payments, "unit": "INR per month"},
            {"id": "loan_kist", "label": labels["loan_kist"], "value": monthly_kist, "unit": "INR per month"},
            {"id": "monthly_remaining", "label": labels["monthly_remaining"], "value": monthly_remaining, "unit": "INR per month"},
            {"id": "monthly_income", "label": labels["monthly_income"], "value": monthly_income, "unit": "INR per month"},
        ]
        title = labels["cash_flow_title"]
        description = labels["cash_flow_description"]
        units = "INR per month"
        methodology = labels["cash_flow_method"]
        limitations = [labels["even_income"], labels["fixed_costs"]]
    elif request.chart_id == "income_scenarios":
        allowed_points = {f"income_down_{drop:g}_percent" for drop in (0, 25, 40)}
        allowed_points.update(
            str(item["name"]) for item in result.get("scenarios", [])
        )
        if selected_point is not None and selected_point not in allowed_points:
            raise HTTPException(status_code=422, detail="Unsupported income scenario point.")
        data = []
        for scenario in result.get("scenarios", []):
            affordability = scenario["affordability"]
            data.append(
                {
                    "id": scenario["name"],
                    "label": labels["normal"] if scenario["income_drop_percent"] == 0 else (
                        f"{labels['income_down']} {scenario['income_drop_percent']:g}%"
                    ),
                    "income_drop_percent": scenario["income_drop_percent"],
                    "yearly_farm_income": scenario["yearly_farm_income"],
                    "yearly_money_left": affordability["yearly_money_left"],
                    "yearly_status": affordability["yearly_status"],
                    "monthly_money_left": affordability["monthly_money_left"],
                    "monthly_status": affordability["monthly_status"],
                    "unit": "INR",
                }
            )
        if selected_scenario is not None and not any(
            float(item["income_drop_percent"]) == selected_scenario for item in data
        ):
            raise HTTPException(
                status_code=409,
                detail="The selected income scenario is not available from the calculation engine.",
            )
        title = labels["scenario_title"]
        description = labels["scenario_description"]
        units = "INR per year"
        methodology = labels["scenario_method"]
        limitations = [labels["even_income"], labels["fixed_costs"]]
    else:
        comparison = result.get("buy_rent_comparison")
        if comparison is None:
            session.chart_context_stale = False
            raise HTTPException(
                status_code=409,
                detail="Provide annual hiring or renting spend before asking about this comparison.",
            )
        allowed_points = {"buying", "hiring"}
        if selected_point is not None and selected_point not in allowed_points:
            raise HTTPException(status_code=422, detail="Unsupported buy-versus-hiring point.")
        data = [
            {
                "id": "buying",
                "label": labels["buying"],
                "value": comparison["yearly_buying_cash_outlay"],
                "unit": "INR per year",
            },
            {
                "id": "hiring",
                "label": labels["hiring"],
                "value": comparison["yearly_hiring_spend"],
                "unit": "INR per year",
            },
            {
                "id": "difference",
                "label": labels["difference"],
                "value": comparison["yearly_difference_buying_minus_hiring"],
                "unit": "INR per year",
            },
            {
                "id": "lower_cash_outlay",
                "label": comparison["lower_cash_outlay"],
                "value": None,
                "unit": "comparison result",
            },
        ]
        title = labels["buy_title"]
        description = labels["buy_description"]
        units = "INR per year"
        methodology = labels["buy_method"]
        limitations = [
            labels["buy_exclusions"],
            labels["cash_not_recommendation"],
        ]

    statuses = {
        name: {
            "value": item.get("value"),
            "status": item.get("status", "missing"),
        }
        for name, item in inputs.items()
    }
    session.explanation_mode = request.explanation_mode
    session.speech_speed = float(request.speech_speed)
    session.chart_context = ChartContextSnapshot(
        chart_id=request.chart_id,
        title=title,
        description=description,
        units=units,
        labels=[str(item["label"]) for item in data],
        data=data,
        input_statuses=statuses,
        selected_scenario=selected_scenario,
        methodology=methodology,
        limitations=limitations,
        selected_point=selected_point,
        explanation_mode=request.explanation_mode,
        speech_speed=float(request.speech_speed),
    ).model_dump()
    session.chart_context_stale = False
    session.latest_speech = []
    session.speech_error = None
    return _snapshot(session_id, session)


@app.post(
    "/api/sessions/{session_id}/numbers/chart-explanation",
    response_model=SessionSnapshot,
)
def explain_chart(
    session_id: str,
    request: ChartContextRequest,
) -> SessionSnapshot:
    snapshot = select_chart_context(session_id, request)
    session = _session_or_404(session_id)
    context = session.chart_context
    if context is None:
        raise HTTPException(status_code=409, detail="The chart context is not available.")
    explanation_request = (
        "Explain this chart"
        if session.language == "en"
        else "इस चार्ट को समझाइए"
    )
    explanation = _explain_chart_question(
        context,
        explanation_request,
        session.language,
    )
    _prepare_chart_speech(session, explanation)
    session.messages.append(Message(role="assistant", text=explanation))
    return _snapshot(session_id, session)


@app.post(
    "/api/sessions/{session_id}/numbers/chart-context/invalidate",
    response_model=SessionSnapshot,
)
def invalidate_chart_context(session_id: str) -> SessionSnapshot:
    session = _session_or_404(session_id)
    if session.chart_context is not None:
        session.chart_context_stale = True
    session.chart_context = None
    session.latest_speech = []
    session.speech_error = None
    return _snapshot(session_id, session)


@app.post("/api/sessions/{session_id}/numbers/calculate", response_model=SessionSnapshot)
def calculate_numbers(
    session_id: str,
    request: NumbersCalculationRequest,
) -> SessionSnapshot:
    session = _session_or_404(session_id)
    allowed_inputs = {
        "asset_price",
        "down_payment",
        "yearly_interest_rate_percent",
        "tenure_years",
        "yearly_farm_income",
        "monthly_costs",
        "monthly_existing_loan_payments",
        "yearly_hiring_spend",
    }
    unknown = (
        set(request.inputs) | set(request.input_statuses) | set(request.input_sources)
    ) - allowed_inputs
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported financial input: {', '.join(sorted(unknown))}.",
        )

    if session.numbers_inputs:
        inputs = {
            name: dict(value)
            for name, value in session.numbers_inputs.items()
        }
    elif session.agent is not None:
        inputs = {
            name: {"value": item.value, "status": item.status, "source": "conversation"}
            for name, item in session.agent.slots.items()
        }
    else:
        inputs = {
            name: {"value": None, "status": "missing"}
            for name in allowed_inputs
        }

    for name, value in request.inputs.items():
        status = request.input_statuses.get(
            name,
            "assumed" if value is not None else "missing",
        )
        if value is None and status != "missing":
            raise HTTPException(
                status_code=422,
                detail=f"{name} cannot be confirmed or assumed without a value.",
            )
        if value is not None and status == "missing":
            raise HTTPException(
                status_code=422,
                detail=f"{name} has a value and cannot be marked missing.",
            )
        inputs[name] = {
            "value": value,
            "status": status,
            "source": (
                request.input_sources.get(name, "manual")
                if value is not None
                else None
            ),
        }
    for name, status in request.input_statuses.items():
        if name not in request.inputs:
            current_value = inputs.get(name, {}).get("value")
            if current_value is None and status != "missing":
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} cannot be confirmed or assumed without a value.",
                )
            if current_value is not None and status == "missing":
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} has a value and cannot be marked missing.",
                )
            inputs[name]["status"] = status
            inputs[name]["source"] = request.input_sources.get(
                name,
                inputs[name].get("source", "manual"),
            )

    required_inputs = (
        "asset_price",
        "down_payment",
        "yearly_interest_rate_percent",
        "tenure_years",
        "yearly_farm_income",
        "monthly_costs",
        "monthly_existing_loan_payments",
    )
    missing = [
        name
        for name in required_inputs
        if inputs.get(name, {}).get("value") is None
        or inputs.get(name, {}).get("status") == "missing"
    ]
    result = None
    if not missing:
        selected_drop = float(request.income_drop_percent)
        drops = (25, 40) if selected_drop in (0, 25, 40) else (25, 40, selected_drop)
        try:
            result = asdict(
                calculate_farm_loan(
                    asset_price=inputs["asset_price"]["value"],
                    down_payment=inputs["down_payment"]["value"],
                    yearly_interest_rate_percent=inputs["yearly_interest_rate_percent"]["value"],
                    tenure_years=inputs["tenure_years"]["value"],
                    yearly_farm_income=inputs["yearly_farm_income"]["value"],
                    monthly_costs=inputs["monthly_costs"]["value"],
                    monthly_existing_loan_payments=inputs["monthly_existing_loan_payments"]["value"],
                    yearly_hiring_spend=inputs.get("yearly_hiring_spend", {}).get("value"),
                    income_drop_percentages=drops,
                )
            )
        except (FinanceInputError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    session.chart_context_stale = (
        session.chart_context_stale or session.chart_context is not None
    )
    session.numbers_inputs = inputs
    session.numbers_result = result
    session.numbers_income_drop_percent = float(request.income_drop_percent)
    session.numbers_workspace_active = True
    session.chart_context = None
    session.latest_speech = []
    session.speech_error = None
    return _snapshot(session_id, session)


def _speech_parts(
    agent: ConversationAgent,
    previous_state: str,
    response: str,
) -> list[tuple[str, str]]:
    if previous_state == "collecting" and agent.state == "teach_back":
        parts = [
            ("Explanation", chunk)
            for chunk in _split_sentences(agent.spoken_explanation or "")
        ]
        if agent.spoken_teach_question:
            parts.append(("Teach-back question", agent.spoken_teach_question))
        return parts
    if previous_state == "teach_back" and agent.state == "teach_back":
        parts = [
            ("Simpler explanation", chunk)
            for chunk in _split_sentences(agent.text["teach_retry"])
        ]
        if agent.spoken_teach_question:
            parts.append(("Teach-back question", agent.spoken_teach_question))
        return parts
    return [("Reply", chunk) for chunk in _split_sentences(response)]


_DOCUMENT_KEYWORDS = {
    "lender_name": ("lender", "bank", "finance company", "ऋणदाता"),
    "tractor_price": ("tractor price", "vehicle price", "ट्रैक्टर की कीमत"),
    "loan_amount": ("loan amount", "principal", "amount financed", "कर्ज़ की रकम"),
    "down_payment": ("down payment", "margin money", "जमा रकम"),
    "interest_rate": ("interest rate", "rate of interest", "ब्याज दर"),
    "interest_type": ("fixed", "floating", "variable", "फिक्स्ड", "फ्लोटिंग"),
    "tenure": ("tenure", "loan period", "अवधि"),
    "installment_amount": ("emi", "instalment", "installment", "किस्त"),
    "total_repayment": ("total repay", "total payable", "कुल भुगतान"),
    "repayment_frequency": ("frequency", "monthly", "quarterly", "मासिक"),
    "processing_fee": ("processing fee", "processing charge", "प्रोसेसिंग"),
    "other_charges": ("other charge", "additional charge", "fee", "शुल्क"),
    "collateral": ("collateral", "security", "गिरवी"),
    "late_payment_charges": ("late", "overdue", "penalty", "देर", "विलंब"),
    "prepayment_conditions": ("prepayment", "foreclosure", "early repayment", "पहले चुकाने"),
}

_DOCUMENT_TERM_MEANINGS = {
    "lender_name": {
        "en": "This identifies the lender named in the document.",
        "hi": "इससे पता चलता है कि दस्तावेज़ में किस ऋणदाता का नाम है।",
    },
    "tractor_price": {
        "en": "This is the tractor price stated in the document; compare it with the seller's final price.",
        "hi": "यह दस्तावेज़ में लिखी ट्रैक्टर की कीमत है। इसे विक्रेता की अंतिम कीमत से मिलाएँ।",
    },
    "loan_amount": {
        "en": "This is the amount the document says is being borrowed, before checking any extra charges.",
        "hi": "यह दस्तावेज़ में लिखा उधार का मूल पैसा है। अलग शुल्क शामिल हैं या नहीं, यह भी जाँचें।",
    },
    "down_payment": {
        "en": "This is the amount paid upfront. Check when it is due and whether it is part of the tractor price.",
        "hi": "यह पहले दी जाने वाली रकम है। कब देनी है और कीमत में कैसे जुड़ती है, यह पूछें।",
    },
    "interest_rate": {
        "en": "This rate affects how much interest may be charged. Ask whether it can change and how often.",
        "hi": "इस दर से ब्याज का खर्च बदल सकता है। पूछें कि दर बदल सकती है या नहीं और कितनी बार।",
    },
    "interest_type": {
        "en": "A fixed rate is stated as unchanged; a floating rate can move under the agreement's rules. Ask what triggers a change.",
        "hi": "फिक्स्ड दर स्थिर बताई जाती है; फ्लोटिंग दर समझौते के नियमों से बदल सकती है। बदलाव कब होगा, पूछें।",
    },
    "tenure": {
        "en": "This is the stated repayment period. A longer period can mean more instalments; check the exact schedule.",
        "hi": "यह चुकाने की बताई गई अवधि है। लंबी अवधि में किस्तें ज़्यादा हो सकती हैं; पूरा समय-सारणी पूछें।",
    },
    "installment_amount": {
        "en": "This is the instalment amount stated in the document. Confirm its due date and whether it can change.",
        "hi": "यह दस्तावेज़ में लिखी किस्त है। इसकी तारीख और बदलने की शर्त पूछें।",
    },
    "total_repayment": {
        "en": "This is the total repayment amount stated by the document. Check which fees and charges it includes.",
        "hi": "यह दस्तावेज़ में लिखा कुल भुगतान है। इसमें कौन-से शुल्क शामिल हैं, यह जाँचें।",
    },
    "repayment_frequency": {
        "en": "This says how often payments are due. Match the schedule to the dates and amounts you can manage.",
        "hi": "यह बताता है कि कितनी बार भुगतान करना है। तारीखों और रकम की पूरी सूची माँगें।",
    },
    "processing_fee": {
        "en": "This is a fee for processing the loan. Ask whether it is one-time, refundable, and included in the loan.",
        "hi": "यह कर्ज़ की प्रक्रिया का शुल्क है। पूछें कि यह एक बार का है, लौटेगा या नहीं, और कर्ज़ में जुड़ा है या नहीं।",
    },
    "other_charges": {
        "en": "These are additional charges named in the document. Ask when each is charged and how it is calculated.",
        "hi": "ये दस्तावेज़ में लिखे अतिरिक्त शुल्क हैं। हर शुल्क कब और कैसे लगेगा, पूछें।",
    },
    "collateral": {
        "en": "This describes property or security mentioned for the loan. Ask exactly what is pledged and under which conditions.",
        "hi": "यह कर्ज़ के लिए बताई गई संपत्ति या सुरक्षा है। क्या गिरवी है और किन शर्तों पर, साफ़ पूछें।",
    },
    "late_payment_charges": {
        "en": "This describes charges for a late payment. Ask the exact amount, how it accrues, and how to notify the lender if delayed.",
        "hi": "यह देर से भुगतान पर शुल्क बताता है। सही रकम, यह कैसे बढ़ता है, और देर हो तो किसे बताना है पूछें।",
    },
    "prepayment_conditions": {
        "en": "This describes early repayment or foreclosure terms. Ask whether a fee applies and how the outstanding amount is calculated.",
        "hi": "यह समय से पहले चुकाने की शर्त बताता है। शुल्क लगेगा या नहीं और बाकी रकम कैसे निकलेगी, पूछें।",
    },
}


def _document_explanation_prompt(document: dict, field_id: str | None, language: str) -> str:
    if field_id in document["terms"]:
        label = _localized_document_label(field_id, language)
        return {
            "en": f"Explain this document term: {label}",
            "hi": f"इस दस्तावेज़ की शर्त समझाएँ: {label}",
        }[language]
    return {
        "en": "Explain this document and tell me what to check before signing.",
        "hi": "यह दस्तावेज़ समझाएँ और हस्ताक्षर से पहले क्या जाँचूँ, बताएँ।",
    }[language]


def _document_explanation(document: dict, field_id: str | None, language: str) -> str:
    terms = document["terms"]
    if field_id in terms:
        term = terms[field_id]
        return _document_term_answer(term, language)

    confirmed = [
        term for term in terms.values()
        if term["status"] == "confirmed" and term["value"]
    ]
    missing = [
        term for term in terms.values()
        if term["status"] == "missing" or not term["value"]
    ]
    if not confirmed:
        return {
            "en": "I could not confirm any financial terms yet. Review the extracted values first. If this is a scanned PDF, its text could not be read here. This is an explanation aid, not legal or financial advice.",
            "hi": "अभी कोई वित्तीय शर्त पक्की नहीं हुई है। पहले निकले हुए नंबर जाँचें। अगर PDF स्कैन की हुई है, तो यहाँ उसका पाठ पढ़ा नहीं जा सका। यह समझने में मदद है, कानूनी या वित्तीय सलाह नहीं।",
        }[language]
    values = "; ".join(
        f"{_localized_document_label(term['field_id'], language)}: {term['value']}"
        for term in confirmed[:5]
    )
    missing_labels = ", ".join(
        _localized_document_label(term["field_id"], language)
        for term in missing[:4]
    )
    if language == "en":
        answer = f"The confirmed terms are: {values}. The document does not clearly provide: {missing_labels or 'no other key term was flagged as missing'}. Ask the lender to explain these points and verify the full repayment schedule before signing. This is not a legal conclusion."
    else:
        answer = f"पक्की की गई शर्तें: {values}। दस्तावेज़ में साफ़ नहीं मिला: {missing_labels or 'कोई और मुख्य शर्त बाकी नहीं दिखी'}। हस्ताक्षर से पहले इन बातों को ऋणदाता से समझें और पूरा भुगतान समय-सारणी जाँचें। यह कानूनी निष्कर्ष नहीं है।"
    return answer


def _document_term_answer(term: dict, language: str) -> str:
    label = _localized_document_label(term["field_id"], language)
    if term["status"] == "missing" or not term["value"]:
        reason = term.get("issue")
        if language == "en":
            detail = f" {reason}" if reason else ""
            return f"The uploaded document does not state {label} clearly.{detail} Ask the lender to provide this term in writing. I cannot fill it in."
        detail = f" {reason}" if reason else ""
        return f"अपलोड किए दस्तावेज़ में {label} साफ़ नहीं लिखा है।{detail} ऋणदाता से यह शर्त लिखित में माँगें। मैं इसका नंबर नहीं मानूँगा।"

    value = term["value"]
    meaning = _DOCUMENT_TERM_MEANINGS.get(term["field_id"], {}).get(language, "")
    if term["status"] == "confirmed":
        status = {
            "en": "You confirmed this value.",
            "hi": "आपने इस नंबर की पुष्टि की है।",
        }[language]
    else:
        status = {
            "en": "The document mentions this, but you have not confirmed it yet.",
            "hi": "दस्तावेज़ में यह लिखा है, लेकिन आपने अभी इसकी पुष्टि नहीं की है।",
        }[language]
    source = (
        f" Page {term['page']}." if language == "en" and term.get("page")
        else f" पृष्ठ {term['page']}।" if term.get("page")
        else ""
    )
    attention = {
        "en": "Check the full clause and ask the lender about anything not stated here.",
        "hi": "पूरी शर्त पढ़ें और जो बात यहाँ नहीं लिखी, उसके बारे में ऋणदाता से पूछें।",
    }[language]
    return f"{label}: {value}. {status} {meaning} {attention}{source}"


def _answer_document_question(
    document: dict,
    extracted_text: str,
    question: str,
    language: str,
) -> str:
    normalized = question.casefold()
    if any(word in normalized for word in ("charges", "fees", "शुल्क", "फीस")):
        field_id = (
            "late_payment_charges"
            if any(word in normalized for word in ("late", "overdue", "देर", "विलंब"))
            else "processing_fee"
            if "processing" in normalized or "प्रोसेसिंग" in normalized
            else "other_charges"
        )
        return _document_term_answer(document["terms"][field_id], language)
    field_id = next(
        (
            key for key, keywords in _DOCUMENT_KEYWORDS.items()
            if any(keyword in normalized for keyword in keywords)
        ),
        None,
    )
    if field_id is None and any(word in normalized for word in (
        "repay", "repayment", "pay back", "कितना चुक", "भुगतान",
    )):
        field_id = "total_repayment"
    if field_id is not None and field_id in document["terms"]:
        return _document_term_answer(document["terms"][field_id], language)

    if any(word in normalized for word in (
        "before signing", "before i sign", "before sign", "हस्ताक्षर", "साइन", "questions to ask",
    )):
        missing = [
            _localized_document_label(term["field_id"], language)
            for term in document["terms"].values()
            if term["status"] == "missing" or not term["value"]
        ]
        if language == "en":
            return f"Ask about these terms that are missing or unclear here: {', '.join(missing)}. Request the complete repayment schedule and all charges in writing. This only points out information gaps; it does not judge the agreement."
        return f"यहाँ जो शर्तें नहीं मिलीं या साफ़ नहीं हैं, उनके बारे में पूछें: {', '.join(missing)}। पूरा भुगतान समय-सारणी और सभी शुल्क लिखित में माँगें। यह सिर्फ जानकारी की कमी दिखाता है, समझौते पर फैसला नहीं।"

    if not extracted_text.strip():
        return {
            "en": "I could not read text from this PDF. It may be scanned or image-only. Please upload a text-based PDF or ask the lender for a readable copy; I cannot answer from unread text.",
            "hi": "इस PDF से पाठ नहीं पढ़ा जा सका। यह स्कैन या सिर्फ तस्वीरों वाली हो सकती है। कृपया पाठ वाली PDF या पढ़ने योग्य प्रति लें; जो पढ़ा नहीं, उसके आधार पर मैं जवाब नहीं दूँगा।",
        }[language]
    return {
        "en": "I could not find a clear extracted term that answers that question. The document may not state it, or it may need a clearer copy. Tell me which listed term you mean, or ask the lender to clarify it in writing.",
        "hi": "इस सवाल का जवाब देने वाली साफ़ निकली हुई शर्त नहीं मिली। दस्तावेज़ में यह बात न हो, या प्रति साफ़ न हो सकती है। बताइए किस निकली हुई शर्त की बात है, या ऋणदाता से लिखित जवाब माँगें।",
    }[language]


def _document_for_screen(document: dict | None, language: str) -> dict | None:
    """The stored document with its term labels and notes in the farmer's language."""
    if not document or not isinstance(document.get("terms"), dict):
        return document
    terms = {}
    for field_id, term in document["terms"].items():
        term = dict(term)
        term["label"] = _localized_document_label(field_id, language)
        if isinstance(term.get("issue"), str):
            term["issue"] = localize(term["issue"], language)
        terms[field_id] = term
    return {**document, "terms": terms}


def _localized_document_label(field_id: str, language: str) -> str:
    labels = {
        "lender_name": ("Lender name", "ऋणदाता का नाम"),
        "tractor_price": ("Tractor price", "ट्रैक्टर की कीमत"),
        "loan_amount": ("Loan amount", "कर्ज़ की रकम"),
        "down_payment": ("Down payment", "जमा रकम"),
        "interest_rate": ("Interest rate", "ब्याज दर"),
        "interest_type": ("Rate type", "ब्याज दर का प्रकार"),
        "tenure": ("Loan tenure", "कर्ज़ की अवधि"),
        "installment_amount": ("Instalment amount", "किस्त की रकम"),
        "total_repayment": ("Total repayment", "कुल भुगतान"),
        "repayment_frequency": ("Repayment frequency", "भुगतान की अवधि"),
        "processing_fee": ("Processing fee", "प्रोसेसिंग शुल्क"),
        "other_charges": ("Other charges", "अन्य शुल्क"),
        "collateral": ("Collateral or security", "गिरवी या सुरक्षा"),
        "late_payment_charges": ("Late-payment charges", "देर से भुगतान का शुल्क"),
        "prepayment_conditions": ("Prepayment or foreclosure terms", "पहले चुकाने की शर्तें"),
    }
    return labels.get(field_id, (field_id, field_id))[{"en": 0, "hi": 1}[language]]


def _chart_labels(language: str) -> dict[str, str]:
    if language == "en":
        return {
            "borrowed": "Amount borrowed",
            "interest": "Estimated interest",
            "total": "Estimated total repayment",
            "repayment_title": "Borrowed amount and interest",
            "repayment_description": "Estimated total repayment split between the amount borrowed and interest.",
            "repayment_method": "The existing engine calculates fixed monthly payments on a reducing balance over the selected tenure.",
            "fixed_monthly": "This estimate assumes a fixed annual rate and monthly payments.",
            "no_fees": "Lender fees, insurance, and taxes are not included.",
            "normal": "No income reduction",
            "income_down": "Income down",
            "scenario_title": "Remaining amount under income scenarios",
            "scenario_description": "Engine-calculated yearly money left after costs, other loan payments, and this loan's instalment.",
            "scenario_method": "The deterministic engine changes yearly farm income by the selected percentage and calculates the remaining yearly and monthly amounts.",
            "even_income": "Yearly income is spread evenly over 12 months; seasonal payment timing is not represented.",
            "fixed_costs": "Household/farm costs and existing loan payments stay fixed in every scenario.",
            "buying": "Estimated buying outlay",
            "hiring": "Hiring spend",
            "difference": "Buying minus hiring",
            "buy_title": "Buying versus hiring",
            "buy_description": "Comparison of estimated yearly cash outlay using the engine's supported inputs.",
            "buy_method": "Buying includes the calculated monthly instalments and spreads the down payment across the tenure; hiring uses the yearly hiring spend provided.",
            "buy_exclusions": "Diesel, repairs, fees, insurance, and resale value are excluded.",
            "cash_not_recommendation": "This is a cash-outlay comparison under these inputs, not a recommendation.",
            "monthly_costs": "Household and farm costs",
            "existing_payments": "Existing loan payments",
            "loan_kist": "Loan instalment",
            "monthly_remaining": "Money remaining",
            "monthly_income": "Estimated monthly income",
            "cash_flow_title": "Monthly income allocation",
            "cash_flow_description": "Estimated monthly farm income allocated to household and farm costs, loan payments, and the remaining amount.",
            "cash_flow_method": "Yearly farm income is spread evenly over 12 months. The remainder comes from the engine's normal-income scenario.",
        }
    return {
        "borrowed": "उधार की रकम",
        "interest": "अनुमानित ब्याज",
        "total": "अनुमानित कुल भुगतान",
        "repayment_title": "उधार और ब्याज",
        "repayment_description": "कुल भुगतान में उधार की रकम और अनुमानित ब्याज का हिस्सा।",
        "repayment_method": "इंजन चुनी अवधि में घटते कर्ज़ पर तय मासिक किस्त का हिसाब करता है।",
        "fixed_monthly": "यह अनुमान तय सालाना दर और हर महीने किस्त मानता है।",
        "no_fees": "बैंक की फीस, बीमा और टैक्स इसमें शामिल नहीं हैं।",
        "normal": "कमाई में कमी नहीं",
        "income_down": "कमाई में कमी",
        "scenario_title": "कमाई के अलग हाल में बाकी रकम",
        "scenario_description": "खर्च, दूसरे कर्ज़ की किस्त और इस कर्ज़ की किस्त के बाद इंजन का सालाना हिसाब।",
        "scenario_method": "इंजन खेती की सालाना कमाई में चुनी कमी लगाकर साल और महीने में बाकी रकम निकालता है।",
        "even_income": "साल की कमाई को बारह महीनों में बराबर माना गया है; फसल बिकने का समय नहीं दिखता।",
        "fixed_costs": "घर/खेत का खर्च और पहले के कर्ज़ की किस्तें हर हाल में समान रखी जाती हैं।",
        "buying": "खरीद का अनुमानित खर्च",
        "hiring": "किराये का खर्च",
        "difference": "खरीद और किराये का अंतर",
        "buy_title": "खरीद और किराये की तुलना",
        "buy_description": "इंजन में उपलब्ध जानकारी से सालाना नकद खर्च की तुलना।",
        "buy_method": "खरीद में मासिक किस्त जोड़ी जाती है और जमा रकम को अवधि में बाँटा जाता है; किराये में बताई सालाना रकम ली जाती है।",
        "buy_exclusions": "डीज़ल, मरम्मत, फीस, बीमा और दोबारा बिक्री की कीमत शामिल नहीं है।",
        "cash_not_recommendation": "यह इन नंबरों पर नकद खर्च की तुलना है, कोई सलाह नहीं।",
        "monthly_costs": "घर और खेती का खर्च",
        "existing_payments": "पहले से चल रहे कर्ज़ की किस्तें",
        "loan_kist": "कर्ज़ की किस्त",
        "monthly_remaining": "बाकी रकम",
        "monthly_income": "अनुमानित महीने की कमाई",
        "cash_flow_title": "महीने की कमाई का हिसाब",
        "cash_flow_description": "अनुमानित मासिक खेती की कमाई में से घर/खेत का खर्च, कर्ज़ की किस्तें और बाकी रकम।",
        "cash_flow_method": "साल की खेती की कमाई को बारह महीनों में बराबर बाँटा है। बाकी रकम सामान्य कमाई के इंजन-हिसाब से है।",
    }


def _context_value(context: dict, key: str) -> dict | None:
    return next(
        (item for item in context.get("data", []) if item.get("id") == key),
        None,
    )


def _explain_chart_question(context: dict, question: str, language: str) -> str:
    mode = context["explanation_mode"]
    chart_id = context["chart_id"]
    normalized_question = question.casefold().strip().strip(" ?!.।")
    if normalized_question in {
        "why",
        "what",
        "how",
        "how much",
        "क्यों",
        "क्या",
        "कितना",
        "कैसे",
    }:
        if chart_id == "repayment_breakdown":
            return (
                "Are you asking about the amount borrowed, the interest, or the total repayment?"
                if language == "en"
                else "क्या आप उधार की रकम, ब्याज, या कुल भुगतान के बारे में पूछ रहे हैं?"
            )
        if chart_id == "income_scenarios":
            return (
                "Are you asking about a particular income scenario, the money left, or the instalment?"
                if language == "en"
                else "क्या आप किसी खास कमाई के हाल, बची रकम, या किस्त के बारे में पूछ रहे हैं?"
            )
        if chart_id == "cash_flow":
            return (
                "Are you asking about income, household and farm costs, loan payments, or what remains?"
                if language == "en"
                else "क्या आप कमाई, घर-खेत के खर्च, कर्ज़ की किस्तों या बाकी रकम के बारे में पूछ रहे हैं?"
            )
        return (
            "Are you asking about buying, hiring, or the difference between the two estimates?"
            if language == "en"
            else "क्या आप खरीद, किराये, या दोनों के अंतर के बारे में पूछ रहे हैं?"
        )
    selected_point = context.get("selected_point")
    selected = _context_value(context, selected_point) if selected_point else None
    statuses = context.get("input_statuses", {})
    relevant_inputs = {
        "asset_price",
        "down_payment",
        "yearly_interest_rate_percent",
        "tenure_years",
        "yearly_farm_income",
        "monthly_costs",
        "monthly_existing_loan_payments",
    }
    if chart_id == "buy_hire":
        relevant_inputs.add("yearly_hiring_spend")
    uncertain = [
        name
        for name, item in statuses.items()
        if name in relevant_inputs and item.get("status") in ("assumed", "missing")
    ]

    if chart_id == "repayment_breakdown":
        loan = _context_value(context, "loan_amount")["value"]
        interest = _context_value(context, "total_interest")["value"]
        total = _context_value(context, "total_repayment")["value"]
        if language == "en":
            focus = (
                f"The selected part, {selected['label']}, is {format_rupees(selected['value'])} rupees. "
                if selected
                else ""
            )
            reply = (
                f"This chart splits the estimated {format_rupees(total)} rupees paid over the loan. "
                f"About {format_rupees(loan)} rupees is the amount borrowed, and "
                f"{format_rupees(interest)} rupees is estimated interest. "
                f"{focus}{context['methodology']}"
            )
            if mode == "detailed":
                reply += (
                    f" The yearly rate is {context['input_statuses'].get('yearly_interest_rate_percent', {}).get('value')} percent "
                    f"over {context['input_statuses'].get('tenure_years', {}).get('value')} years. "
                    "The engine uses a fixed monthly instalment on a reducing balance."
                )
            reply += f" {context['limitations'][1]}"
        else:
            focus = (
                f"आपने {selected['label']} वाला हिस्सा चुना है। इसकी रकम {format_rupees(selected['value'])} रुपये है। "
                if selected
                else ""
            )
            reply = (
                f"यह चार्ट कर्ज़ में कुल {format_rupees(total)} रुपये का अनुमान दिखाता है। "
                f"इसमें {format_rupees(loan)} रुपये उधार की रकम और "
                f"{format_rupees(interest)} रुपये अनुमानित ब्याज है। "
                f"{focus}{context['methodology']} {context['limitations'][1]}"
            )
            if mode == "detailed":
                rate = statuses.get("yearly_interest_rate_percent", {}).get("value")
                tenure = statuses.get("tenure_years", {}).get("value")
                reply += f" इसमें सालाना दर {rate} प्रतिशत और अवधि {tenure} साल रखी गई है।"
    elif chart_id == "cash_flow":
        data = {str(item["id"]): item for item in context.get("data", [])}
        income = float(data["monthly_income"]["value"])
        costs = float(data["monthly_costs"]["value"])
        existing = float(data["existing_loan_payments"]["value"])
        kist = float(data["loan_kist"]["value"])
        remaining = float(data["monthly_remaining"]["value"])
        if language == "en":
            reply = (
                f"This chart starts with estimated monthly income of {format_rupees(income)} rupees. "
                f"Household and farm costs are {format_rupees(costs)}, existing loan payments are "
                f"{format_rupees(existing)}, and the loan instalment is {format_rupees(kist)} rupees. "
                f"The engine estimates {format_rupees(max(0, remaining))} rupees remain after these amounts. "
                "This helps show how much room may be left for other needs."
            )
            if selected:
                reply += f" The selected item, {selected['label']}, is {format_rupees(selected['value'])} rupees."
            reply += f" {context['methodology']} {context['limitations'][0]}"
            if mode == "detailed":
                rate = statuses.get("yearly_interest_rate_percent", {}).get("value")
                reply += f" The estimate uses the provided yearly farm income and a {rate}% yearly rate."
        else:
            reply = (
                f"यह चार्ट महीने की अनुमानित {format_rupees(income)} रुपये की कमाई से शुरू होता है। "
                f"घर और खेत का खर्च {format_rupees(costs)} रुपये, पुराने कर्ज़ की किस्तें "
                f"{format_rupees(existing)} रुपये और कर्ज़ की किस्त {format_rupees(kist)} रुपये है। "
                f"इंजन के हिसाब से इसके बाद {format_rupees(max(0, remaining))} रुपये बचते हैं। "
                "इससे समझ आता है कि बाकी ज़रूरतों के लिए कितनी जगह रह सकती है।"
            )
            if selected:
                reply += f" आपने {selected['label']} चुना है: {format_rupees(selected['value'])} रुपये।"
            reply += f" {context['methodology']} {context['limitations'][0]}"
            if mode == "detailed":
                rate = statuses.get("yearly_interest_rate_percent", {}).get("value")
                reply += f" इसमें सालाना खेती की कमाई और {rate} प्रतिशत सालाना दर रखी गई है।"
    elif chart_id == "income_scenarios":
        rows = context.get("data", [])
        baseline = next((item for item in rows if item["income_drop_percent"] == 0), None)
        chosen = next(
            (
                item for item in rows
                if item["income_drop_percent"] == context.get("selected_scenario")
            ),
            None,
        )
        shown = selected or chosen
        if language == "en":
            row_text = " ".join(
                f"{item['label']}: {format_rupees(abs(item['yearly_money_left']))} rupees "
                f"{'shortfall' if item['yearly_money_left'] < 0 else 'left'}."
                for item in rows
            )
            focus = (
                f"The selected scenario is {shown['label']}: "
                f"{format_rupees(abs(shown['yearly_money_left']))} rupees "
                f"{'shortfall' if shown['yearly_money_left'] < 0 else 'left'} for the year. "
                if shown
                else ""
            )
            delta = ""
            if baseline and shown and shown is not baseline:
                difference = baseline["yearly_money_left"] - shown["yearly_money_left"]
                delta = f" That is {format_rupees(abs(difference))} rupees less remaining than the no-drop estimate. "
            reply = (
                f"This chart compares yearly money after the listed costs and loan payments. "
                f"{row_text} {focus}{delta}{context['methodology']} "
                f"{context['limitations'][0]} {context['limitations'][1]}"
            )
            if mode == "detailed":
                rate = statuses.get("yearly_interest_rate_percent", {}).get("value")
                costs = statuses.get("monthly_costs", {}).get("value")
                other_payments = statuses.get("monthly_existing_loan_payments", {}).get("value")
                reply += (
                    f" The estimate uses a {rate} percent yearly rate, "
                    f"{format_rupees(costs)} rupees in monthly costs, and "
                    f"{format_rupees(other_payments)} rupees in existing monthly payments. "
                    "The engine treats yearly farm income as evenly spread across 12 months."
                )
        else:
            row_text = " ".join(
                f"{item['label']} में "
                f"{format_rupees(abs(item['yearly_money_left']))} रुपये "
                f"{'की कमी' if item['yearly_money_left'] < 0 else 'बाकी'} रहती है।"
                for item in rows
            )
            focus = (
                f"चुने हुए हाल, {shown['label']} में, साल के "
                f"{format_rupees(abs(shown['yearly_money_left']))} रुपये "
                f"{'कम पड़ने का' if shown['yearly_money_left'] < 0 else 'बाकी रहने का'} अनुमान है। "
                if shown
                else ""
            )
            delta = ""
            if baseline and shown and shown is not baseline:
                difference = baseline["yearly_money_left"] - shown["yearly_money_left"]
                delta = f"बिना कमी वाले हिसाब से {format_rupees(abs(difference))} रुपये कम बचते हैं। "
            reply = (
                f"यह चार्ट खर्च और कर्ज़ की किस्तों के बाद साल में बची रकम की तुलना करता है। "
                f"{row_text} {focus}{delta}{context['methodology']} "
                f"{context['limitations'][0]} {context['limitations'][1]}"
            )
            if mode == "detailed":
                rate = statuses.get("yearly_interest_rate_percent", {}).get("value")
                costs = statuses.get("monthly_costs", {}).get("value")
                other_payments = statuses.get("monthly_existing_loan_payments", {}).get("value")
                reply += (
                    f" सालाना ब्याज दर {rate} प्रतिशत है। घर और खेत का महीना खर्च "
                    f"{format_rupees(costs)} रुपये और पहले के कर्ज़ की किस्त "
                    f"{format_rupees(other_payments)} रुपये रखी गई है।"
                )
    else:
        buy = _context_value(context, "buying")["value"]
        hiring = _context_value(context, "hiring")["value"]
        difference = _context_value(context, "difference")["value"]
        lower = _context_value(context, "lower_cash_outlay")["label"]
        if language == "en":
            focus = f"The selected bar is {selected['label']}: {format_rupees(selected['value'])} rupees per year. " if selected and selected.get("value") is not None else ""
            comparison = (
                "The estimate has lower buying cash outlay."
                if lower == "buying"
                else "The estimate has lower hiring cash outlay."
                if lower == "hiring"
                else "The two estimated outlays are about equal."
            )
            reply = (
                f"This chart compares {format_rupees(buy)} rupees per year for buying with "
                f"{format_rupees(hiring)} rupees per year for hiring. "
                f"The difference is {format_rupees(abs(difference))} rupees per year. "
                f"{focus}{comparison} {context['methodology']} {context['limitations'][0]} "
                f"{context['limitations'][1]}"
            )
            if mode == "detailed":
                tenure = statuses.get("tenure_years", {}).get("value")
                reply += (
                    f" The selected loan duration is {tenure} years; this chart compares annual outlay "
                    "and does not total it across the duration."
                )
        else:
            focus = f"आपने {selected['label']} वाला बार चुना है: साल में {format_rupees(selected['value'])} रुपये। " if selected and selected.get("value") is not None else ""
            comparison = (
                "इस हिसाब में खरीद का नकद खर्च कम है।"
                if lower == "buying"
                else "इस हिसाब में किराये का नकद खर्च कम है।"
                if lower == "hiring"
                else "दोनों खर्च इस अनुमान में लगभग बराबर हैं।"
            )
            reply = (
                f"इस चार्ट में खरीद का अनुमान {format_rupees(buy)} रुपये सालाना और "
                f"किराये का खर्च {format_rupees(hiring)} रुपये सालाना है। "
                f"दोनों में {format_rupees(abs(difference))} रुपये सालाना का अंतर है। "
                f"{focus}{comparison} {context['methodology']} {context['limitations'][0]} "
                f"{context['limitations'][1]}"
            )
            if mode == "detailed":
                tenure = statuses.get("tenure_years", {}).get("value")
                reply += (
                    f" चुनी कर्ज़ अवधि {tenure} साल है। यह चार्ट सालाना खर्च दिखाता है, "
                    "पूरी अवधि का जोड़ नहीं।"
                )

    if uncertain:
        if language == "en":
            reply += " Some inputs are estimates or missing; check the input labels before relying on this result."
        else:
            reply += " कुछ जानकारी अनुमान है या बाकी है। भरोसा करने से पहले नंबरों के पास लिखी स्थिति देख लें।"
    if question.strip().casefold() in {"continue", "जारी रखें", "आगे बताइए"}:
        if language == "en":
            reply = f"Continuing the explanation of {context['title']}. {reply}"
        else:
            reply = f"{context['title']} की बात आगे बताते हैं। {reply}"
    return reply



def _prepare_chart_speech(session: _Session, response: str) -> None:
    session.latest_speech = []
    session.speech_error = None
    if session.input_mode == "chat":
        return
    language_code = {"hi": "hi-IN", "en": "en-IN"}[session.language]
    clips: list[SpeechClip] = []
    try:
        for label, speech_text in [
            ("Chart explanation", chunk)
            for chunk in _split_sentences(response, max_sentences=2)
        ]:
            spoken_text = numbers_to_spoken_words(speech_text, session.language)
            audio = speak(
                spoken_text,
                language=language_code,
                speed=session.speech_speed,
            )
            clips.append(
                SpeechClip(
                    label=localize(label, session.language),
                    text=spoken_text,
                    audio_base64=base64.b64encode(audio).decode("ascii"),
                )
            )
    except GnaniAPIError as exc:
        session.speech_error = _friendly_speech_error(exc, session.language)
        return
    session.latest_speech = clips


def _split_sentences(text: str, max_sentences: int = 2) -> list[str]:
    sentences = [
        sentence.strip()
        for sentence in _SPEECH_SPLIT_RE.split(text)
        if sentence.strip()
    ]
    if not sentences:
        return []
    return [
        " ".join(sentences[index:index + max_sentences])
        for index in range(0, len(sentences), max_sentences)
    ]


def _friendly_speech_error(
    error: GnaniAPIError,
    language: Literal["hi", "en"],
) -> str:
    messages = {
        "hi": {
            401: "आवाज़ सेवा की कुंजी काम नहीं कर रही। लिखकर बातचीत जारी रखें।",
            402: "आवाज़ सेवा का बैलेंस कम है। जवाब स्क्रीन पर उपलब्ध है।",
            403: "आवाज़ सेवा की अनुमति उपलब्ध नहीं है। जवाब स्क्रीन पर उपलब्ध है।",
            429: "आवाज़ सेवा अभी व्यस्त है। जवाब स्क्रीन पर उपलब्ध है।",
            500: "आवाज़ सेवा अभी उपलब्ध नहीं है। जवाब स्क्रीन पर उपलब्ध है।",
        },
        "en": {
            401: "The voice service key is not working. Continue by typing.",
            402: "The voice service has insufficient credit. The answer remains on screen.",
            403: "The voice service is not enabled for this key. The answer remains on screen.",
            429: "The voice service is busy. The answer remains on screen.",
            500: "The voice service is temporarily unavailable. The answer remains on screen.",
        },
    }
    special = _voice_setup_problem(error, language)
    if special:
        return special
    if error.status_code in messages[language]:
        return messages[language][error.status_code]
    return {
        "hi": "अभी आवाज़ नहीं बन पाई। जवाब स्क्रीन पर उपलब्ध है।",
        "en": "Audio could not be generated. The answer remains on screen.",
    }[language]


def _voice_setup_problem(error: GnaniAPIError, language: Literal["hi", "en"]) -> str | None:
    """Say plainly when the problem is the setup on this computer, not the farmer's speech."""
    text = str(error).casefold()
    if "api key is missing" in text:
        return {
            "hi": "आवाज़ की कुंजी नहीं मिली। प्रोजेक्ट फ़ोल्डर में .env फ़ाइल बनाकर GNANI_API_KEY=... लिखें, फिर ऐप दोबारा चालू करें।",
            "en": "The voice key was not found. Create a .env file in the project folder with GNANI_API_KEY=... and restart the app.",
        }[language]
    if "could not connect" in text or "timed out" in text:
        return {
            "hi": "आवाज़ सेवा तक इंटरनेट से पहुँच नहीं हो पाई। कनेक्शन जाँचें।",
            "en": "Could not reach the voice service. Check the internet connection.",
        }[language]
    return None


def _prepare_speech(session: _Session, previous_state: str, response: str) -> None:
    session.latest_speech = []
    session.speech_error = None
    agent = session.agent
    if agent is None or session.input_mode == "chat":
        return  # typing mode: replies stay as text and no voice credit is spent

    language_code = {"hi": "hi-IN", "en": "en-IN"}[session.language]
    clips: list[SpeechClip] = []
    try:
        for label, speech_text in _speech_parts(agent, previous_state, response):
            spoken_text = numbers_to_spoken_words(speech_text, session.language)
            audio = speak(spoken_text, language=language_code, speed=session.speech_speed)
            clips.append(
                SpeechClip(
                    label=localize(label, session.language),
                    text=spoken_text,
                    audio_base64=base64.b64encode(audio).decode("ascii"),
                )
            )
    except GnaniAPIError as exc:
        session.speech_error = _friendly_speech_error(exc, session.language)
        return
    session.latest_speech = clips


def _read_wav_recording(upload: UploadFile) -> bytes:
    if upload.filename is None or not upload.filename.casefold().endswith(".wav"):
        raise HTTPException(
            status_code=415,
            detail="इस रिकॉर्डिंग का फ़ॉर्मैट WAV नहीं है। कृपया फिर से रिकॉर्ड करें।",
        )
    if upload.content_type not in ("audio/wav", "audio/x-wav", "audio/wave"):
        raise HTTPException(
            status_code=415,
            detail="इस रिकॉर्डिंग का फ़ॉर्मैट समर्थित नहीं है। कृपया WAV में रिकॉर्ड करें।",
        )

    payload = upload.file.read(MAX_RECORDING_BYTES + 1)
    if len(payload) > MAX_RECORDING_BYTES:
        raise HTTPException(
            status_code=413,
            detail="रिकॉर्डिंग बहुत बड़ी है। कृपया तीस सेकंड से छोटी रिकॉर्डिंग करें।",
        )
    if not payload:
        raise HTTPException(status_code=422, detail="रिकॉर्डिंग खाली है। कृपया फिर बोलें।")

    try:
        with wave.open(io.BytesIO(payload), "rb") as wav_file:
            rate = wav_file.getframerate()
            duration = wav_file.getnframes() / rate if rate else 0
            if (
                wav_file.getnchannels() != 1
                or wav_file.getsampwidth() != 2
                or not 8_000 <= rate <= 44_100
            ):
                raise HTTPException(
                    status_code=415,
                    detail="WAV रिकॉर्डिंग की ऑडियो सेटिंग समर्थित नहीं है।",
                )
            if duration <= 0 or duration > MAX_RECORDING_SECONDS:
                raise HTTPException(
                    status_code=422,
                    detail="रिकॉर्डिंग तीस सेकंड तक की होनी चाहिए।",
                )
    except (wave.Error, EOFError) as exc:
        raise HTTPException(
            status_code=415,
            detail="रिकॉर्डिंग पढ़ी नहीं जा सकी। कृपया फिर से रिकॉर्ड करें।",
        ) from exc
    return payload


@app.post(
    "/api/sessions/{session_id}/transcribe",
    response_model=TranscriptionResponse,
)
def transcribe_recording(
    session_id: str,
    audio_file: UploadFile = File(...),
) -> TranscriptionResponse:
    session = _session_or_404(session_id)
    selected_language = {
        "hi": "hi-IN",
        "en": "en-IN",
    }[session.language]
    payload = _read_wav_recording(audio_file)
    try:
        transcript = transcribe(payload, language_code=selected_language)
    except GnaniAPIError as exc:
        raise HTTPException(
            status_code=502,
            detail=_friendly_transcription_error(exc, session.language),
        ) from exc
    if not transcript.strip():
        raise HTTPException(
            status_code=422,
            detail="बात साफ़ सुनाई नहीं दी। कृपया फिर बोलें या लिखकर बताइए।",
        )
    return TranscriptionResponse(
        transcript=transcript,
        language_code=selected_language,
    )


def _friendly_transcription_error(error: GnaniAPIError, language: Literal["hi", "en"] = "hi") -> str:
    special = _voice_setup_problem(error, language)
    if special:
        return special
    if language == "en":
        english = {
            401: "The voice key is not working. Continue by typing.",
            402: "The voice service has no credit left. Continue by typing.",
            403: "The voice service is not enabled for this key. Continue by typing.",
            429: "The voice service is busy. Try again in a moment or type.",
            500: "The voice service is unavailable. Try again later or type.",
        }
        return english.get(error.status_code or 0, "Could not understand the recording. Please speak again or type.")
    messages = {
        401: "आवाज़ सेवा की कुंजी काम नहीं कर रही। लिखकर बातचीत जारी रखें।",
        402: "आवाज़ सेवा का बैलेंस कम है। लिखकर बातचीत जारी रखें।",
        403: "आवाज़ सेवा की अनुमति उपलब्ध नहीं है। लिखकर बातचीत जारी रखें।",
        429: "आवाज़ सेवा अभी व्यस्त है। थोड़ी देर बाद कोशिश करें या लिखें।",
        500: "आवाज़ सेवा अभी उपलब्ध नहीं है। थोड़ी देर बाद कोशिश करें या लिखें।",
    }
    if error.status_code in messages:
        return messages[error.status_code]
    return "रिकॉर्डिंग समझ नहीं आई। कृपया फिर बोलें या लिखकर बताइए।"


# Serve the built React app from the same port as the API (one command to run everything).
# Mounted last so every /api route above takes priority.
_FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
