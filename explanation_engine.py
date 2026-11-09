"""All user-facing conversation text, in Hindi and English.

Strings may contain the token ``@@ASSET@@``; ``get_text`` fills it with the noun
for what the loan is for (equipment, irrigation, livestock or other)."""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
from typing import Any

STRINGS = {
    "hi": {
        "welcome": "हम खेती के कर्ज़ और उसकी किस्त समझेंगे।",
        "questions": {
            "asset_price": "@@ASSET@@ की कीमत कितनी है? रुपये में बताइए।",
            "down_payment": "आप शुरू में कितने रुपये देंगे?",
            "yearly_interest_rate_percent": "साल का ब्याज कितने प्रतिशत है?",
            "tenure_years": "कर्ज़ कितने साल के लिए होगा?",
            "yearly_farm_income": "खेती से साल भर में कितनी कमाई होती है?",
            "monthly_costs": "घर और खेती का महीने का कुल खर्च कितना है?",
            "monthly_existing_loan_payments": "दूसरे कर्ज़ की महीने की कुल किस्त कितनी है? न हो तो शून्य कहें।",
            "yearly_hiring_spend": "इसी काम के लिए आज किराये पर या सेवा लेने में साल भर में कितना खर्च होता है? नहीं बताना हो तो 'छोड़ें' कहें।",
        },
        "readback": "आपने बताया: {slot} {amount} {unit}। सही है?",
        "slot_names": {
            "asset_price": "@@ASSET@@ की कीमत",
            "down_payment": "शुरुआत में देंगे",
            "yearly_interest_rate_percent": "साल का ब्याज",
            "tenure_years": "कर्ज़ की अवधि",
            "yearly_farm_income": "साल की खेती की कमाई",
            "monthly_costs": "महीने का घर और खेती का खर्च",
            "monthly_existing_loan_payments": "दूसरे कर्ज़ की महीने की किस्त",
            "yearly_hiring_spend": "किराये या सेवा का सालाना खर्च",
        },
        "units": {
            "yearly_interest_rate_percent": "प्रतिशत",
            "tenure_years": "साल",
            "yearly_farm_income": "रुपये",
            "monthly_costs": "रुपये",
            "monthly_existing_loan_payments": "रुपये",
            "yearly_hiring_spend": "रुपये",
            "asset_price": "रुपये",
            "down_payment": "रुपये",
        },
        "confirm_yes": ("हाँ", "हां", "सही", "ठीक", "yes", "correct", "right", "haan", "han"),
        "confirm_no": ("नहीं", "गलत", "बदल", "no", "wrong", "change", "nahi", "nahin"),
        "repeat_value": "कोई साफ़ संख्या समझ नहीं आई। {question}",
        "unrealistic": "यह संख्या ठीक नहीं लग रही। कृपया फिर से बताइए। {question}",
        "correction_prompt": "ठीक है, सही संख्या बताइए। {question}",
        "optional_skip": ("छोड़", "नहीं पता", "नहीं बताना", "skip", "no", "नहीं", "nahi"),
        "optional_skipped": "ठीक है, इसे खाली छोड़ते हैं।",
        "engine_error": "इन जानकारियों से हिसाब नहीं बन पाया: {error} कृपया सही संख्या बताइए।",
        "scenario_titles": ("सामान्य साल", "कमाई 25% कम", "कमाई 40% कम"),
        "explanation": (
            "इस हिसाब में कर्ज़ {loan} रुपये है और महीने की किस्त करीब {kist} रुपये है। "
            "कुल ब्याज करीब {interest} रुपये है।\n"
            "महीने का हिसाब: सामान्य साल {normal}, कमाई 25% घटे तो {down25}, "
            "और 40% घटे तो {down40}।\n"
            "साल का हिसाब: सामान्य साल {year_normal}, 25% कमाई घटे तो {year_down25}, "
            "और 40% घटे तो {year_down40}।\n"
            "महीने की कमाई साल की कमाई को बराबर बाँटकर दिखाई है। असल में पैसे फसल बिकने के समय पर निर्भर हैं। "
            "बैंक की किस्त का हिसाब अलग हो सकता है; बैंक से पक्का करें। यह सिर्फ़ समझने में मदद है, सलाह नहीं।"
        ),
        "remainder_label": {
            "negative": "घाटा",
            "thin": "बहुत कम बचत",
            "positive": "बचत",
        },
        "verdict_outcome": {
            "negative": "{amount} रुपये की कमी होगी",
            "thin": "{amount} रुपये ही बचेंगे",
            "positive": "{amount} रुपये की बचत",
        },
        "screen_remainder": {
            "negative": "{amount} रुपये की कमी",
            "thin": "{amount} रुपये ही बचेंगे",
            "positive": "{amount} रुपये की बचत",
        },
        "normal_verdict": {
            "negative": "सामान्य साल में किस्त देने के बाद करीब {amount} रुपये कम पड़ेंगे।",
            "thin": "सामान्य साल में किस्त देने के बाद आपके पास केवल करीब {amount} रुपये बचेंगे।",
            "positive": "सामान्य साल में किस्त देने के बाद आपके पास करीब {amount} रुपये बचेंगे।",
        },
        "drop_verdict": {
            "negative": "अगर कमाई {drop} कम हो, तो साल में करीब {amount} रुपये कम पड़ेंगे।",
            "thin": "अगर कमाई {drop} कम हो, तो साल में केवल करीब {amount} रुपये बचेंगे।",
            "positive": "अगर कमाई {drop} कम हो, तो साल में करीब {amount} रुपये बचेंगे।",
        },
        "spoken_drop_labels": {25: "पच्चीस प्रतिशत", 40: "चालीस प्रतिशत"},
        "spoken_explanation": (
            "{verdict} महीने की किस्त करीब {kist} रुपये है। "
            "बैंक से किस्त और तारीख पक्की कर लें।"
        ),
        "hiring_comparison": (
            "\nखरीदने का औसत सालाना खर्च {buying} रुपये और किराये का खर्च {hiring} रुपये है। "
            "इस तुलना में चलाने-रखरखाव का खर्च (जैसे डीज़ल, मरम्मत, चारा), फीस और बाद में बेचने पर मिलने वाला पैसा शामिल नहीं है।"
        ),
        "teach_question": "अगर फसल कम हुई, तो क्या कर्ज़ की किस्त फिर भी देनी होगी?",
        "teach_retry": (
            "कोई बात नहीं। जैसे दुकान में बिक्री कम हो, तब भी दुकान का किराया देना पड़ता है। "
            "वैसे ही फसल कम हो, तब भी किस्त की तारीख पर किस्त देनी होती है।"
        ),
        "teach_retry_question": "क्या फसल कम होने पर भी किस्त देनी होगी?",
        "teach_finish": "कोई बात नहीं। यह बात बैंक से भी पूछ सकते हैं।",
        "teach_pass": "सही, खराब फसल से किस्त अपने-आप माफ़ नहीं होती।",
        "goodbye": "बात करने के लिए धन्यवाद।",
        "unknown_teach": "कृपया हाँ या नहीं में बताइए।",
        "teach_yes": ("हाँ", "हां", "देनी", "देना", "पड़ेगी", "भरनी", "due", "pay", "yes", "haan", "still"),
        "teach_no": ("नहीं", "नही", "नहीं देनी", "नहीं देना", "माफ़", "माफ", "no", "nahi", "nahin", "waive"),
    },
    "en": {
        "welcome": "Let's understand your farm loan and its instalment.",
        "questions": {
            "asset_price": "What is the price of the @@ASSET@@, in rupees?",
            "down_payment": "How much will you pay upfront, in rupees?",
            "yearly_interest_rate_percent": "What is the yearly interest rate, in percent?",
            "tenure_years": "How many years is the loan for?",
            "yearly_farm_income": "How much do you earn from farming in a year?",
            "monthly_costs": "What are your household and farm costs per month?",
            "monthly_existing_loan_payments": "How much do you pay each month on other loans? Say zero if none.",
            "yearly_hiring_spend": "How much do you spend in a year hiring or renting for the same work? Say skip if you do not know.",
        },
        "readback": "I understood: {slot} {amount} {unit}. Is that correct?",
        "slot_names": {
            "asset_price": "price of the @@ASSET@@",
            "down_payment": "upfront payment",
            "yearly_interest_rate_percent": "yearly interest rate",
            "tenure_years": "loan term",
            "yearly_farm_income": "yearly farm income",
            "monthly_costs": "monthly household and farm costs",
            "monthly_existing_loan_payments": "monthly payments on other loans",
            "yearly_hiring_spend": "yearly hiring or renting spend",
        },
        "units": {
            "yearly_interest_rate_percent": "percent",
            "tenure_years": "years",
            "yearly_farm_income": "rupees",
            "monthly_costs": "rupees",
            "monthly_existing_loan_payments": "rupees",
            "yearly_hiring_spend": "rupees",
            "asset_price": "rupees",
            "down_payment": "rupees",
        },
        "confirm_yes": ("yes", "correct", "right", "okay", "ok", "yeah"),
        "confirm_no": ("no", "wrong", "change", "incorrect"),
        "repeat_value": "I could not understand a clear number. {question}",
        "unrealistic": "That number does not look valid. Please tell me again. {question}",
        "correction_prompt": "Okay, please tell me the corrected number. {question}",
        "optional_skip": ("skip", "don't know", "do not know", "rather not", "no"),
        "optional_skipped": "Okay, we will leave that blank.",
        "engine_error": "I could not calculate with those details: {error} Please provide a valid number.",
        "scenario_titles": ("Normal year", "Income down 25%", "Income down 40%"),
        "explanation": (
            "With these inputs, the loan is {loan} rupees and the monthly instalment is about {kist} rupees. "
            "Total interest is about {interest} rupees.\n"
            "Monthly view: normal year {normal}, income down 25% {down25}, "
            "and down 40% {down40}.\n"
            "Yearly view: normal year {year_normal}, down 25% {year_down25}, "
            "and down 40% {year_down40}.\n"
            "Monthly income is yearly income spread evenly across months. Actual cash flow depends on when crops are sold. "
            "The lender's payment schedule may differ; confirm it with the lender. This is educational support, not advice."
        ),
        "remainder_label": {
            "negative": "negative",
            "thin": "very little left",
            "positive": "left over",
        },
        "verdict_outcome": {
            "negative": "a shortfall of {amount} rupees",
            "thin": "only {amount} rupees remains",
            "positive": "{amount} rupees left over",
        },
        "screen_remainder": {
            "negative": "{amount} rupees shortfall",
            "thin": "only {amount} rupees left",
            "positive": "{amount} rupees left over",
        },
        "normal_verdict": {
            "negative": "In a normal year, {outcome} after the instalment.",
            "thin": "In a normal year, {outcome} after the instalment.",
            "positive": "In a normal year, {outcome} after the instalment.",
        },
        "drop_verdict": {
            "negative": "If income falls by {drop}, {outcome}.",
            "thin": "If income falls by {drop}, {outcome}.",
            "positive": "If income falls by {drop}, {outcome}.",
        },
        "spoken_drop_labels": {25: "twenty five percent", 40: "forty percent"},
        "screen_remainder": {
            "negative": "{amount} rupees shortfall",
            "thin": "only {amount} rupees left",
            "positive": "{amount} rupees left over",
        },
        "normal_verdict": {
            "negative": "In a normal year, you will be short by about {amount} rupees after the instalment.",
            "thin": "In a normal year, only about {amount} rupees will remain after the instalment.",
            "positive": "In a normal year, about {amount} rupees will remain after the instalment.",
        },
        "drop_verdict": {
            "negative": "If income falls by {drop}, the year will be short by about {amount} rupees.",
            "thin": "If income falls by {drop}, only about {amount} rupees will remain for the year.",
            "positive": "If income falls by {drop}, about {amount} rupees will remain for the year.",
        },
        "spoken_explanation": (
            "{verdict} The monthly instalment is about {kist} rupees. "
            "Confirm the exact instalment and its date with the lender."
        ),
        "hiring_comparison": (
            "\nEstimated yearly buying cash outlay is {buying} rupees and hiring or renting is {hiring} rupees. "
            "This comparison excludes running costs such as fuel, repairs or feed, fees, and the resale value of what you buy."
        ),
        "teach_question": "If the harvest is poor, will the loan instalment still need to be paid?",
        "teach_retry": (
            "That is okay. If a shop has fewer sales, its rent still needs to be paid. "
            "In the same way, the instalment is due on its date even if the harvest is small."
        ),
        "teach_retry_question": "If the harvest is poor, is the instalment still due?",
        "teach_finish": "That is okay. You can also ask the lender about this.",
        "teach_pass": "Correct. A poor harvest does not automatically cancel the instalment.",
        "goodbye": "Thank you for talking with me.",
        "unknown_teach": "Please answer yes or no.",
        "teach_yes": ("yes", "still", "pay", "due", "must", "have to", "haan"),
        "teach_no": ("no", "not due", "don't pay", "do not pay", "waived", "forgiven"),
    },
}


LOAN_PURPOSES = ("equipment", "irrigation", "livestock", "other")
DEFAULT_PURPOSE = "other"

# Noun for what the loan buys, already shaped to fit "<noun> की कीमत" (hi),
# "price of the <noun>" (en).
PURPOSE_NOUNS = {
    "equipment": {"hi": "उपकरण (जैसे ट्रैक्टर)", "en": "equipment"},
    "irrigation": {"hi": "सिंचाई व्यवस्था", "en": "irrigation setup"},
    "livestock": {"hi": "पशुओं", "en": "livestock"},
    "other": {"hi": "खरीदी जाने वाली चीज़", "en": "item you are buying"},
}

# Words a farmer might say first. Checked in this order; first match wins.
_PURPOSE_KEYWORDS = (
    ("irrigation", (
        "borewell", "bore well", "pump", "drip", "sprinkler", "irrigation",
        "बोरवेल", "पंप", "ड्रिप", "सिंचाई",
    )),
    ("livestock", (
        "cow", "buffalo", "dairy", "goat", "cattle", "livestock",
        "गाय", "भैंस", "डेयरी", "बकरी", "पशु",
    )),
    ("equipment", (
        "tractor", "harvester", "tiller", "equipment", "machine",
        "ट्रैक्टर", "हार्वेस्टर", "मशीन", "उपकरण",
    )),
)


def detect_loan_purpose(text: str) -> str | None:
    """Return the loan purpose named in ``text``, or None if it names none."""
    lowered = text.casefold()
    for purpose, words in _PURPOSE_KEYWORDS:
        if any(word.casefold() in lowered for word in words):
            return purpose
    return None


def _fill_asset(value: Any, noun: str) -> Any:
    if isinstance(value, str):
        return value.replace("@@ASSET@@", noun)
    if isinstance(value, dict):
        return {key: _fill_asset(item, noun) for key, item in value.items()}
    if isinstance(value, tuple):
        return tuple(_fill_asset(item, noun) for item in value)
    if isinstance(value, list):
        return [_fill_asset(item, noun) for item in value]
    return value


_TEXT_CACHE: dict[tuple[str, str], dict] = {}


def get_text(language: str = "hi", purpose: str = DEFAULT_PURPOSE) -> dict:
    """Return user-facing strings for a language and loan purpose."""
    if language not in STRINGS:
        raise ValueError("language must be 'hi' or 'en'.")
    if purpose not in PURPOSE_NOUNS:
        raise ValueError(f"purpose must be one of {', '.join(LOAN_PURPOSES)}.")
    key = (language, purpose)
    if key not in _TEXT_CACHE:
        _TEXT_CACHE[key] = _fill_asset(STRINGS[language], PURPOSE_NOUNS[purpose][language])
    return _TEXT_CACHE[key]


def format_rupees(value: float) -> str:
    """Format a number with Indian comma grouping without changing its value."""
    rounded = round(value)
    whole = str(abs(rounded))
    if len(whole) > 3:
        last_three = whole[-3:]
        remaining = whole[:-3]
        groups = []
        while remaining:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        whole = ",".join(groups + [last_three])
    return f"-{whole}" if rounded < 0 else whole


_HI_SMALL_NUMBERS = (
    "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
    "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह",
    "अठारह", "उन्नीस", "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस",
    "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस", "इकतीस", "बत्तीस",
    "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
    "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस",
    "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास", "इक्यावन",
    "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन",
    "उनसठ", "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ",
    "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर",
    "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
    "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी",
    "सतासी", "अठासी", "नवासी", "नब्बे", "इक्यानवे", "बानवे", "तिरानवे",
    "चौरानवे", "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
)
_EN_SMALL_NUMBERS = (
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
)
_EN_TENS = (
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
    "eighty", "ninety",
)


def _under_hundred(value: int, language: str) -> str:
    if language == "hi":
        return _HI_SMALL_NUMBERS[value]
    if value < 20:
        return _EN_SMALL_NUMBERS[value]
    tens, ones = divmod(value, 10)
    return _EN_TENS[tens] if ones == 0 else f"{_EN_TENS[tens]} {_EN_SMALL_NUMBERS[ones]}"


def _under_thousand(value: int, language: str) -> str:
    hundreds, remainder = divmod(value, 100)
    if not hundreds:
        return _under_hundred(remainder, language)
    if language == "hi":
        prefix = f"{_under_hundred(hundreds, language)} सौ"
    else:
        prefix = f"{_under_hundred(hundreds, language)} hundred"
    return prefix if remainder == 0 else f"{prefix} {_under_hundred(remainder, language)}"


def _positive_number_to_words(value: int, language: str) -> str:
    if value < 1_000:
        return _under_thousand(value, language)

    groups: list[tuple[int, str]] = []
    crore, value = divmod(value, 10_000_000)
    lakh, value = divmod(value, 100_000)
    thousand, value = divmod(value, 1_000)
    if crore:
        groups.append((crore, "करोड़" if language == "hi" else "crore"))
    if lakh:
        groups.append((lakh, "लाख" if language == "hi" else "lakh"))
    if thousand:
        groups.append((thousand, "हज़ार" if language == "hi" else "thousand"))
    parts = [f"{_under_thousand(amount, language)} {scale}" for amount, scale in groups]
    if value:
        parts.append(_under_thousand(value, language))
    return " ".join(parts)


def amount_to_words(value: int | float, language: str = "hi") -> str:
    """Speak a rupee amount in Hindi or English."""
    if language not in ("hi", "en"):
        raise ValueError("language must be 'hi' or 'en'.")
    try:
        amount = Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("amount must be a finite number.") from exc
    if not amount.is_finite():
        raise ValueError("amount must be a finite number.")
    rounded = int(amount)
    if rounded < 0:
        prefix = "घाटा" if language == "hi" else "shortfall of"
        return f"{prefix} {_positive_number_to_words(abs(rounded), language)}"
    return _positive_number_to_words(rounded, language)


def numbers_to_spoken_words(text: str, language: str = "hi") -> str:
    """Replace numeric tokens with words before sending text to speech."""
    if language not in ("hi", "en"):
        raise ValueError("language must be 'hi' or 'en'.")

    pattern = re.compile(r"(?<![\w])[-+]?\d[\d,]*(?:\.\d+)?%?")

    def replace(match: re.Match[str]) -> str:
        token = match.group()
        is_percent = token.endswith("%")
        numeric = token[:-1] if is_percent else token
        try:
            value = Decimal(numeric.replace(",", ""))
        except InvalidOperation as exc:
            raise ValueError("text contains an invalid number.") from exc
        if not value.is_finite():
            raise ValueError("text contains a non-finite number.")

        whole = int(abs(value))
        words = _positive_number_to_words(whole, language)
        fraction = format(abs(value), "f").partition(".")[2].rstrip("0")
        if fraction:
            decimal_word = "दशमलव" if language == "hi" else "point"
            words = " ".join(
                (words, decimal_word, *(_positive_number_to_words(int(digit), language) for digit in fraction))
            )
        if value < 0:
            words = (
                f"घाटा {words}" if language == "hi" else f"shortfall of {words}"
            )
        if is_percent:
            words = f"{words} {'प्रतिशत' if language == 'hi' else 'percent'}"
        return words

    return pattern.sub(replace, text)


def build_explanations(result: Any, language: str = "hi") -> tuple[str, str]:
    """Return short spoken and detailed screen explanations from engine output."""
    strings = get_text(language)
    scenarios = {item.income_drop_percent: item for item in result.scenarios}
    normal = scenarios[0.0].affordability
    down25 = scenarios[25.0].affordability
    down40 = scenarios[40.0].affordability

    def verdict_line(affordability: Any, scenario_drop: int | None, spoken: bool) -> str:
        template = (
            strings["normal_verdict"][affordability.yearly_status]
            if scenario_drop is None
            else strings["drop_verdict"][affordability.yearly_status]
        )
        amount = (
            amount_to_words(abs(affordability.yearly_money_left), language)
            if spoken
            else format_rupees(abs(affordability.yearly_money_left))
        )
        if scenario_drop is None:
            return template.format(amount=amount)
        drop = (
            strings["spoken_drop_labels"][scenario_drop]
            if spoken
            else f"{scenario_drop}%"
        )
        return template.format(drop=drop, amount=amount)

    spoken_verdict = " ".join(
        (
            verdict_line(normal, None, spoken=True),
            verdict_line(down25, 25, spoken=True),
            verdict_line(down40, 40, spoken=True),
        )
    )
    spoken = strings["spoken_explanation"].format(
        verdict=spoken_verdict,
        kist=amount_to_words(result.monthly_kist, language),
    )

    screen_verdict = " ".join(
        (
            verdict_line(normal, None, spoken=False),
            verdict_line(down25, 25, spoken=False),
            verdict_line(down40, 40, spoken=False),
        )
    )

    def screen_remainder(affordability: Any, monthly: bool) -> str:
        value = (
            affordability.monthly_money_left
            if monthly
            else affordability.yearly_money_left
        )
        return strings["screen_remainder"][affordability.monthly_status if monthly else affordability.yearly_status].format(
            amount=format_rupees(abs(value))
        )

    screen = (
        f"{screen_verdict}\n"
        + strings["explanation"].format(
            loan=format_rupees(result.loan_amount),
            kist=format_rupees(result.monthly_kist),
            interest=format_rupees(result.total_interest),
            normal=screen_remainder(normal, monthly=True),
            down25=screen_remainder(down25, monthly=True),
            down40=screen_remainder(down40, monthly=True),
            year_normal=screen_remainder(normal, monthly=False),
            year_down25=screen_remainder(down25, monthly=False),
            year_down40=screen_remainder(down40, monthly=False),
        )
    )
    if result.buy_rent_comparison is not None:
        comparison = result.buy_rent_comparison
        screen += strings["hiring_comparison"].format(
            buying=format_rupees(comparison.yearly_buying_cash_outlay),
            hiring=format_rupees(comparison.yearly_hiring_spend),
        )
    return spoken, screen
