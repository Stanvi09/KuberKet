import pytest

from conversation_agent import ConversationAgent, parse_numbers


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("600000", [600000]),
        ("6,00,000", [600000]),
        ("छह लाख", [600000]),
        ("दो लाख पचास हज़ार", [250000]),
        ("chhe lakh", [600000]),
        ("das percent", [10]),
        ("दस प्रतिशत", [10]),
        ("10%", [10]),
        ("interest -5%", [-5]),
        ("two lakh fifty thousand", [250000]),
        ("तीन साल", [3]),
    ],
)
def test_number_parsing(text, expected):
    assert parse_numbers(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("6 lakh", [600000]),
        ("6 lac", [600000]),
        ("6lakh", [600000]),
        ("6 लाख", [600000]),
        ("६ लाख", [600000]),
        ("1.5 lakh", [150000]),
        ("2 crore", [20000000]),
        ("50 हज़ार", [50000]),
        ("50 thousand", [50000]),
        ("6 lakh 50 thousand", [650000]),
        ("6 lakh 50000", [650000]),
        ("2 sau 50", [250]),
        ("price 6 lakh, down payment 1 lakh", [600000, 100000]),
        ("9 5", [9, 5]),
        ("5 years", [5]),
    ],
)
def test_digits_followed_by_a_scale_word_are_multiplied(text, expected):
    """Speech-to-text often writes "6 lakh"; it must mean 6,00,000, not 6."""
    assert parse_numbers(text) == expected


@pytest.mark.parametrize(("language", "answer"), [("en", "6 lakh"), ("hi", "6 लाख"), ("hi", "6 lakh rupaye")])
def test_six_lakh_in_digits_is_read_back_as_six_lakh(language, answer):
    agent = ConversationAgent(language=language, purpose="equipment")
    agent.start()
    assert "6,00,000" in agent.respond(answer)


def answer_with_confirmation(agent, answer):
    readback = agent.respond(answer)
    assert "?" in readback
    return agent.respond("हाँ")


def fill_required_slots(agent):
    answers = (
        "छह लाख",
        "एक लाख",
        "दस प्रतिशत",
        "पाँच साल",
        "सालाना खेती की कमाई छह लाख",
        "महीने का खर्च बीस हज़ार",
        "दूसरे कर्ज़ की किस्त दो हज़ार",
    )
    output = ""
    for answer in answers:
        output = answer_with_confirmation(agent, answer)
    return output


def test_slots_are_remembered_as_farmer_given():
    agent = ConversationAgent()
    agent.start()
    answer_with_confirmation(agent, "छह लाख")

    assert agent.slots["asset_price"].value == 600_000
    assert agent.slots["asset_price"].status == "given"


def test_filled_slots_are_not_asked_again():
    agent = ConversationAgent()
    first_prompt = agent.start()
    second_prompt = answer_with_confirmation(agent, "छह लाख")

    assert "कीमत" in first_prompt
    assert "शुरू में" in second_prompt
    assert "कीमत" not in second_prompt


def test_unclear_and_unrealistic_values_are_reasked():
    agent = ConversationAgent()
    agent.start()

    unclear = agent.respond("बहुत महंगा")
    assert "संख्या" in unclear
    assert "कीमत" in unclear
    agent.respond("छह लाख")
    agent.respond("हाँ")
    agent.respond("एक लाख")
    agent.respond("हाँ")
    agent.respond("चार सौ प्रतिशत")
    invalid_rate = agent.respond("400%")
    assert "ठीक नहीं" in invalid_rate
    assert agent.slots["yearly_interest_rate_percent"].status == "missing"


def test_complete_flow_calls_engine_then_enters_teach_back():
    agent = ConversationAgent()
    agent.start()
    output = fill_required_slots(agent)
    output = agent.respond("छोड़ें")

    assert agent.result is not None
    assert agent.state == "teach_back"
    assert "25%" in output
    assert "40%" in output
    assert "फसल बिकने" in output
    assert "बैंक" in output
    assert agent.slots["yearly_hiring_spend"].status == "missing"


def test_optional_hiring_amount_is_included_only_when_given():
    agent = ConversationAgent()
    agent.start()
    fill_required_slots(agent)
    readback = agent.respond("सालाना किराये का खर्च एक लाख")
    assert "किराये या सेवा का सालाना खर्च" in readback
    output = agent.respond("हाँ")

    assert agent.result is not None
    assert agent.result.buy_rent_comparison is not None
    assert "मरम्मत" in output


def test_correction_is_read_back_before_becoming_given():
    agent = ConversationAgent()
    agent.start()
    agent.respond("छह लाख")
    correction_prompt = agent.respond("नहीं")

    assert "सही संख्या" in correction_prompt
    correction = agent.respond("पाँच लाख")
    assert "5,00,000" in correction
    assert agent.slots["asset_price"].status == "missing"
    agent.respond("हाँ")
    assert agent.slots["asset_price"].value == 500_000


def test_teach_back_correct_answer_finishes():
    agent = ConversationAgent()
    agent.start()
    fill_required_slots(agent)
    agent.respond("छोड़ें")

    result = agent.respond("हाँ, किस्त देनी होगी")
    assert agent.state == "complete"
    assert "सही" in result


def test_teach_back_wrong_answer_gets_one_kind_retry_then_finishes():
    agent = ConversationAgent()
    agent.start()
    fill_required_slots(agent)
    agent.respond("छोड़ें")

    retry = agent.respond("नहीं, किस्त नहीं देनी")
    assert agent.state == "teach_back"
    assert "कोई बात नहीं" in retry
    assert "?" in retry
    finish = agent.respond("समझ नहीं आया")
    assert agent.state == "complete"
    assert "कोई बात नहीं" in finish


def test_hindi_teach_back_two_wrong_answers_reexplains_then_moves_on_kindly():
    agent = ConversationAgent()
    agent.start()
    fill_required_slots(agent)
    agent.respond("छोड़ें")

    retry = agent.respond("नहीं, किस्त नहीं देनी होगी")
    assert agent.state == "teach_back"
    assert "कोई बात नहीं" in retry
    assert "दुकान में बिक्री कम हो" in retry
    assert "दुकान का किराया देना पड़ता है" in retry
    assert "फसल कम हो" in retry
    assert agent.spoken_teach_question == "क्या फसल कम होने पर भी किस्त देनी होगी?"
    assert retry.count("?") == 1

    finish = agent.respond("नहीं, किस्त नहीं देनी होगी")
    assert agent.state == "complete"
    assert "कोई बात नहीं" in finish


def test_assumed_slot_is_marked_assumed():
    agent = ConversationAgent()
    agent.mark_assumed("yearly_hiring_spend", 50_000)

    assert agent.slots["yearly_hiring_spend"].status == "assumed"


def test_assumed_optional_slot_is_not_asked_again():
    agent = ConversationAgent()
    agent.mark_assumed("yearly_hiring_spend", 50_000)
    agent.start()
    fill_required_slots(agent)

    assert agent.state == "teach_back"
    assert agent.result is not None
    assert agent.result.buy_rent_comparison is not None


def test_english_language_strings_are_available():
    agent = ConversationAgent(language="en")

    assert "price of the item you are buying" in agent.start().lower()


@pytest.mark.parametrize(
    ("purpose", "language", "expected"),
    [
        ("equipment", "en", "price of the equipment"),
        ("irrigation", "en", "irrigation setup"),
        ("livestock", "en", "livestock"),
        ("irrigation", "hi", "सिंचाई व्यवस्था की कीमत"),
    ],
)
def test_first_question_names_what_the_loan_buys(purpose, language, expected):
    agent = ConversationAgent(language=language, purpose=purpose)
    assert expected in agent.start()


def test_language_switch_keeps_the_purpose():
    agent = ConversationAgent(language="en", purpose="livestock")
    agent.set_language("hi")
    assert "पशुओं" in agent.text["questions"]["asset_price"]


def test_unknown_purpose_is_rejected():
    from explanation_engine import get_text

    with pytest.raises(ValueError):
        get_text("en", "spaceship")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("I need a loan for a tractor", "equipment"),
        ("मुझे बोरवेल के लिए कर्ज़ चाहिए", "irrigation"),
        ("drip irrigation loan", "irrigation"),
        ("I want a loan", None),
    ],
)
def test_detect_loan_purpose(text, expected):
    from explanation_engine import detect_loan_purpose

    assert detect_loan_purpose(text) == expected
