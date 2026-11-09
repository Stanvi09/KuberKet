from fastapi.testclient import TestClient
from io import BytesIO
import pytest
import wave
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

import api
from conversation_agent import ConversationAgent, SlotValue
from gnani_client import GnaniAPIError


client = TestClient(api.app)


@pytest.fixture(autouse=True)
def mock_timbre(monkeypatch):
    monkeypatch.setattr(api, "speak", lambda text, *, language, speed=1.0: b"test-wav")


def setup_function() -> None:
    api._sessions.clear()


def _pdf_document(*page_lines: list[str], encrypted: bool = False) -> bytes:
    writer = PdfWriter()
    for lines in page_lines:
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject({
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        })
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})
        })
        escaped = [
            line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            for line in lines
        ]
        commands = "BT /F1 12 Tf 72 720 Td " + " T* ".join(
            f"({line}) Tj" for line in escaped
        ) + " ET"
        stream = DecodedStreamObject()
        stream.set_data(commands.encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("secret")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def _upload_pdf(session_id: str, payload: bytes, filename: str = "loan.pdf"):
    return client.post(
        f"/api/sessions/{session_id}/documents/upload",
        files={"upload": (filename, payload, "application/pdf")},
    )


def test_session_keeps_conversation_when_section_changes() -> None:
    created = client.post("/api/sessions")
    assert created.status_code == 200
    session_id = created.json()["session_id"]

    started = client.post(f"/api/sessions/{session_id}/conversation/start")
    assert started.status_code == 200
    assert started.json()["messages"][0]["role"] == "assistant"

    updated = client.patch(
        f"/api/sessions/{session_id}",
        json={"section": "documents"},
    )
    assert updated.status_code == 200
    state = updated.json()
    assert state["section"] == "documents"
    assert state["messages"] == started.json()["messages"]


def test_document_upload_extracts_terms_and_page_sources() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    pdf = _pdf_document([
        "Lender: Example Bank",
        "Loan amount: INR 600,000",
        "Down payment: INR 100,000",
        "Interest rate: 10%",
        "Rate type: fixed",
        "Loan tenure: 5 years",
        "EMI: INR 12,000",
        "Processing fee: INR 500",
    ])

    response = _upload_pdf(session_id, pdf)

    assert response.status_code == 200
    state = response.json()
    assert state["section"] == "documents"
    assert state["document"]["filename"] == "loan.pdf"
    assert state["document"]["page_count"] == 1
    assert state["document"]["scanned_only"] is False
    loan_amount = state["document"]["terms"]["loan_amount"]
    assert loan_amount["value"] == "600,000"
    assert loan_amount["status"] == "found"
    assert loan_amount["origin"] == "document"
    assert loan_amount["page"] == 1
    assert "Loan amount: INR 600,000" in loan_amount["source"]
    assert state["document"]["terms"]["interest_rate"]["status"] == "found"
    assert state["document"]["terms"]["interest_type"]["status"] == "found"
    assert state["document"]["terms"]["late_payment_charges"]["status"] == "missing"


@pytest.mark.parametrize(
    ("filename", "content_type", "payload", "status"),
    [
        ("loan.txt", "text/plain", b"not a pdf", 415),
        ("loan.pdf", "application/pdf", b"not a pdf", 422),
        ("loan.pdf", "application/pdf", b"", 422),
        ("loan.pdf", "application/pdf", b"%PDF-" + b"0" * (10 * 1024 * 1024), 413),
    ],
)
def test_document_upload_rejects_unsupported_malformed_empty_and_oversized_files(
    filename: str,
    content_type: str,
    payload: bytes,
    status: int,
) -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    response = client.post(
        f"/api/sessions/{session_id}/documents/upload",
        files={"upload": (filename, payload, content_type)},
    )
    assert response.status_code == status
    assert client.get(f"/api/sessions/{session_id}").json()["document"] is None


def test_document_upload_reports_scanned_pdfs_without_claiming_extraction() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    response = _upload_pdf(session_id, _pdf_document([]))

    assert response.status_code == 200
    document = response.json()["document"]
    assert document["scanned_only"] is True
    assert document["terms"]["loan_amount"]["status"] == "missing"
    assert document["terms"]["interest_rate"]["value"] is None


def test_document_upload_reports_encrypted_pdfs_as_unreadable() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    response = _upload_pdf(
        session_id,
        _pdf_document(["Loan amount: INR 600,000"], encrypted=True),
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "यह PDF लॉक है। बिना लॉक वाली प्रति अपलोड करें।"


def test_document_extraction_marks_conflicting_values_ambiguous() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    response = _upload_pdf(
        session_id,
        _pdf_document(["Interest rate: 10%", "Interest rate: 12%"]),
    )
    term = response.json()["document"]["terms"]["interest_rate"]
    assert term["status"] == "missing"
    assert term["value"] is None
    assert term["issue"] == "एक से ज़्यादा नंबर लिखे हैं; सही नंबर साफ़ नहीं है।"


def test_document_terms_require_farmer_confirmation_and_allow_correction() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    _upload_pdf(session_id, _pdf_document(["Interest rate: 10%"]))

    corrected = client.patch(
        f"/api/sessions/{session_id}/documents/terms",
        json={"updates": [{"field_id": "interest_rate", "value": "11%", "confirmed": False}]},
    ).json()["document"]["terms"]["interest_rate"]
    assert corrected["value"] == "11%"
    assert corrected["status"] == "found"
    assert corrected["origin"] == "farmer"
    assert corrected["page"] is None

    confirmed = client.patch(
        f"/api/sessions/{session_id}/documents/terms",
        json={"updates": [{"field_id": "interest_rate", "value": "11%", "confirmed": True}]},
    ).json()["document"]["terms"]["interest_rate"]
    assert confirmed["value"] == "11%"
    assert confirmed["status"] == "confirmed"
    assert confirmed["origin"] == "farmer"


def test_document_explanations_and_questions_use_extracted_terms_and_language() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    client.patch(f"/api/sessions/{session_id}", json={"language": "en"})
    _upload_pdf(
        session_id,
        _pdf_document(["Interest rate: 10%", "EMI: INR 12,000"]),
    )
    response = client.post(
        f"/api/sessions/{session_id}/documents/explain",
        json={"field_id": "interest_rate"},
    )
    state = response.json()
    assert state["messages"][-2]["role"] == "farmer"
    assert state["messages"][-1]["role"] == "assistant"
    assert "10%" in state["messages"][-1]["text"]
    assert "Page 1" in state["messages"][-1]["text"]
    assert state["latest_speech"][0]["audio_base64"] == "dGVzdC13YXY="



def test_document_questions_cannot_make_up_missing_repayment_or_late_terms() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    client.patch(f"/api/sessions/{session_id}", json={"language": "en"})
    _upload_pdf(session_id, _pdf_document(["Loan amount: INR 600,000"]))

    repayment = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "How much will I actually repay?"},
    ).json()["messages"][-1]["text"]
    assert "does not state Total repayment clearly" in repayment
    assert "₹" not in repayment

    late = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "What happens if I pay late?"},
    ).json()["messages"][-1]["text"]
    assert "does not state Late-payment charges clearly" in late


def test_document_transfer_requires_confirmation_and_preserves_unselected_values() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    prior = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(
            asset_price=500_000,
            down_payment=20_000,
            yearly_interest_rate_percent=8,
            tenure_years=5,
        ),
    ).json()
    upload = _upload_pdf(
        session_id,
        _pdf_document([
            "Tractor price: INR 700,000",
            "Down payment: INR 50,000",
            "Interest rate: 12%",
            "Loan tenure: 6 years",
        ]),
    )
    assert upload.status_code == 200
    client.patch(
        f"/api/sessions/{session_id}/documents/terms",
        json={"updates": [
            {"field_id": "tractor_price", "value": "700,000", "confirmed": True},
            {"field_id": "down_payment", "value": "50,000", "confirmed": True},
            {"field_id": "interest_rate", "value": "12%", "confirmed": True},
            {"field_id": "tenure", "value": "6 years", "confirmed": True},
        ]},
    )

    blocked = client.post(
        f"/api/sessions/{session_id}/documents/transfer",
        json={"field_ids": ["tractor_price"]},
    )
    assert blocked.status_code == 409
    unchanged = client.get(f"/api/sessions/{session_id}").json()
    assert unchanged["numbers_inputs"]["asset_price"]["value"] == 500_000
    assert unchanged["numbers_result"] == prior["numbers_result"]

    transferred = client.post(
        f"/api/sessions/{session_id}/documents/transfer",
        json={
            "field_ids": ["tractor_price", "interest_rate"],
            "overwrite_approved": ["tractor_price", "interest_rate"],
        },
    ).json()
    assert transferred["section"] == "numbers"
    assert transferred["numbers_inputs"]["asset_price"] == {
        "value": 700_000,
        "status": "given",
        "source": "document",
    }
    assert transferred["numbers_inputs"]["yearly_farm_income"]["value"] == 600_000
    assert transferred["numbers_inputs"]["yearly_farm_income"]["source"] == "manual"
    assert transferred["numbers_result"] is not None


def test_document_transfer_does_not_calculate_when_required_inputs_are_missing() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    _upload_pdf(
        session_id,
        _pdf_document(["Interest rate: 10%", "Loan tenure: 5 years"]),
    )
    client.patch(
        f"/api/sessions/{session_id}/documents/terms",
        json={"updates": [
            {"field_id": "interest_rate", "value": "10%", "confirmed": True},
            {"field_id": "tenure", "value": "5 years", "confirmed": True},
        ]},
    )

    response = client.post(
        f"/api/sessions/{session_id}/documents/transfer",
        json={"field_ids": ["interest_rate", "tenure"]},
    )
    assert response.status_code == 200
    assert response.json()["numbers_result"] is None
    assert response.json()["numbers_inputs"]["yearly_interest_rate_percent"]["source"] == "document"
    assert response.json()["numbers_inputs"]["asset_price"]["value"] is None


def test_removing_document_clears_session_document_context_and_text() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    _upload_pdf(session_id, _pdf_document(["Loan amount: INR 600,000"]))

    response = client.delete(f"/api/sessions/{session_id}/documents")

    assert response.status_code == 200
    assert response.json()["document"] is None
    assert api._sessions[session_id].document_text == ""


def test_message_turn_uses_existing_deterministic_agent() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "मुझे tractor loan समझना है"},
    )

    assert response.status_code == 200
    state = response.json()
    assert state["conversation_state"] == "collecting"
    assert state["current_prompt"]
    assert state["messages"][-2]["role"] == "farmer"
    assert state["messages"][-1]["role"] == "assistant"


def test_snapshot_distinguishes_unconfirmed_candidate_from_given_slot() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    client.post(f"/api/sessions/{session_id}/conversation/start")

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "600000"},
    )

    assert response.status_code == 200
    state = response.json()
    assert state["current_slot"] == "asset_price"
    assert state["awaiting_confirmation"] == {
        "slot": "asset_price",
        "value": 600000,
    }
    assert state["slots"]["asset_price"] == {"value": None, "status": "missing"}


def _numbers_request(**changes):
    inputs = {
        "asset_price": 500_000,
        "down_payment": 0,
        "yearly_interest_rate_percent": 10,
        "tenure_years": 5,
        "yearly_farm_income": 600_000,
        "monthly_costs": 20_000,
        "monthly_existing_loan_payments": 2_000,
        "yearly_hiring_spend": 180_000,
    }
    inputs.update(changes)
    return {
        "inputs": inputs,
        "input_statuses": {
            name: "given" if value is not None else "missing"
            for name, value in inputs.items()
        },
        "income_drop_percent": 30,
    }


def test_numbers_calculation_uses_engine_and_persists_shared_session_context() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]

    response = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )

    assert response.status_code == 200
    state = response.json()
    assert state["numbers_workspace_active"] is True
    assert state["numbers_result"]["monthly_kist"] == pytest.approx(10_624, abs=1)
    assert [row["income_drop_percent"] for row in state["numbers_result"]["scenarios"]] == [
        0,
        25,
        40,
        30,
    ]
    assert state["numbers_result"]["buy_rent_comparison"]["yearly_hiring_spend"] == 180_000
    assert state["numbers_inputs"]["asset_price"] == {
        "value": 500_000,
        "status": "given",
        "source": "manual",
    }
    persisted = client.get(f"/api/sessions/{session_id}").json()
    assert persisted["numbers_result"] == state["numbers_result"]
    assert persisted["conversation_state"] == "not_started"
    assert persisted["messages"] == []


def test_numbers_calculation_does_not_replace_missing_inputs_with_zero() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    request = _numbers_request(
        asset_price=None,
        down_payment=None,
        yearly_interest_rate_percent=None,
        tenure_years=None,
        yearly_farm_income=None,
        monthly_costs=None,
        monthly_existing_loan_payments=None,
        yearly_hiring_spend=None,
    )

    response = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=request,
    )

    assert response.status_code == 200
    state = response.json()
    assert state["numbers_result"] is None
    assert state["numbers_inputs"]["asset_price"] == {
        "value": None,
        "status": "missing",
        "source": None,
    }
    assert state["numbers_workspace_active"] is True


def test_numbers_calculation_rejects_invalid_values_without_saving_them() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    request = _numbers_request(down_payment=500_000)

    response = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=request,
    )

    assert response.status_code == 422
    # The session is in Hindi, so the engine's message arrives in Hindi.
    assert response.json()["detail"] == "शुरुआती भुगतान कीमत से कम होना चाहिए।"
    state = client.get(f"/api/sessions/{session_id}").json()
    assert state["numbers_workspace_active"] is False
    assert state["numbers_result"] is None


def test_numbers_calculation_rejects_unsupported_input_fields() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    request = _numbers_request()
    request["inputs"]["maintenance_cost"] = 10_000
    request["input_statuses"]["maintenance_cost"] = "assumed"

    response = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=request,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "यह जानकारी समर्थित नहीं है: maintenance_cost।"


def test_numbers_calculation_carries_forward_home_values_without_mutating_them() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    agent = ConversationAgent()
    home_values = {
        "asset_price": 500_000,
        "down_payment": 0,
        "yearly_interest_rate_percent": 10,
        "tenure_years": 5,
        "yearly_farm_income": 600_000,
        "monthly_costs": 20_000,
        "monthly_existing_loan_payments": 2_000,
    }
    for name, value in home_values.items():
        agent.slots[name] = SlotValue(value, "given")
    api._sessions[session_id].agent = agent

    response = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json={
            "inputs": {"yearly_interest_rate_percent": 12},
            "input_statuses": {"yearly_interest_rate_percent": "assumed"},
            "income_drop_percent": 20,
        },
    )

    assert response.status_code == 200
    state = response.json()
    assert state["numbers_inputs"]["asset_price"] == {
        "value": 500_000,
        "status": "given",
        "source": "conversation",
    }
    assert state["numbers_inputs"]["yearly_interest_rate_percent"] == {
        "value": 12,
        "status": "assumed",
        "source": "manual",
    }
    assert state["numbers_result"]["yearly_interest_rate_percent"] == 12
    assert agent.slots["yearly_interest_rate_percent"] == SlotValue(10, "given")


@pytest.mark.parametrize(
    ("language", "expected_title", "expected_reply"),
    [
        ("hi", "उधार और ब्याज", "5,00,000"),
        ("en", "Borrowed amount and interest", "5,00,000"),
    ],
)
def test_chart_question_uses_backend_values_and_selected_language(
    language: str,
    expected_title: str,
    expected_reply: str,
) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    api._sessions[session_id].language = language
    calculated = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )
    assert calculated.status_code == 200
    context_response = client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={
            "chart_id": "repayment_breakdown",
            "selected_point": "loan_amount",
            "explanation_mode": "detailed",
            "speech_speed": 0.9,
        },
    )

    assert context_response.status_code == 200
    state = context_response.json()
    assert state["chart_context"]["title"] == expected_title
    assert state["chart_context"]["data"][0]["value"] == 500_000
    assert state["chart_context"]["input_statuses"]["asset_price"]["status"] == "given"
    assert state["chart_context"]["explanation_mode"] == "detailed"
    assert state["chart_context"]["speech_speed"] == 0.9

    reply = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "Explain this chart"},
    )
    assert reply.status_code == 200
    state = reply.json()
    assert expected_reply in state["messages"][-1]["text"]
    assert state["messages"][-2]["text"] == "Explain this chart"
    assert state["latest_speech"]
    assert state["latest_speech"][0]["text"]


@pytest.mark.parametrize(
    ("chart_id", "expected_value"),
    [
        ("cash_flow", "50,000"),
        ("repayment_breakdown", "5,00,000"),
        ("income_scenarios", "2,08,518"),
        ("buy_hire", "1,80,000"),
    ],
)
def test_chart_explanation_action_adds_real_answer_and_speech(
    chart_id: str,
    expected_value: str,
) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    calculated = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )
    assert calculated.status_code == 200
    before_messages = calculated.json()["messages"]

    response = client.post(
        f"/api/sessions/{session_id}/numbers/chart-explanation",
        json={"chart_id": chart_id, "explanation_mode": "detailed"},
    )

    assert response.status_code == 200
    state = response.json()
    assert state["chart_context"]["chart_id"] == chart_id
    assert state["chart_context"]["data"]
    assert state["messages"][:-1] == before_messages
    assert state["messages"][-1]["role"] == "assistant"
    assert expected_value in state["messages"][-1]["text"]
    assert state["latest_speech"]
    assert state["latest_speech"][0]["text"]


def test_language_change_keeps_active_conversation_and_updates_future_replies() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    started = client.post(f"/api/sessions/{session_id}/conversation/start")
    original_messages = started.json()["messages"]

    changed = client.patch(
        f"/api/sessions/{session_id}",
        json={"language": "en"},
    )

    assert changed.status_code == 200
    state = changed.json()
    assert state["messages"] == original_messages
    assert state["conversation_state"] == "collecting"
    assert "price of the" in state["current_prompt"].lower()

    reply = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "500000"},
    )
    assert reply.status_code == 200
    assert reply.json()["messages"][-1]["text"].startswith("I understood:")


def test_kannada_is_no_longer_offered() -> None:
    session_id = client.post("/api/sessions").json()["session_id"]

    assert client.patch(f"/api/sessions/{session_id}", json={"language": "ta"}).status_code == 422
    assert client.patch(f"/api/sessions/{session_id}", json={"language": "en"}).status_code == 200


def test_chart_context_contains_selected_scenario_and_methodology() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )

    response = client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={
            "chart_id": "income_scenarios",
            "selected_scenario": 30,
            "selected_point": "income_down_30_percent",
            "explanation_mode": "simple",
            "speech_speed": 1.05,
        },
    )

    assert response.status_code == 200
    context = response.json()["chart_context"]
    assert context["selected_scenario"] == 30
    assert context["selected_point"] == "income_down_30_percent"
    selected = next(row for row in context["data"] if row["income_drop_percent"] == 30)
    assert selected["yearly_money_left"] == pytest.approx(
        600_000 * 0.7 - 20_000 * 12 - 2_000 * 12
        - response.json()["numbers_result"]["monthly_kist"] * 12
    )
    assert "बारह महीनों" in context["limitations"][0]


def test_chart_context_requires_real_result_and_optional_hiring_data() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    missing_result = client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown"},
    )
    assert missing_result.status_code == 409

    client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(yearly_hiring_spend=None),
    )
    no_hiring = client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "buy_hire"},
    )
    assert no_hiring.status_code == 409


def test_missing_optional_hiring_input_does_not_make_loan_chart_answer_uncertain() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    calculated = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(yearly_hiring_spend=None),
    )
    assert calculated.status_code == 200
    context = client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown"},
    )
    assert context.status_code == 200

    answer = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "किस्त के हिसाब को समझाइए"},
    )

    assert answer.status_code == 200
    assert "कुछ जानकारी अनुमान है या बाकी है" not in answer.json()["messages"][-1]["text"]


def test_ambiguous_chart_question_gets_a_short_language_matched_clarifier() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )
    client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown"},
    )

    answer = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "क्यों?"},
    )

    assert answer.status_code == 200
    assert answer.json()["messages"][-1]["text"] == (
        "क्या आप उधार की रकम, ब्याज, या कुल भुगतान के बारे में पूछ रहे हैं?"
    )


def test_chart_explanation_sends_saved_speech_speed_to_timbre(monkeypatch) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )
    client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown", "speech_speed": 0.9},
    )
    speeds = []
    monkeypatch.setattr(
        api,
        "speak",
        lambda text, *, language, speed: speeds.append(speed) or b"wav",
    )

    answer = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "किस्त के हिसाब को समझाइए"},
    )

    assert answer.status_code == 200
    assert speeds
    assert all(speed == 0.9 for speed in speeds)


def test_invalidated_chart_data_cannot_answer_until_fresh_context_is_selected() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )
    client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown"},
    )

    invalidated = client.post(
        f"/api/sessions/{session_id}/numbers/chart-context/invalidate",
    )
    assert invalidated.status_code == 200
    assert invalidated.json()["chart_context"] is None
    assert invalidated.json()["chart_context_stale"] is True
    blocked = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "कितना ब्याज है?"},
    )
    assert blocked.status_code == 409
    assert client.get(f"/api/sessions/{session_id}").json()["messages"] == []

    recalculated = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(yearly_interest_rate_percent=11),
    )
    assert recalculated.status_code == 200
    assert recalculated.json()["chart_context_stale"] is True
    fresh_context = client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown"},
    )
    assert fresh_context.status_code == 200
    assert fresh_context.json()["chart_context_stale"] is False
    answered = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "कितना ब्याज है?"},
    )
    assert answered.status_code == 200
    assert api.format_rupees(recalculated.json()["numbers_result"]["total_interest"]) in (
        answered.json()["messages"][-1]["text"]
    )


def test_recalculation_invalidates_chart_context_and_preferences_validate_speed() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(),
    )
    client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown"},
    )
    recalculated = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(yearly_interest_rate_percent=11),
    )
    assert recalculated.status_code == 200
    assert recalculated.json()["chart_context"] is None

    invalid = client.patch(
        f"/api/sessions/{session_id}/numbers/preferences",
        json={"explanation_mode": "simple", "speech_speed": 1.2},
    )
    assert invalid.status_code == 422

    client.post(
        f"/api/sessions/{session_id}/numbers/chart-context",
        json={"chart_id": "repayment_breakdown"},
    )
    saved = client.patch(
        f"/api/sessions/{session_id}/numbers/preferences",
        json={"explanation_mode": "detailed", "speech_speed": 0.9},
    )
    assert saved.status_code == 200
    assert saved.json()["explanation_mode"] == "detailed"
    assert saved.json()["speech_speed"] == 0.9
    assert saved.json()["chart_context"]["explanation_mode"] == "detailed"
    assert saved.json()["chart_context"]["speech_speed"] == 0.9


def test_rejects_non_tractor_intent_without_starting_agent() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "मुझे मौसम बताइए"},
    )

    assert response.status_code == 422
    state = client.get(f"/api/sessions/{session_id}").json()
    assert state["conversation_state"] == "not_started"
    assert state["messages"] == []


def _wav_recording(duration_seconds: float = 1) -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24_000)
        wav_file.writeframes(b"\x00\x00" * int(24_000 * duration_seconds))
    return output.getvalue()


@pytest.mark.parametrize(
    ("language", "expected_language_code"),
    [("hi", "hi-IN"), ("en", "en-IN")],
)
def test_transcription_uses_language_selected_in_shared_session(
    monkeypatch, language, expected_language_code
) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    client.patch(f"/api/sessions/{session_id}", json={"language": language})
    calls = []

    def fake_transcribe(audio, *, language_code):
        calls.append((audio, language_code))
        return "I need a tractor loan"

    monkeypatch.setattr(api, "transcribe", fake_transcribe)
    response = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("recording.wav", _wav_recording(), "audio/wav")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "transcript": "I need a tractor loan",
        "language_code": expected_language_code,
    }
    assert calls == [(_wav_recording(), expected_language_code)]
    state = client.get(f"/api/sessions/{session_id}").json()
    assert state["conversation_state"] == "not_started"
    assert state["messages"] == []


def test_transcript_correction_enters_the_shared_message_pipeline(monkeypatch) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    monkeypatch.setattr(
        api,
        "transcribe",
        lambda audio, *, language_code: "मुझे tractor loan चाहिए",
    )

    transcription = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("recording.wav", _wav_recording(), "audio/wav")},
    )
    assert transcription.status_code == 200
    corrected_text = transcription.json()["transcript"].replace("tractor", "ट्रैक्टर")
    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": corrected_text},
    )

    assert response.status_code == 200
    state = response.json()
    assert state["conversation_state"] == "collecting"
    assert state["messages"][-2] == {"role": "farmer", "text": corrected_text}
    assert state["messages"][-1]["role"] == "assistant"


def test_transcription_rejects_empty_unsupported_and_overlong_audio() -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]

    empty = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("empty.wav", b"", "audio/wav")},
    )
    unsupported = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("recording.webm", b"data", "audio/webm")},
    )
    too_long = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("long.wav", _wav_recording(31), "audio/wav")},
    )

    assert empty.status_code == 422
    assert unsupported.status_code == 415
    assert too_long.status_code == 422


def test_transcription_failure_is_friendly_and_does_not_change_conversation(monkeypatch) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]

    def fail_transcribe(audio, *, language_code):
        raise GnaniAPIError("authentication failure", 401)

    monkeypatch.setattr(api, "transcribe", fail_transcribe)
    response = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("recording.wav", _wav_recording(), "audio/wav")},
    )

    assert response.status_code == 502
    assert "कुंजी काम नहीं कर रही" in response.json()["detail"]
    state = client.get(f"/api/sessions/{session_id}").json()
    assert state["conversation_state"] == "not_started"
    assert state["messages"] == []


def test_empty_transcript_is_not_treated_as_success(monkeypatch) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    monkeypatch.setattr(api, "transcribe", lambda audio, *, language_code: "  ")

    response = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("recording.wav", _wav_recording(), "audio/wav")},
    )

    assert response.status_code == 422
    assert "साफ़ सुनाई नहीं दी" in response.json()["detail"]
    state = client.get(f"/api/sessions/{session_id}").json()
    assert state["messages"] == []


def test_typed_and_confirmed_transcript_share_conversation_and_speech_pipeline(monkeypatch) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    calls = []
    monkeypatch.setattr(api, "speak", lambda text, *, language, speed=1.0: calls.append((text, language)) or b"wav")

    initial = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "मुझे tractor loan चाहिए"},
    )
    assert initial.status_code == 200
    assert initial.json()["conversation_state"] == "collecting"
    assert len(calls) == 2
    assert all(language == "hi-IN" for _, language in calls)

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "600000"},
    )

    assert response.status_code == 200
    state = response.json()
    assert state["messages"][-2]["text"] == "600000"
    assert "6,00,000" in state["messages"][-1]["text"]
    assert state["latest_speech"][0]["audio_base64"] == "d2F2"
    assert "छह लाख" in state["latest_speech"][0]["text"]
    assert all(language == "hi-IN" for _, language in calls)
    assert all("-" not in text and not any(char.isdigit() for char in text) for text, _ in calls)


def test_tts_error_keeps_real_text_but_returns_no_playable_audio(monkeypatch) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]

    def fail_speak(text, *, language, speed=1.0):
        raise GnaniAPIError("temporarily unavailable", 500)

    monkeypatch.setattr(api, "speak", fail_speak)
    response = client.post(
        f"/api/sessions/{session_id}/conversation/start",
    )

    assert response.status_code == 200
    state = response.json()
    assert state["messages"]
    assert state["latest_speech"] == []
    assert "जवाब स्क्रीन पर उपलब्ध है" in state["speech_error"]


def test_teach_back_speech_chunks_are_generated_sequentially(monkeypatch) -> None:
    created = client.post("/api/sessions")
    session_id = created.json()["session_id"]
    calls = []
    monkeypatch.setattr(api, "speak", lambda text, *, language, speed=1.0: calls.append(text) or b"wav")
    client.post(f"/api/sessions/{session_id}/conversation/start")

    answers = (
        "छह लाख",
        "एक लाख",
        "दस प्रतिशत",
        "पाँच साल",
        "सालाना खेती की कमाई छह लाख",
        "महीने का खर्च बीस हज़ार",
        "दूसरे कर्ज़ की किस्त दो हज़ार",
    )
    for answer in answers:
        client.post(f"/api/sessions/{session_id}/messages", json={"text": answer})
        client.post(f"/api/sessions/{session_id}/messages", json={"text": "हाँ"})

    client.post(f"/api/sessions/{session_id}/messages", json={"text": "छोड़ें"})
    final_state = client.get(f"/api/sessions/{session_id}").json()

    assert final_state["conversation_state"] == "teach_back"
    assert len(final_state["latest_speech"]) >= 2
    assert final_state["latest_speech"][-1]["label"] == "समझ की जाँच का सवाल"
    assert all("-" not in text and not any(char.isdigit() for char in text) for text in calls)


def test_spoken_purpose_is_detected_and_used_in_questions() -> None:
    client = TestClient(api.app)
    session_id = client.post("/api/sessions").json()["session_id"]
    client.patch(f"/api/sessions/{session_id}", json={"language": "en"})

    state = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "I want a loan for a borewell"},
    ).json()

    assert state["loan_purpose"] == "irrigation"
    assert "irrigation setup" in state["current_prompt"]
    assert "tractor" not in state["current_prompt"].lower()


def test_purpose_chosen_before_start_is_used_and_locked_afterwards() -> None:
    client = TestClient(api.app)
    session_id = client.post("/api/sessions").json()["session_id"]
    client.patch(
        f"/api/sessions/{session_id}",
        json={"language": "en", "loan_purpose": "livestock"},
    )

    started = client.post(f"/api/sessions/{session_id}/conversation/start").json()
    assert started["loan_purpose"] == "livestock"
    assert "livestock" in started["current_prompt"]

    changed = client.patch(
        f"/api/sessions/{session_id}", json={"loan_purpose": "equipment"}
    ).json()
    assert changed["loan_purpose"] == "livestock"


def test_message_that_is_not_about_farm_loans_is_still_rejected() -> None:
    client = TestClient(api.app)
    session_id = client.post("/api/sessions").json()["session_id"]

    response = client.post(
        f"/api/sessions/{session_id}/messages", json={"text": "what is the weather"}
    )

    assert response.status_code == 422


def test_demo_farmer_year_comes_from_the_engine_and_is_labelled_synthetic() -> None:
    # Outgo each month = 18,000 + 3,000 + kist 10,379.18 = 31,379.18.
    # Paddy harvest is months 5 and 6 (October, November): 240,000 each.
    body = client.get("/api/demo/farmer-year").json()

    assert body["synthetic"] is True
    assert body["crop"] == "paddy" and body["harvest_months"] == [10, 11]
    assert body["monthly_kist"] == pytest.approx(10_379.18, abs=0.01)
    normal = body["scenarios"][0]
    assert len(normal["rows"]) == 12
    assert normal["rows"][0]["balance"] == pytest.approx(-31_379.18, abs=0.01)
    assert normal["lowest_balance"] == pytest.approx(-125_516.71, abs=0.02)
    assert normal["lowest_month_index"] == 4
    assert normal["rows"][4]["balance"] == pytest.approx(83_104.11, abs=0.02)
    assert normal["ending_balance"] == pytest.approx(103_449.87, abs=0.02)
    assert len(body["narration"]) == 3  # no drop selected, so no scenario sentence


def test_demo_farmer_year_shows_stress_when_income_drops() -> None:
    # 25% lower: 180,000 per harvest month; year ends at 360,000 - 12 x 31,379.18 = -16,550.13.
    body = client.get("/api/demo/farmer-year", params={"income_drop_percent": 25}).json()

    assert body["selected_drop_percent"] == 25
    assert len(body["narration"]) == 4
    assert body["selected"]["ending_balance"] == pytest.approx(-16_550.13, abs=0.02)
    assert body["selected"]["negative_month_indexes"][-1] == 12


def test_demo_farmer_year_rejects_out_of_range_drops() -> None:
    for value in (-1, 61):
        response = client.get("/api/demo/farmer-year", params={"income_drop_percent": value})
        assert response.status_code == 422


CASHFLOW_BODY = {
    "crop": "paddy", "yearly_income": 300_000, "monthly_costs": 10_000,
    "asset_price": 600_000, "down_payment": 100_000, "loan_rate": 10, "tenure_years": 5,
    "language": "en",
}


def test_cashflow_endpoint_returns_rows_and_sentences() -> None:
    body = client.post("/api/cashflow", json=CASHFLOW_BODY).json()

    assert body["scenarios"][0]["lowest_balance"] == pytest.approx(-82_494.08, abs=0.02)
    assert body["narration"][2]["text"] == "The tightest month is September, when you are ₹82,494 short."
    assert body["answers"] and body["assumptions"]


def test_cashflow_endpoint_rejects_bad_input() -> None:
    assert client.post("/api/cashflow", json={**CASHFLOW_BODY, "crop": "cotton"}).status_code == 422
    assert client.post("/api/cashflow", json={**CASHFLOW_BODY, "down_payment": 900_000}).status_code == 422
    assert client.post("/api/cashflow", json={**CASHFLOW_BODY, "yearly_income": -5}).status_code == 422
    assert client.post("/api/cashflow", json={**CASHFLOW_BODY, "language": "ta"}).status_code == 422


def test_cashflow_speak_sends_number_words_to_timbre_one_sentence_at_a_time(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    def fake_speak(text: str, *, language: str | None = None, speed: float | None = None) -> bytes:
        calls.append((text, language or ""))
        return b"RIFFfake"

    monkeypatch.setattr(api, "speak", fake_speak)
    response = client.post("/api/cashflow/speak", json={**CASHFLOW_BODY, "mode": "narration", "index": 2})

    assert response.status_code == 200
    assert len(calls) == 1 and calls[0][1] == "en-IN"
    assert not any(ch.isdigit() for ch in calls[0][0]) and "₹" not in calls[0][0]
    assert response.json()["text"] == calls[0][0]


def test_cashflow_speak_reports_a_speech_failure_as_a_readable_502(monkeypatch) -> None:
    def broken(*args: object, **kwargs: object) -> bytes:
        raise api.GnaniAPIError("down", status_code=500)

    monkeypatch.setattr(api, "speak", broken)
    response = client.post("/api/cashflow/speak", json={**CASHFLOW_BODY, "mode": "answer", "index": 0})

    assert response.status_code == 502
    assert "remains on screen" in response.json()["detail"]
    assert client.post("/api/cashflow/speak", json={**CASHFLOW_BODY, "index": 9}).status_code == 404


def test_session_crop_defaults_to_paddy_and_can_be_changed() -> None:
    created = client.post("/api/sessions").json()
    assert created["crop"] == "paddy"
    changed = client.patch(f"/api/sessions/{created['session_id']}", json={"crop": "wheat"}).json()
    assert changed["crop"] == "wheat"
    assert client.patch(f"/api/sessions/{created['session_id']}", json={"crop": "cotton"}).status_code == 422


def test_schemes_info_lists_five_sourced_schemes() -> None:
    body = client.get("/api/schemes").json()

    assert body["as_of"] == "2026-11-09"
    assert [s["id"] for s in body["schemes"]] == ["kcc", "aif", "smam", "pmfby", "pm_kisan"]
    assert all(s["sources"] for s in body["schemes"])
    assert "2wd_40_50" in body["tractor_classes"]


def test_schemes_evaluate_endpoint_matches_the_engine() -> None:
    body = client.post(
        "/api/schemes/evaluate",
        json={
            "crop": "paddy", "yearly_income": 300_000, "monthly_costs": 10_000,
            "asset_price": 600_000, "down_payment": 100_000, "loan_rate": 10, "tenure_years": 5,
            "buying_machinery": True, "tractor_class": "2wd_40_50",
        },
    ).json()

    smam = next(s for s in body["schemes"] if s["id"] == "smam")
    assert smam["figures"]["subsidy"] == 300_000
    assert body["ranking_by_money"][0] == "smam"
    bad = client.post("/api/schemes/evaluate", json={"crop": "paddy", "yearly_income": 1, "monthly_costs": 1, "tractor_class": "9wd", "buying_machinery": True, "asset_price": 100, "loan_rate": 1, "tenure_years": 1})
    assert bad.status_code == 422


def test_chat_mode_spends_no_voice_credit_and_audio_mode_speaks_with_the_chosen_speed(monkeypatch) -> None:
    calls: list[tuple[str, float | None]] = []

    def fake_speak(text, *, language, speed=None):
        calls.append((language, speed))
        return b"wav"

    monkeypatch.setattr(api, "speak", fake_speak)
    session_id = client.post("/api/sessions").json()["session_id"]
    assert client.post("/api/sessions").json()["input_mode"] == "audio"

    client.patch(f"/api/sessions/{session_id}", json={"input_mode": "chat"})
    started = client.post(f"/api/sessions/{session_id}/conversation/start").json()
    assert started["latest_speech"] == [] and started["speech_error"] is None
    assert calls == []

    slow = client.patch(f"/api/sessions/{session_id}", json={"speech_speed": 0.85, "input_mode": "audio"}).json()
    # Switching to audio speaks the reply that is already on screen, at the chosen speed.
    assert slow["input_mode"] == "audio"
    assert slow["latest_speech"]
    assert calls and all(speed == 0.85 for _, speed in calls)
    assert client.patch(f"/api/sessions/{session_id}", json={"speech_speed": 2.0}).status_code == 422


def test_cashflow_speak_passes_the_chosen_speed(monkeypatch) -> None:
    seen: list[float | None] = []
    monkeypatch.setattr(api, "speak", lambda text, *, language, speed=None: seen.append(speed) or b"wav")
    response = client.post("/api/cashflow/speak", json={**CASHFLOW_BODY, "mode": "narration", "index": 0, "speed": 1.15})

    assert response.status_code == 200
    assert seen == [1.15]
    assert client.post("/api/cashflow/speak", json={**CASHFLOW_BODY, "speed": 3}).status_code == 422


def test_missing_key_is_reported_plainly_not_as_a_bad_recording(monkeypatch) -> None:
    def no_key(*args, **kwargs):
        raise api.GnaniAPIError("Gnani API key is missing. Add GNANI_API_KEY to your local .env file.")

    monkeypatch.setattr(api, "transcribe", no_key)
    session_id = client.post("/api/sessions").json()["session_id"]
    response = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("recording.wav", _wav_recording(), "audio/wav")},
    )

    assert response.status_code == 502
    assert ".env" in response.json()["detail"] and "GNANI_API_KEY" in response.json()["detail"]


def test_voice_check_names_the_broken_part(monkeypatch) -> None:
    monkeypatch.setenv("GNANI_API_KEY", "")
    missing = client.post("/api/voice/check", params={"language": "en"}).json()
    assert missing["key_configured"] is False and ".env" in missing["speech"]["message"]
    assert client.get("/api/voice/status").json() == {"key_configured": False}

    monkeypatch.setenv("GNANI_API_KEY", "abc")

    def timbre_denied(text, *, language, speed=None):
        raise api.GnaniAPIError("denied", status_code=403)

    def prisma_silence(audio, *, language_code):
        raise api.GnaniAPIError("Gnani could not transcribe this recording.")

    monkeypatch.setattr(api, "speak", timbre_denied)
    monkeypatch.setattr(api, "transcribe", prisma_silence)
    checked = client.post("/api/voice/check", params={"language": "en"}).json()

    assert checked["key_configured"] is True
    assert checked["speech"] == {"ok": False, "message": "The voice service is not enabled for this key. The answer remains on screen."}
    assert checked["listening"] == {"ok": True, "message": ""}  # silence cannot be transcribed, but Prisma was reached


def test_reset_conversation_starts_again_with_no_old_answers(monkeypatch) -> None:
    monkeypatch.setattr(api, "speak", lambda text, *, language, speed=None: b"wav")
    session_id = client.post("/api/sessions").json()["session_id"]
    client.post(f"/api/sessions/{session_id}/conversation/start")
    client.post(f"/api/sessions/{session_id}/messages", json={"text": "600000"})

    reset = client.post(f"/api/sessions/{session_id}/conversation/reset").json()

    assert reset["conversation_state"] == "not_started"
    assert reset["messages"] == [] and reset["latest_speech"] == [] and reset["finance_result"] is None
    restarted = client.post(f"/api/sessions/{session_id}/conversation/start").json()
    assert restarted["conversation_state"] == "collecting" and len(restarted["messages"]) == 1


def test_document_amounts_written_in_lakh_reach_my_numbers_in_full() -> None:
    """A loan paper saying "Rs 6.5 Lakh" means 6,50,000; it must never become 6.5."""
    session_id = client.post("/api/sessions").json()["session_id"]
    upload = _upload_pdf(session_id, _pdf_document([
        "Tractor price: Rs 6.5 Lakh",
        "Down payment: Rs 1.5 Lakh",
        "Loan amount: Rs 5 Lakhs",
        "Total repayment: Rs 1 Crore",
    ]))
    terms = upload.json()["document"]["terms"]
    assert terms["tractor_price"]["value"] == "6.5 Lakh"
    assert terms["loan_amount"]["value"] == "5 Lakhs"
    assert terms["total_repayment"]["value"] == "1 Crore"

    client.patch(
        f"/api/sessions/{session_id}/documents/terms",
        json={"updates": [
            {"field_id": "tractor_price", "value": "6.5 Lakh", "confirmed": True},
            {"field_id": "down_payment", "value": "1.5 Lakh", "confirmed": True},
        ]},
    )
    moved = client.post(
        f"/api/sessions/{session_id}/documents/transfer",
        json={"field_ids": ["tractor_price", "down_payment"]},
    ).json()
    assert moved["numbers_inputs"]["asset_price"]["value"] == 650_000
    assert moved["numbers_inputs"]["down_payment"]["value"] == 150_000


@pytest.mark.parametrize(
    ("language", "expected"),
    [("en", "Down payment must be less than the asset price."), ("hi", "शुरुआती भुगतान कीमत से कम होना चाहिए।")],
)
def test_engine_errors_arrive_in_the_session_language(language: str, expected: str) -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    client.patch(f"/api/sessions/{session_id}", json={"language": language})
    response = client.post(
        f"/api/sessions/{session_id}/numbers/calculate",
        json=_numbers_request(asset_price=100_000, down_payment=200_000),
    )
    assert response.status_code == 422
    assert response.json()["detail"] == expected


@pytest.mark.parametrize("language", ["en", "hi"])
def test_recording_errors_arrive_in_the_session_language(language: str) -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    client.patch(f"/api/sessions/{session_id}", json={"language": language})
    response = client.post(
        f"/api/sessions/{session_id}/transcribe",
        files={"audio_file": ("a.wav", b"", "audio/wav")},
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    has_hindi = any("\u0900" <= char <= "\u097f" for char in detail)
    assert has_hindi == (language == "hi"), detail


def test_cashflow_errors_follow_the_language_header() -> None:
    body = {"crop": "paddy", "yearly_income": 480000, "monthly_costs": 18000, "asset_price": 100000,
            "down_payment": 200000, "loan_rate": 9, "tenure_years": 5, "language": "hi"}
    response = client.post("/api/cashflow", json=body, headers={"X-KuberKet-Language": "hi"})
    assert response.status_code == 422
    assert response.json()["detail"] == "शुरुआती भुगतान कीमत से कम होना चाहिए।"


@pytest.mark.parametrize(("language", "expected"), [("en", "Actual cash flow depends"), ("hi", "असली नकदी")])
def test_engine_assumptions_are_shown_in_the_session_language(language: str, expected: str) -> None:
    session_id = client.post("/api/sessions").json()["session_id"]
    client.patch(f"/api/sessions/{session_id}", json={"language": language})
    state = client.post(f"/api/sessions/{session_id}/numbers/calculate", json=_numbers_request()).json()
    assert any(item.startswith(expected) for item in state["numbers_result"]["assumptions"])
