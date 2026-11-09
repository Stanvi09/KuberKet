import re

import pytest

from conversation_agent import ConversationAgent
from explanation_engine import amount_to_words, format_rupees


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (0, "शून्य"),
        (10_624, "दस हज़ार छह सौ चौबीस"),
        (208_518, "दो लाख आठ हज़ार पाँच सौ अठारह"),
        (5_000_000, "पचास लाख"),
        (10_624, "ten thousand six hundred twenty four"),
        (208_518, "two lakh eight thousand five hundred eighteen"),
        (1_000_000, "ten lakh"),
    ],
)
def test_amount_to_words_in_hindi_and_english(amount, expected):
    language = "en" if expected.isascii() else "hi"
    assert amount_to_words(amount, language) == expected


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (1_000.4, "एक हज़ार"),
        (1_000.5, "एक हज़ार एक"),
        (-10_624, "घाटा दस हज़ार छह सौ चौबीस"),
    ],
)
def test_amount_to_words_rounding_and_negative_speech(amount, expected):
    assert amount_to_words(amount) == expected
    assert "-" not in amount_to_words(amount)


def fill_conversation(agent, answers):
    agent.start()
    for answer in answers:
        agent.respond(answer)
        agent.respond("yes" if agent.language == "en" else "हाँ")
    agent.respond("skip" if agent.language == "en" else "छोड़ें")


def test_spoken_explanation_is_short_and_has_no_digits_or_minus_sign():
    agent = ConversationAgent()
    fill_conversation(
        agent,
        (
            "छह लाख",
            "एक लाख",
            "दस प्रतिशत",
            "पाँच साल",
            "छह लाख",
            "बीस हज़ार",
            "दो हज़ार",
        ),
    )

    spoken = agent.spoken_explanation
    assert spoken is not None
    assert not re.search(r"[\d०-९-]", spoken)
    assert len(re.findall(r"[.!?।]", spoken)) <= 5
    assert "चालीस प्रतिशत" in spoken
    assert "दस हज़ार छह सौ चौबीस" in spoken
    assert "बैंक" in spoken
    assert "सामान्य साल में किस्त देने के बाद आपके पास करीब" in spoken
    assert "अगर कमाई चालीस प्रतिशत कम हो, तो साल में करीब" in spoken
    assert "बैंक से किस्त और तारीख पक्की कर लें" in spoken


def test_english_spoken_explanation_has_no_digits_or_minus_sign():
    agent = ConversationAgent(language="en")
    fill_conversation(
        agent,
        (
            "600000",
            "100000",
            "10 percent",
            "5 years",
            "600000",
            "20000",
            "2000",
        ),
    )

    spoken = agent.spoken_explanation
    assert spoken is not None
    assert not re.search(r"[\d-]", spoken)
    assert "twenty five percent" in spoken
    assert "forty percent" in spoken


def test_screen_explanation_keeps_digits_and_leads_with_engine_verdict():
    agent = ConversationAgent()
    fill_conversation(
        agent,
        (
            "छह लाख",
            "एक लाख",
            "दस प्रतिशत",
            "पाँच साल",
            "छह लाख",
            "बीस हज़ार",
            "दो हज़ार",
        ),
    )

    screen = agent.screen_explanation
    assert screen is not None
    assert screen.startswith("सामान्य साल")
    assert "10,624" in screen
    assert "असल में पैसे फसल बिकने" in screen
    assert "कमाई 40%" in screen
    assert "-" not in screen


def test_verdict_explains_normal_year_shortfall_without_recommendation():
    agent = ConversationAgent()
    fill_conversation(
        agent,
        (
            "छह लाख",
            "एक लाख",
            "दस प्रतिशत",
            "पाँच साल",
            "एक लाख",
            "बीस हज़ार",
            "दो हज़ार",
        ),
    )

    assert agent.result is not None
    assert agent.result.scenarios[0].affordability.yearly_status == "negative"
    assert agent.screen_explanation is not None
    assert "सामान्य साल में किस्त देने के बाद" in agent.screen_explanation
    affordability = agent.result.scenarios[0].affordability
    monthly_shortfall = format_rupees(abs(affordability.monthly_money_left))
    yearly_shortfall = format_rupees(abs(affordability.yearly_money_left))
    assert f"{monthly_shortfall} रुपये की कमी" in agent.screen_explanation
    assert f"{yearly_shortfall} रुपये की कमी" in agent.screen_explanation
    assert "-" not in agent.screen_explanation
