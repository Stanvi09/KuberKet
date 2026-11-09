"""Sentences about a year of cash flow, built only from finance_engine outputs.

No AI writes these. Each sentence is a template filled with numbers the engine
returned, in Hindi or English. Numbers stay as digits here; the speech endpoint
turns them into words before calling Timbre.
"""

from __future__ import annotations

from dataclasses import asdict

from explanation_engine import format_rupees
from finance_engine import (
    CASHFLOW_ASSUMPTIONS,
    CashflowResult,
    CashflowScenario,
    FinanceInputError,
    crop_calendar,
    monthly_cashflow,
    monthly_installment,
)

LANGUAGES = ("hi", "en")

MONTH_NAMES = {
    "hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
}
CROP_NAMES = {
    "hi": {"paddy": "धान", "wheat": "गेहूँ", "maize": "मक्का"},
    "en": {"paddy": "Paddy", "wheat": "Wheat", "maize": "Maize"},
}
ASSUMPTIONS_HI = (
    "साल भर की कमाई सिर्फ़ कटाई के महीनों में आती है, बराबर बँटी हुई।",
    "घर और खेत का खर्च, दूसरे कर्ज़ की किस्त और यह किस्त पहले महीने से हर महीने देनी होती है।",
    "साल की शुरुआत में बचत शून्य मानी गई है, जब तक आप कोई रकम न डालें।",
    "डाउन पेमेंट इस साल के हिसाब से बाहर चुकाया माना गया है, इसे यहाँ नहीं गिना।",
    "कमाई घटने वाले हिसाब में सिर्फ़ कमाई घटती है; खर्च और किस्त वही रहते हैं।",
    "कटाई के महीने आम तौर पर होने वाले हैं; असल तारीखें जगह और साल के हिसाब से बदलती हैं।",
)

SPOKEN_MODES = ("narration", "answer")


def _months(language: str, indexes: list[int], start_month: int) -> str:
    names = [MONTH_NAMES[language][(start_month - 1 + i - 1) % 12] for i in indexes]
    if len(names) == 1:
        return names[0]
    joiner = " और " if language == "hi" else " and "
    if len(names) == 2:
        return names[0] + joiner + names[1]
    return ", ".join(names[:-1]) + joiner + names[-1]


def _month_name(language: str, start_month: int, index: int) -> str:
    return MONTH_NAMES[language][(start_month - 1 + index - 1) % 12]


def _rupees(value: float) -> str:
    return format_rupees(abs(value))


def _scenario_sentence(language: str, scenario: CashflowScenario, start_month: int) -> str:
    drop = f"{scenario.income_drop_percent:g}"
    negative = list(scenario.negative_month_indexes)
    if language == "hi":
        if not negative:
            return f"अगर कमाई {drop}% कम हो, तब भी किसी महीने हाथ में पैसे कम नहीं पड़ते।"
        return (
            f"अगर कमाई {drop}% कम हो, तो {len(negative)} महीने पैसे कम पड़ेंगे: "
            f"{_months('hi', negative, start_month)}। सबसे कम {_rupees(scenario.lowest_balance)} रुपये "
            f"{'कम' if scenario.lowest_balance < 0 else 'बचे'} रहेंगे।"
        )
    if not negative:
        return f"If income is {drop}% lower, money still does not run short in any month."
    return (
        f"If income is {drop}% lower, money runs short in {len(negative)} months: "
        f"{_months('en', negative, start_month)}. At the lowest point you are "
        f"₹{_rupees(scenario.lowest_balance)} {'short' if scenario.lowest_balance < 0 else 'ahead'}."
    )


def risky_sentence(language: str, scenario: CashflowScenario, start_month: int) -> str:
    """The plain sentence under the chart, naming the risky months."""
    negative = list(scenario.negative_month_indexes)
    if language == "hi":
        if not negative:
            return "इस हिसाब से किसी महीने हाथ में पैसे कम नहीं पड़ते।"
        return f"इन महीनों में हाथ में पैसे कम पड़ेंगे: {_months('hi', negative, start_month)}।"
    if not negative:
        return "On these numbers, money does not run short in any month."
    return f"Money runs short in these months: {_months('en', negative, start_month)}."


def _normal_sentences(
    language: str,
    crop: str,
    result: CashflowResult,
    monthly_outgo: float,
    kist: float,
    yearly_income: float,
) -> list[tuple[str, int]]:
    normal = result.scenarios[0]
    start = result.start_month
    harvest_idx = sorted((m - start) % 12 + 1 for m in result.harvest_months)
    crop_name = CROP_NAMES[language][crop]
    lowest_name = _month_name(language, start, normal.lowest_month_index)
    low = _rupees(normal.lowest_balance)
    if language == "hi":
        first = (
            f"{crop_name} की कमाई साल में {_months('hi', harvest_idx, start)} में आती है, "
            f"कुल करीब {_rupees(yearly_income)} रुपये।"
        )
        second = f"हर महीने खर्च और किस्त मिलाकर {_rupees(monthly_outgo)} रुपये जाते हैं"
        second += f", जिसमें किस्त {_rupees(kist)} रुपये है।" if kist > 0 else "।"
        third = (
            f"सबसे मुश्किल महीना {lowest_name} है, तब हाथ में {low} रुपये कम पड़ेंगे।"
            if normal.lowest_balance < 0
            else f"सबसे कम पैसा {lowest_name} में रहेगा, {low} रुपये।"
        )
    else:
        first = (
            f"{crop_name} income arrives in {_months('en', harvest_idx, start)}, "
            f"about ₹{_rupees(yearly_income)} in the year."
        )
        second = f"Every month about ₹{_rupees(monthly_outgo)} goes out in costs and payments"
        second += f", of which the instalment is ₹{_rupees(kist)}." if kist > 0 else "."
        third = (
            f"The tightest month is {lowest_name}, when you are ₹{low} short."
            if normal.lowest_balance < 0
            else f"The lowest point is {lowest_name}, with ₹{low} in hand."
        )
    return [(first, 1), (second, 1), (third, normal.lowest_month_index)]


def build_cashflow_report(
    *,
    crop: str,
    yearly_income: int | float,
    monthly_costs: int | float,
    monthly_existing_loan_payments: int | float = 0,
    asset_price: int | float = 0,
    down_payment: int | float = 0,
    loan_rate: int | float = 0,
    tenure_years: int = 0,
    savings: int | float = 0,
    income_drop_percent: int | float = 25,
    language: str = "hi",
) -> dict:
    if language not in LANGUAGES:
        raise FinanceInputError("Language must be hi or en.")
    calendar = crop_calendar(crop)
    start_month = int(calendar["sowing_month"])  # type: ignore[arg-type]
    harvest = tuple(calendar["harvest_months"])  # type: ignore[arg-type]
    if asset_price and down_payment >= asset_price:
        raise FinanceInputError("Down payment must be less than the asset price.")
    principal = max(0.0, float(asset_price) - float(down_payment)) if asset_price else 0.0
    kist = monthly_installment(principal, loan_rate, tenure_years) if principal > 0 else 0.0

    drops = (25, 40)
    extra_drop = float(income_drop_percent)
    all_drops = drops if extra_drop in (0, *drops) else (*drops, extra_drop)
    result = monthly_cashflow(
        yearly_income=yearly_income,
        monthly_costs=monthly_costs,
        monthly_existing_loan_payments=monthly_existing_loan_payments,
        monthly_kist=kist,
        harvest_months=harvest,
        start_month=start_month,
        savings=savings,
        income_drop_percentages=all_drops,
    )
    by_drop = {s.income_drop_percent: s for s in result.scenarios}
    selected = by_drop[extra_drop]
    normal = result.scenarios[0]
    outgo = float(monthly_costs) + float(monthly_existing_loan_payments) + kist

    sentences = _normal_sentences(language, crop, result, outgo, kist, float(yearly_income))
    if extra_drop > 0:
        sentences.append((_scenario_sentence(language, selected, start_month), 12))
    narration = [{"text": text, "at_month": month} for text, month in sentences]

    if language == "hi":
        questions = [
            ("सबसे मुश्किल महीना कौन-सा है?", sentences[2][0]),
            ("हर महीने कितना पैसा जाता है?", sentences[1][0]),
            ("कमाई घटे तो क्या होगा?", " ".join(_scenario_sentence("hi", by_drop[d], start_month) for d in drops)),
            ("यह हिसाब किन बातों पर टिका है?", " ".join(ASSUMPTIONS_HI[:3])),
        ]
    else:
        questions = [
            ("Which month is the hardest?", sentences[2][0]),
            ("How much goes out each month?", sentences[1][0]),
            ("What if income falls?", " ".join(_scenario_sentence("en", by_drop[d], start_month) for d in drops)),
            ("What does this assume?", " ".join(CASHFLOW_ASSUMPTIONS[:3])),
        ]
    answers = [{"question": q, "answer": a} for q, a in questions]

    return {
        "crop": crop,
        "crop_name": CROP_NAMES[language][crop],
        "season": calendar["season"],
        "start_month": start_month,
        "harvest_months": list(harvest),
        "month_names": MONTH_NAMES[language],
        "loan_amount": principal,
        "monthly_kist": kist,
        "monthly_outgo": outgo,
        "savings": float(savings),
        "scenarios": [asdict(s) for s in result.scenarios],
        "selected_drop_percent": extra_drop,
        "selected": asdict(selected),
        "risky_sentence": risky_sentence(language, selected, start_month),
        "normal_risky_sentence": risky_sentence(language, normal, start_month),
        "narration": narration,
        "answers": answers,
        "assumptions": list(ASSUMPTIONS_HI if language == "hi" else CASHFLOW_ASSUMPTIONS),
    }
