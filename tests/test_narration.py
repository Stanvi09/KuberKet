"""Narration is built only from engine outputs. Numbers hand-checked.

Paddy, income 3,00,000, costs 10,000, tractor 5,00,000 loan at 10% for 5 years:
kist 10,623.52, outgo 20,623.52. Lowest normal balance -82,494.08 in month 4 (September).
Harvest in months 5 and 6 (October, November): +150,000 each.
"""

import pytest

from explanation_engine import numbers_to_spoken_words
from finance_engine import FinanceInputError
from narration import build_cashflow_report

BASE = dict(
    crop="paddy", yearly_income=300_000, monthly_costs=10_000,
    asset_price=600_000, down_payment=100_000, loan_rate=10, tenure_years=5,
)


def test_english_sentences_use_engine_numbers():
    report = build_cashflow_report(**BASE, language="en")
    texts = [n["text"] for n in report["narration"]]

    assert texts[0] == "Paddy income arrives in October and November, about ₹3,00,000 in the year."
    assert texts[1] == "Every month about ₹20,624 goes out in costs and payments, of which the instalment is ₹10,624."
    assert texts[2] == "The tightest month is September, when you are ₹82,494 short."
    assert [n["at_month"] for n in report["narration"]] == [1, 1, 4, 12]
    assert len(texts) == 4


def test_hindi_sentences_use_engine_numbers():
    report = build_cashflow_report(**BASE, language="hi")
    texts = [n["text"] for n in report["narration"]]

    assert texts[0] == "धान की कमाई साल में अक्टूबर और नवंबर में आती है, कुल करीब 3,00,000 रुपये।"
    assert "20,624 रुपये" in texts[1] and "किस्त 10,624 रुपये" in texts[1]
    assert texts[2] == "सबसे मुश्किल महीना सितंबर है, तब हाथ में 82,494 रुपये कम पड़ेंगे।"


def test_drop_sentence_names_the_months_from_the_engine():
    # 40% lower: harvest 90,000 in months 5 and 6, outgo 20,623.52 every month.
    # Balances: -20,623.52, -41,247.04, -61,870.56, -82,494.08, -13,117.60, +56,258.88,
    # +35,635.36, +15,011.84, -5,611.68, -26,235.20, -46,858.72, -67,482.27.
    report = build_cashflow_report(**BASE, income_drop_percent=40, language="en")
    selected = report["selected"]

    assert selected["negative_month_indexes"] == (1, 2, 3, 4, 5, 9, 10, 11, 12)
    assert selected["ending_balance"] == pytest.approx(-67_482.27, abs=0.02)
    assert report["narration"][-1]["text"] == (
        "If income is 40% lower, money runs short in 9 months: June, July, August, September, "
        "October, February, March, April and May. At the lowest point you are ₹82,494 short."
    )
    assert report["risky_sentence"].startswith("Money runs short in these months: June")


def test_zero_drop_adds_no_scenario_sentence():
    report = build_cashflow_report(**BASE, income_drop_percent=0, language="en")
    assert len(report["narration"]) == 3


def test_risky_sentence_and_no_shortfall_case():
    safe = build_cashflow_report(**{**BASE, "savings": 5_000_000}, language="en")
    assert safe["normal_risky_sentence"] == "On these numbers, money does not run short in any month."
    hindi = build_cashflow_report(**BASE, language="hi")
    assert hindi["normal_risky_sentence"].startswith("इन महीनों में हाथ में पैसे कम पड़ेंगे: जून")


def test_no_loan_farmer_skips_the_kist_clause():
    report = build_cashflow_report(crop="wheat", yearly_income=240_000, monthly_costs=8_000, language="en")
    assert report["monthly_kist"] == 0
    assert "of which the instalment" not in report["narration"][1]["text"]
    assert report["harvest_months"] == [3, 4]


def test_all_sentences_survive_number_to_words_for_speech():
    for language in ("hi", "en"):
        report = build_cashflow_report(**BASE, language=language)
        for item in report["narration"] + [{"text": a["answer"]} for a in report["answers"]]:
            spoken = numbers_to_spoken_words(item["text"].replace("₹", ""), language)
            assert not any(ch.isdigit() for ch in spoken), spoken


def test_twelve_rows_per_scenario_and_answers_present():
    report = build_cashflow_report(**BASE, income_drop_percent=10, language="en")
    assert [s["income_drop_percent"] for s in report["scenarios"]] == [0, 25, 40, 10]
    assert all(len(s["rows"]) == 12 for s in report["scenarios"])
    assert len(report["answers"]) == 4 and report["assumptions"]


@pytest.mark.parametrize("overrides", [{"language": "ta"}, {"crop": "cotton"}, {"down_payment": 700_000}])
def test_bad_input_is_rejected(overrides):
    with pytest.raises(FinanceInputError):
        build_cashflow_report(**{**BASE, "language": "en", **overrides})
