"""The landing page copies real app wording; fail if the two drift apart."""

from pathlib import Path

from conversation_agent import ConversationAgent
from explanation_engine import STRINGS

CONTENT_ROOT = Path(__file__).resolve().parent.parent / "frontend" / "src"
CONTENT = (CONTENT_ROOT / "story" / "content.ts").read_text(encoding="utf-8")


def test_teach_back_copy_matches_the_real_hindi_strings():
    hi = STRINGS["hi"]
    for key in ("teach_question", "teach_retry", "teach_retry_question", "teach_finish", "teach_pass"):
        assert hi[key] in CONTENT, f"{key} drifted from explanation_engine.py"


def test_conversation_copy_matches_what_the_agent_says():
    agent = ConversationAgent(language="hi", purpose="equipment")
    welcome, first_question = agent.start().split("\n")
    readback = agent.respond("छह लाख रुपये")
    next_question = agent.respond("हाँ")

    for line in (welcome, first_question, readback, next_question):
        assert line in CONTENT, f"landing transcript drifted: {line}"
    assert "बैंक से किस्त और तारीख पक्की कर लें।" in STRINGS["hi"]["spoken_explanation"]
    assert "बैंक से किस्त और तारीख पक्की कर लें।" in CONTENT


def test_english_conversation_copy_matches_what_the_agent_says():
    agent = ConversationAgent(language="en", purpose="equipment")
    welcome, first_question = agent.start().split("\n")
    readback = agent.respond("six lakh rupees")
    next_question = agent.respond("yes")

    for line in (welcome, first_question, readback, next_question):
        assert line in CONTENT, f"English landing transcript drifted: {line}"
    tail = "Confirm the exact instalment and its date with the lender."
    assert tail in STRINGS["en"]["spoken_explanation"]
    assert tail in CONTENT


def test_crop_calendars_in_the_app_match_the_engine():
    """The crop chips show harvest months from year/text.ts; they must equal the engine's calendars."""
    import re

    from finance_engine import CROP_CALENDARS

    text = (CONTENT_ROOT / "year" / "text.ts").read_text(encoding="utf-8")
    block = text[text.index("export const CROP_CALENDAR"):text.index("export const monthShort")]
    for crop, calendar in CROP_CALENDARS.items():
        match = re.search(
            rf"{crop}: \{{ season: \"(\w+)\", sowing_month: (\d+), harvest_months: \[([\d, ]+)\] \}}", block
        )
        assert match, f"{crop} calendar missing from year/text.ts"
        assert match.group(1) == calendar["season"]
        assert int(match.group(2)) == calendar["sowing_month"]
        assert [int(x) for x in match.group(3).split(",")] == list(calendar["harvest_months"])


def test_scheme_pages_do_not_recommend_a_scheme():
    """The page reports computed differences. It must never tell a farmer to take a scheme."""
    text = (CONTENT_ROOT / "schemes" / "text.ts").read_text(encoding="utf-8").casefold()
    for phrase in ("you should take", "we recommend", "best scheme", "आपको यही", "हम सलाह देते"):
        assert phrase not in text


def test_english_teach_back_copy_matches_the_real_english_strings():
    en = STRINGS["en"]
    for key in ("teach_question", "teach_retry", "teach_retry_question", "teach_finish", "teach_pass"):
        assert en[key] in CONTENT, f"English {key} drifted from explanation_engine.py"
