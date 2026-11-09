"""Rule-based slot filling and teach-back for the farm-loan conversation."""

from dataclasses import dataclass
import re
import unicodedata
from finance_engine import FinanceInputError, FinanceResult, calculate_farm_loan
from explanation_engine import DEFAULT_PURPOSE, build_explanations, format_rupees, get_text


@dataclass(frozen=True)
class SlotValue:
    value: float | int | None
    status: str


SLOT_ORDER = (
    "asset_price",
    "down_payment",
    "yearly_interest_rate_percent",
    "tenure_years",
    "yearly_farm_income",
    "monthly_costs",
    "monthly_existing_loan_payments",
    "yearly_hiring_spend",
)
REQUIRED_SLOTS = SLOT_ORDER[:-1]

_ALIASES = {
    "asset_price": (
        "asset price", "tractor price", "tractor cost", "equipment price", "cost", "price",
        "कीमत", "दाम", "मूल्य", "लागत", "ट्रैक्टर",
    ),
    "down_payment": ("down payment", "downpayment", "advance", "upfront", "अग्रिम", "डाउन पेमेंट", "जमा"),
    "yearly_interest_rate_percent": ("interest rate", "yearly interest", "interest", "ब्याज", "दर"),
    "tenure_years": ("tenure", "loan term", "loan duration", "years", "year", "साल", "वर्ष", "अवधि"),
    "yearly_farm_income": ("yearly income", "annual income", "farm income", "income", "कमाई", "आमदनी", "आय"),
    "monthly_costs": ("monthly costs", "monthly expenses", "costs", "expenses", "खर्च", "मासिक खर्च"),
    "monthly_existing_loan_payments": (
        "existing loan payments", "other loan payments", "loan payments", "other loans",
        "loan emi", "other emi", "दूसरे कर्ज़", "दूसरे कर्ज", "मौजूदा कर्ज", "मौजूदा क़र्ज़",
    ),
    "yearly_hiring_spend": (
        "yearly hiring", "tractor hiring", "hiring spend", "tractor rent", "rent", "hire",
        "किराये का खर्च", "किराए का खर्च", "ट्रैक्टर किराये", "ट्रैक्टर किराए",
        "किराये", "किराए", "किराया", "भाड़ा",
    ),
}

_NUMBER_WORDS = {
    "zero": 0, "shunya": 0, "शून्य": 0,
    "one": 1, "ek": 1, "एक": 1,
    "two": 2, "do": 2, "दो": 2,
    "three": 3, "teen": 3, "tin": 3, "तीन": 3,
    "four": 4, "char": 4, "chaar": 4, "चार": 4,
    "five": 5, "panch": 5, "paanch": 5, "पांच": 5, "पाँच": 5,
    "six": 6, "chhe": 6, "chhah": 6, "che": 6, "छह": 6, "छे": 6,
    "seven": 7, "saat": 7, "sat": 7, "सात": 7,
    "eight": 8, "aath": 8, "आठ": 8,
    "nine": 9, "nau": 9, "नौ": 9,
    "ten": 10, "das": 10, "dus": 10, "दस": 10,
    "eleven": 11, "gyarah": 11, "ग्यारह": 11,
    "twelve": 12, "barah": 12, "बारह": 12,
    "thirteen": 13, "terah": 13, "तेरह": 13,
    "fourteen": 14, "chaudah": 14, "चौदह": 14,
    "fifteen": 15, "pandrah": 15, "पंद्रह": 15, "पन्द्रह": 15,
    "sixteen": 16, "solah": 16, "सोलह": 16,
    "seventeen": 17, "satrah": 17, "सत्रह": 17,
    "eighteen": 18, "atharah": 18, "अठारह": 18,
    "nineteen": 19, "unnis": 19, "उन्नीस": 19,
    "twenty": 20, "bees": 20, "bis": 20, "बीस": 20,
    "thirty": 30, "tees": 30, "तीस": 30,
    "forty": 40, "chalis": 40, "चालीस": 40,
    "fifty": 50, "pachas": 50, "पचास": 50,
    "sixty": 60, "saath": 60, "साठ": 60,
    "seventy": 70, "sattar": 70, "सत्तर": 70,
    "eighty": 80, "assi": 80, "अस्सी": 80,
    "ninety": 90, "nabbe": 90, "नब्बे": 90,
    "hundred": 100, "sau": 100, "सौ": 100, "शंभर": 100,
    "thousand": 1_000, "hazar": 1_000, "hazaar": 1_000,
    "हजार": 1_000, "हज़ार": 1_000,
    "lakh": 100_000, "lac": 100_000, "लाख": 100_000,
    "million": 1_000_000,
    "crore": 10_000_000, "करोड़": 10_000_000, "करोड": 10_000_000,
}
_PERCENT_WORDS = {"percent", "percentage", "प्रतिशत", "फीसदी"}
_TOKEN_RE = re.compile(
    r"(?<![\w])[-+]?\d[\d,]*(?:\.\d+)?|[\u0900-\u097F]+|[^\W\d_]+|%",
    re.UNICODE,
)


def _normalize_word(word: str) -> str:
    normalized = unicodedata.normalize("NFKD", word.casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _word_value(word: str) -> int | None:
    if word in _NUMBER_WORDS:
        return _NUMBER_WORDS[word]
    return _NUMBER_WORDS.get(_normalize_word(word))


def _is_scale(value: int) -> bool:
    return value in (100, 1_000, 100_000, 1_000_000, 10_000_000)


_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _is_digit_token(token: str) -> bool:
    return token.lstrip("+-")[:1].isdigit()


def _parse_amount(tokens: list[str], start: int) -> tuple[float, int] | None:
    """Read one amount that may mix digits and number words: "6 lakh", "1.5 लाख", "6 lakh 50 hazar".

    A digit can start an amount or follow a scale word (hundred, thousand, lakh, crore); two plain
    numbers side by side ("9 5") stay separate amounts.
    """
    total = 0.0
    current = 0.0
    index = start
    found = False
    previous = "start"  # "start", "scale", "digit" or "word"
    while index < len(tokens):
        token = tokens[index]
        if _is_digit_token(token):
            if previous not in ("start", "scale"):
                break
            try:
                current += float(token.replace(",", ""))
            except ValueError:
                break
            previous = "digit"
        else:
            value = _word_value(token)
            if value is None:
                break
            if value == 100:
                current = max(current, 1) * 100
                previous = "scale"
            elif value >= 1_000:
                total += max(current, 1) * value
                current = 0
                previous = "scale"
            else:
                if previous == "digit":
                    break
                current += value
                previous = "word"
        found = True
        index += 1
    if not found:
        return None
    return total + current, index


def _number_positions(text: str) -> list[tuple[int, float]]:
    """Every amount in the text with the character position where it starts."""
    spans = [(match.start(), match.group()) for match in _TOKEN_RE.finditer(text.translate(_DEVANAGARI_DIGITS))]
    tokens = [token for _, token in spans]
    numbers: list[tuple[int, float]] = []
    index = 0
    while index < len(tokens):
        parsed = _parse_amount(tokens, index)
        if parsed is None:
            index += 1
            continue
        value, next_index = parsed
        numbers.append((spans[index][0], value))
        index = next_index
    return numbers


def parse_numbers(text: str) -> list[float]:
    """Extract numeric values from digits and common Hindi/Hinglish/English number words."""
    return [value for _, value in _number_positions(text)]


def _is_percent_expression(text: str, number_index: int = 0) -> bool:
    normalized = text.casefold()
    return "%" in normalized or any(word in normalized for word in _PERCENT_WORDS)


def _contains_any(text: str, phrases: tuple[str, ...]) -> bool:
    folded = text.casefold()
    return any(phrase.casefold() in folded for phrase in phrases)


def _field_mentions(text: str) -> list[tuple[int, int, str]]:
    candidates: list[tuple[int, int, str]] = []
    for slot, aliases in _ALIASES.items():
        for alias in aliases:
            escaped = re.escape(alias)
            if alias.isascii():
                escaped = rf"(?<![A-Za-z]){escaped}(?![A-Za-z])"
            for match in re.finditer(escaped, text, re.IGNORECASE):
                candidates.append((match.start(), match.end(), slot))

    selected: list[tuple[int, int, str]] = []
    for candidate in sorted(candidates, key=lambda item: (item[0], -(item[1] - item[0]))):
        start, end, _ = candidate
        if any(start < selected_end and end > selected_start
               for selected_start, selected_end, _ in selected):
            continue
        selected.append(candidate)
    return sorted(selected)


def extract_slot_values(text: str, current_slot: str) -> list[tuple[str, float]]:
    """Extract explicit slot/value pairs, or assign an unlabelled number to the asked slot."""
    numbers = _number_positions(text)

    mentions = _field_mentions(text)
    if not mentions:
        return [(current_slot, numbers[0][1])] if numbers else []
    extracted: list[tuple[str, float]] = []
    for mention_index, (start, end, slot) in enumerate(mentions):
        next_start = mentions[mention_index + 1][0] if mention_index + 1 < len(mentions) else len(text) + 1
        number = next((value for position, value in numbers if end <= position < next_start), None)
        if number is not None and (not extracted or extracted[-1] != (slot, number)):
            extracted.append((slot, number))
    if not extracted and len(mentions) == 1 and len(numbers) == 1:
        extracted.append((mentions[0][2], numbers[0][1]))
    return extracted


class ConversationAgent:
    """A deterministic, text-only conversation. It makes no network requests."""

    def __init__(self, language: str = "hi", purpose: str = DEFAULT_PURPOSE) -> None:
        self.language = language
        self.purpose = purpose
        self.text = get_text(language, purpose)
        self.slots: dict[str, SlotValue] = {
            name: SlotValue(None, "missing") for name in SLOT_ORDER
        }
        self.state = "not_started"
        self.current_slot: str | None = None
        self.pending: tuple[str, float | int] | None = None
        self._queued_values: list[tuple[str, float]] = []
        self._teach_attempts = 0
        self.result: FinanceResult | None = None
        self.spoken_explanation: str | None = None
        self.screen_explanation: str | None = None
        self.spoken_teach_question: str | None = None

    def set_language(self, language: str) -> None:
        self.language = language
        self.text = get_text(language, self.purpose)
        if self.state == "teach_back":
            self.spoken_teach_question = self.text["teach_question"]

    def start(self) -> str:
        if self.state != "not_started":
            raise RuntimeError("This conversation has already started.")
        self.state = "collecting"
        first_question = self._next_missing_question()
        return f"{self.text['welcome']}\n{first_question}"

    def _next_missing_question(self) -> str:
        for slot in REQUIRED_SLOTS:
            if self.slots[slot].status == "missing":
                self.current_slot = slot
                return self.text["questions"][slot]
        self.current_slot = "yearly_hiring_spend"
        return self.text["questions"]["yearly_hiring_spend"]

    def _readback(self, slot: str, value: float | int) -> str:
        self.current_slot = slot
        self.pending = (slot, value)
        formatted = format_rupees(value)
        unit = self.text["units"][slot]
        return self.text["readback"].format(
            slot=self.text["slot_names"][slot],
            amount=formatted,
            unit=unit,
        )

    def _validate_candidate(self, slot: str, value: float) -> str | None:
        if value < 0:
            return self.text["unrealistic"].format(
                question=self.text["questions"][slot]
            )
        if slot == "asset_price" and value == 0:
            return self.text["unrealistic"].format(
                question=self.text["questions"][slot]
            )
        if slot == "yearly_interest_rate_percent" and value > 100:
            return self.text["unrealistic"].format(
                question=self.text["questions"][slot]
            )
        if slot == "tenure_years" and (value < 1 or value > 50 or not value.is_integer()):
            return self.text["unrealistic"].format(
                question=self.text["questions"][slot]
            )
        if slot == "asset_price":
            down = self.slots["down_payment"].value
            if down is not None and value <= down:
                return self.text["unrealistic"].format(
                    question=self.text["questions"][slot]
                )
        if slot == "down_payment":
            price = self.slots["asset_price"].value
            if price is not None and value >= price:
                return self.text["unrealistic"].format(
                    question=self.text["questions"][slot]
                )
        return None

    def _read_next_candidate(self) -> str | None:
        while self._queued_values:
            slot, value = self._queued_values.pop(0)
            error = self._validate_candidate(slot, value)
            if error:
                self.current_slot = slot
                return error
            return self._readback(slot, value)
        return None

    def _build_result(self) -> str:
        values = {name: item.value for name, item in self.slots.items()}
        try:
            self.result = calculate_farm_loan(
                asset_price=values["asset_price"],
                down_payment=values["down_payment"],
                yearly_interest_rate_percent=values["yearly_interest_rate_percent"],
                tenure_years=int(values["tenure_years"]),
                yearly_farm_income=values["yearly_farm_income"],
                monthly_costs=values["monthly_costs"],
                monthly_existing_loan_payments=values["monthly_existing_loan_payments"],
                yearly_hiring_spend=values["yearly_hiring_spend"],
            )
        except (FinanceInputError, TypeError, ValueError) as exc:
            self.state = "collecting"
            self.current_slot = "asset_price"
            return self.text["engine_error"].format(error=str(exc))
        self.spoken_explanation, self.screen_explanation = build_explanations(
            self.result, self.language
        )
        self.spoken_teach_question = self.text["teach_question"]
        self.state = "teach_back"
        return f"{self.screen_explanation}\n{self.text['teach_question']}"

    def _finish_optional(self) -> str:
        self.slots["yearly_hiring_spend"] = SlotValue(None, "missing")
        return self._build_result()

    def _confirm_pending(self, answer: str) -> str:
        assert self.pending is not None
        slot, value = self.pending
        yes = _contains_any(answer, self.text["confirm_yes"])
        no = _contains_any(answer, self.text["confirm_no"])
        if yes and not no:
            self.slots[slot] = SlotValue(int(value) if slot == "tenure_years" else value, "given")
            self.pending = None
            queued = self._read_next_candidate()
            if queued:
                return queued
            if all(self.slots[name].status != "missing" for name in REQUIRED_SLOTS):
                if self.slots["yearly_hiring_spend"].status != "missing":
                    return self._build_result()
                self.current_slot = "yearly_hiring_spend"
                return self.text["questions"]["yearly_hiring_spend"]
            return self._next_missing_question()
        correction = extract_slot_values(answer, slot)
        if correction and (not yes or no):
            correction_slot, corrected_value = correction[0]
            validation = self._validate_candidate(correction_slot, corrected_value)
            if validation:
                return validation
            return self._readback(correction_slot, corrected_value)
        if no:
            self.pending = None
            self.current_slot = slot
            return self.text["correction_prompt"].format(
                question=self.text["questions"][slot]
            )
        return self.text["repeat_value"].format(
            question=self.text["readback"].format(
                slot=self.text["slot_names"][slot],
                amount=format_rupees(value),
                unit=self.text["units"][slot],
            )
        )

    def _teach_back(self, answer: str) -> str:
        self._teach_attempts += 1
        no = _contains_any(answer, self.text["teach_no"])
        yes = _contains_any(answer, self.text["teach_yes"])
        if yes and not no:
            self.state = "complete"
            return f"{self.text['teach_pass']}\n{self.text['goodbye']}"
        if self._teach_attempts == 1:
            self.spoken_teach_question = self.text["teach_retry_question"]
            return f"{self.text['teach_retry']}\n{self.spoken_teach_question}"
        self.state = "complete"
        return f"{self.text['teach_finish']}\n{self.text['goodbye']}"

    def respond(self, answer: str) -> str:
        if self.state == "not_started":
            raise RuntimeError("Call start() before respond().")
        if self.state == "complete":
            return self.text["goodbye"]
        if self.state == "teach_back":
            if not answer.strip():
                return self.text["unknown_teach"]
            return self._teach_back(answer)
        if self.state != "collecting" or self.current_slot is None:
            raise RuntimeError("The conversation is not expecting an answer.")

        if self.pending is not None:
            return self._confirm_pending(answer)

        slot = self.current_slot
        if slot == "yearly_hiring_spend" and self.slots[slot].status == "missing" and _contains_any(
            answer, self.text["optional_skip"]
        ):
            return self._finish_optional()

        candidates = extract_slot_values(answer, slot)
        if not candidates:
            return self.text["repeat_value"].format(
                question=self.text["questions"][slot]
            )
        self._queued_values = candidates[1:]
        candidate_slot, value = candidates[0]
        validation = self._validate_candidate(candidate_slot, value)
        if validation:
            self._queued_values.clear()
            self.current_slot = candidate_slot
            return validation
        return self._readback(candidate_slot, value)

    def mark_assumed(self, slot: str, value: float | int) -> None:
        """Explicitly mark a caller-supplied hypothetical value as assumed."""
        if slot not in SLOT_ORDER:
            raise ValueError(f"Unknown finance slot: {slot}")
        candidate = float(value)
        validation = self._validate_candidate(slot, candidate)
        if validation:
            raise ValueError(validation)
        self.slots[slot] = SlotValue(
            int(candidate) if slot == "tenure_years" else candidate,
            "assumed",
        )
