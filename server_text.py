"""Server messages in both app languages.

Every message the API can show a farmer is listed here once in English and once in Hindi.
``localize`` turns a message into the farmer's language, whichever language it was written in,
so a Hindi screen never shows English server text and an English screen never shows Hindi.
"""

from __future__ import annotations

import re
from typing import Callable

# (English, Hindi). Order does not matter.
PAIRS: tuple[tuple[str, str], ...] = (
    # Finance engine: input checks
    ("Asset price must be greater than zero.", "कीमत शून्य से ज़्यादा होनी चाहिए।"),
    ("At least one harvest month is required.", "कम से कम एक कटाई का महीना चाहिए।"),
    ("Down payment cannot be negative.", "शुरुआती भुगतान शून्य से कम नहीं हो सकता।"),
    ("Down payment must be less than the asset price.", "शुरुआती भुगतान कीमत से कम होना चाहिए।"),
    ("Extra flows must be keyed by a window month from 1 to 12.", "अतिरिक्त रकम 1 से 12 तक के महीने के लिए ही दी जा सकती है।"),
    ("Harvest months must be from 1 to 12.", "कटाई का महीना 1 से 12 के बीच होना चाहिए।"),
    ("Harvest months must not be repeated.", "कटाई का कोई महीना दोबारा नहीं आ सकता।"),
    ("Income, costs and payments cannot be negative.", "कमाई, खर्च और भुगतान शून्य से कम नहीं हो सकते।"),
    ("Income-drop percentages must be from 0 to 100.", "कमाई में कमी 0 से 100 प्रतिशत के बीच होनी चाहिए।"),
    ("Income-drop percentages must be unique values from 0 to 100.", "कमाई में कमी के प्रतिशत 0 से 100 के बीच और अलग-अलग होने चाहिए।"),
    ("Income-drop percentages must not be repeated.", "कमाई में कमी का कोई प्रतिशत दोबारा नहीं आ सकता।"),
    ("Loan amount cannot be negative.", "कर्ज़ की रकम शून्य से कम नहीं हो सकती।"),
    ("Loan tenure must be a whole number of years.", "कर्ज़ की अवधि पूरे सालों में होनी चाहिए।"),
    ("Loan tenure must be at least one whole year.", "कर्ज़ की अवधि कम से कम एक पूरा साल होनी चाहिए।"),
    ("Loan tenure must be at least one year.", "कर्ज़ की अवधि कम से कम एक साल होनी चाहिए।"),
    ("Monthly existing loan payments cannot be negative.", "दूसरे कर्ज़ की मासिक किस्त शून्य से कम नहीं हो सकती।"),
    ("Monthly household and farm costs cannot be negative.", "घर और खेती का मासिक खर्च शून्य से कम नहीं हो सकता।"),
    ("Months must be a positive whole number.", "महीनों की संख्या शून्य से ज़्यादा पूरी संख्या होनी चाहिए।"),
    ("Start month must be from 1 to 12.", "शुरुआती महीना 1 से 12 के बीच होना चाहिए।"),
    ("Thin-remainder limit must be from 0 to 100 percent.", "कम बचत की सीमा 0 से 100 प्रतिशत के बीच होनी चाहिए।"),
    ("Yearly farm income cannot be negative.", "खेती की सालाना कमाई शून्य से कम नहीं हो सकती।"),
    ("Yearly hiring or renting spend cannot be negative.", "किराये का सालाना खर्च शून्य से कम नहीं हो सकता।"),
    ("Yearly interest rate cannot be negative.", "सालाना ब्याज दर शून्य से कम नहीं हो सकती।"),
    # Finance engine: assumptions shown under "Assumptions in this estimate"
    ("Actual cash flow depends on when the crop is sold.", "असली नकदी इस पर निर्भर है कि फसल कब बिकती है।"),
    ("Harvest months are typical for the crop; actual dates vary by place and year.", "कटाई के महीने इस फसल के आम महीने हैं; असली तारीखें जगह और साल के हिसाब से बदलती हैं।"),
    ("Household and farm costs, other loan payments and the instalment fall due every month, starting in the first month.", "घर और खेती का खर्च, दूसरे कर्ज़ की किस्तें और यह किस्त पहले महीने से हर महीने देनी होती हैं।"),
    ("Income-drop scenarios change farm income only; costs and existing loan payments stay unchanged.", "कमाई घटने वाले हिसाब में सिर्फ़ खेती की कमाई बदली जाती है; खर्च और दूसरे कर्ज़ की किस्तें वही रहती हैं।"),
    ("Income-drop scenarios lower income only; costs and payments stay the same.", "कमाई घटने वाले हिसाब में सिर्फ़ कमाई घटती है; खर्च और किस्तें वही रहती हैं।"),
    ("Monthly income is yearly farm income spread evenly over 12 months.", "महीने की कमाई = खेती की सालाना कमाई को 12 महीनों में बराबर बाँटकर।"),
    ("No lender fees, insurance, or taxes are included in the loan calculation.", "कर्ज़ के हिसाब में बैंक की फीस, बीमा या टैक्स शामिल नहीं हैं।"),
    ("Savings at the start of the year are assumed to be zero unless you enter a figure.", "जब तक आप रकम न बताएँ, साल की शुरुआत में बचत शून्य मानी गई है।"),
    ("The buy-versus-hiring comparison excludes running costs such as fuel, repairs or feed, fees, and the resale value of what is bought.", "खरीद और किराये की तुलना में चलाने का खर्च (जैसे डीज़ल, मरम्मत, चारा), फीस और बाद में बेचने की कीमत शामिल नहीं है।"),
    ("The buy-versus-hiring comparison is omitted unless yearly hiring or renting spend is provided.", "किराये का सालाना खर्च बताने पर ही खरीद और किराये की तुलना दिखती है।"),
    ("The down payment is assumed to be paid from savings outside this year and is not counted here.", "शुरुआती भुगतान इस साल से बाहर की बचत से दिया माना गया है और यहाँ नहीं गिना गया।"),
    ("The instalment is a fixed monthly payment on a reducing loan balance.", "किस्त घटते हुए बकाया कर्ज़ पर हर महीने की तय रकम है।"),
    ("The yearly interest rate is fixed and divided into monthly periods.", "सालाना ब्याज दर तय मानी गई है और उसे महीनों में बाँटा गया है।"),
    ("Yearly income arrives only in the harvest months, split equally between them.", "सालाना कमाई सिर्फ़ कटाई के महीनों में आती है, उनमें बराबर बँटकर।"),
    # API: requests and documents
    ("A document term was selected more than once.", "दस्तावेज़ की एक ही शर्त एक से ज़्यादा बार चुनी गई है।"),
    ("A positive income and non-negative remainder are needed for this allocation chart.", "इस चार्ट के लिए कमाई शून्य से ज़्यादा और बाकी रकम शून्य या उससे ज़्यादा होनी चाहिए।"),
    ("Complete the income and monthly cost inputs before asking about cash flow.", "नकदी के बारे में पूछने से पहले कमाई और महीने का खर्च भरें।"),
    ("Complete the required loan inputs before asking about a chart.", "चार्ट के बारे में पूछने से पहले कर्ज़ की ज़रूरी जानकारी भरें।"),
    ("Enter a value before confirming it.", "पक्का करने से पहले नंबर लिखें।"),
    ("No such sentence.", "यह वाक्य नहीं मिला।"),
    ("Only a tenure stated as a whole number of years can be transferred.", "सिर्फ़ पूरे सालों में लिखी अवधि ही आगे ले जाई जा सकती है।"),
    ("Only values confirmed by the farmer can be transferred.", "सिर्फ़ वही नंबर आगे जा सकते हैं जिन्हें आपने पक्का किया है।"),
    ("Overwrite approval must match selected document values.", "बदलने की मंज़ूरी चुने गए दस्तावेज़ के नंबरों से मेल खानी चाहिए।"),
    ("Please enter a message.", "कृपया कुछ लिखें।"),
    ("Provide annual hiring or renting spend before asking about this comparison.", "इस तुलना के बारे में पूछने से पहले किराये का सालाना खर्च बताएँ।"),
    ("The PDF exceeds the 10 MB limit.", "PDF 10 MB से बड़ी है।"),
    ("The PDF file is empty.", "PDF फ़ाइल खाली है।"),
    ("The chart context is not available.", "इस चार्ट की जानकारी अभी उपलब्ध नहीं है।"),
    ("The selected income scenario is not available from the calculation engine.", "चुना गया कमाई का हाल गणित इंजन में उपलब्ध नहीं है।"),
    ("This KuberKet session was not found.", "यह कुबेरकेत सत्र नहीं मिला।"),
    ("This document term is not supported.", "दस्तावेज़ की यह शर्त समर्थित नहीं है।"),
    ("Unsupported buy-versus-hiring point.", "खरीद और किराये के चार्ट का यह हिस्सा समर्थित नहीं है।"),
    ("Unsupported cash-flow chart point.", "नकदी चार्ट का यह हिस्सा समर्थित नहीं है।"),
    ("Unsupported income scenario point.", "कमाई के हाल का यह हिस्सा समर्थित नहीं है।"),
    ("Unsupported repayment chart point.", "भुगतान चार्ट का यह हिस्सा समर्थित नहीं है।"),
    ("Upload a PDF document only.", "सिर्फ़ PDF दस्तावेज़ अपलोड करें।"),
    ("Upload a document before asking for an explanation.", "समझाने के लिए पहले दस्तावेज़ अपलोड करें।"),
    ("Upload a document before reviewing its terms.", "शर्तें देखने के लिए पहले दस्तावेज़ अपलोड करें।"),
    ("Upload a document before transferring values.", "नंबर आगे ले जाने के लिए पहले दस्तावेज़ अपलोड करें।"),
    ("The numbers changed. Wait for the chart to refresh before asking about it.", "नंबर बदल गए हैं। चार्ट का नया हिसाब आने के बाद ही उसके बारे में पूछें।"),
    # Recordings
    ("The WAV recording's audio settings are not supported.", "WAV रिकॉर्डिंग की ऑडियो सेटिंग समर्थित नहीं है।"),
    ("This recording is not in WAV format. Please record again.", "इस रिकॉर्डिंग का फ़ॉर्मैट WAV नहीं है। कृपया फिर से रिकॉर्ड करें।"),
    ("This recording format is not supported. Please record in WAV.", "इस रिकॉर्डिंग का फ़ॉर्मैट समर्थित नहीं है। कृपया WAV में रिकॉर्ड करें।"),
    ("Your words were not clear. Please speak again or type.", "बात साफ़ सुनाई नहीं दी। कृपया फिर बोलें या लिखकर बताइए।"),
    ("The recording is empty. Please speak again.", "रिकॉर्डिंग खाली है। कृपया फिर बोलें।"),
    ("The recording must be at most thirty seconds long.", "रिकॉर्डिंग तीस सेकंड तक की होनी चाहिए।"),
    ("The recording could not be read. Please record again.", "रिकॉर्डिंग पढ़ी नहीं जा सकी। कृपया फिर से रिकॉर्ड करें।"),
    ("The recording is too large. Please keep it under thirty seconds.", "रिकॉर्डिंग बहुत बड़ी है। कृपया तीस सेकंड से छोटी रिकॉर्डिंग करें।"),
    # Documents
    ("More than one value appears; the correct value is unclear.", "एक से ज़्यादा नंबर लिखे हैं; सही नंबर साफ़ नहीं है।"),
    ("The uploaded file is not a valid PDF.", "अपलोड की गई फ़ाइल सही PDF नहीं है।"),
    ("This PDF is encrypted. Upload an unlocked copy.", "यह PDF लॉक है। बिना लॉक वाली प्रति अपलोड करें।"),
    ("This PDF has no pages.", "इस PDF में कोई पन्ना नहीं है।"),
    ("The PDF could not be read. It may be damaged or unsupported.", "PDF पढ़ी नहीं जा सकी। फ़ाइल खराब या असमर्थित हो सकती है।"),
    # Labels on spoken replies
    ("Reply", "जवाब"),
    ("Explanation", "हिसाब की बात"),
    ("Teach-back question", "समझ की जाँच का सवाल"),
    ("Simpler explanation", "आसान मिसाल"),
    ("Chart explanation", "चार्ट की बात"),
    ("Document explanation", "दस्तावेज़ की बात"),
    # Generic HTTP errors from the framework
    ("Not Found", "नहीं मिला"),
    ("Method Not Allowed", "यह तरीका यहाँ नहीं चलता"),
)

_FIELD_NAMES = {
    "asset_price": ("purchase price", "खरीद की कीमत"),
    "down_payment": ("down payment", "शुरुआती भुगतान"),
    "yearly_interest_rate_percent": ("yearly interest rate", "सालाना ब्याज दर"),
    "tenure_years": ("loan duration", "कर्ज़ की अवधि"),
    "yearly_farm_income": ("yearly farm income", "खेती की सालाना कमाई"),
    "monthly_costs": ("household and farm costs", "घर और खेती का खर्च"),
    "monthly_existing_loan_payments": ("other loan payments", "दूसरे कर्ज़ की किस्तें"),
    "yearly_hiring_spend": ("hiring or renting cost", "किराये का खर्च"),
    # Names the finance engine uses in its own messages
    "Asset price": ("Purchase price", "खरीद की कीमत"),
    "Down payment": ("Down payment", "शुरुआती भुगतान"),
    "Income-drop percentage": ("Income-drop percentage", "कमाई में कमी का प्रतिशत"),
    "Loan amount": ("Loan amount", "कर्ज़ की रकम"),
    "Monthly costs": ("Monthly costs", "महीने का खर्च"),
    "Monthly existing loan payments": ("Monthly payments on other loans", "दूसरे कर्ज़ की मासिक किस्तें"),
    "Monthly household and farm costs": ("Monthly household and farm costs", "घर और खेती का मासिक खर्च"),
    "Monthly kist": ("Monthly instalment", "महीने की किस्त"),
    "Savings": ("Savings", "बचत"),
    "Thin-remainder limit": ("Thin-remainder limit", "कम बचत की सीमा"),
    "Yearly farm income": ("Yearly farm income", "खेती की सालाना कमाई"),
    "Yearly hiring or renting spend": ("Yearly hiring or renting spend", "किराये का सालाना खर्च"),
    "Yearly income": ("Yearly income", "सालाना कमाई"),
    "Yearly interest rate": ("Yearly interest rate", "सालाना ब्याज दर"),
}


def _field(name: str, language: str) -> str:
    english, hindi = _FIELD_NAMES.get(name.strip(), (name.strip(), name.strip()))
    return hindi if language == "hi" else english


# Messages with a value inside: (English pattern, Hindi pattern, builder(match, language)).
_TEMPLATES: tuple[tuple[re.Pattern[str], re.Pattern[str], Callable[[re.Match[str], str], str]], ...] = (
    (
        re.compile(r"^Review and approve replacing the existing (?P<x>.+) value\.$"),
        re.compile(r"^पहले से भरी (?P<x>.+) बदलने से पहले उसे देखकर मंज़ूरी दें।$"),
        lambda m, lang: f"पहले से भरी {m['x']} बदलने से पहले उसे देखकर मंज़ूरी दें।" if lang == "hi" else f"Review and approve replacing the existing {m['x']} value.",
    ),
    (
        re.compile(r"^The confirmed (?P<x>.+) is not a usable number\.$"),
        re.compile(r"^पक्की की गई (?P<x>.+) काम का नंबर नहीं है।$"),
        lambda m, lang: f"पक्की की गई {m['x']} काम का नंबर नहीं है।" if lang == "hi" else f"The confirmed {m['x']} is not a usable number.",
    ),
    (
        re.compile(r"^Unsupported financial input: (?P<x>.+)\.$"),
        re.compile(r"^यह जानकारी समर्थित नहीं है: (?P<x>.+)।$"),
        lambda m, lang: f"यह जानकारी समर्थित नहीं है: {m['x']}।" if lang == "hi" else f"Unsupported financial input: {m['x']}.",
    ),
    (
        re.compile(r"^(?P<x>\w+) cannot be transferred directly into My Numbers\.$"),
        re.compile(r"^(?P<x>.+) सीधे मेरे नंबर में नहीं ले जाई जा सकती।$"),
        lambda m, lang: f"{_field(m['x'], lang)} सीधे मेरे नंबर में नहीं ले जाई जा सकती।" if lang == "hi" else f"{_field(m['x'], lang).capitalize()} cannot be moved directly into My numbers.",
    ),
    (
        re.compile(r"^(?P<x>\w+) cannot be confirmed or assumed without a value\.$"),
        re.compile(r"^(?P<x>.+) बिना नंबर के पक्का या अनुमानित नहीं हो सकता।$"),
        lambda m, lang: f"{_field(m['x'], lang)} बिना नंबर के पक्का या अनुमानित नहीं हो सकता।" if lang == "hi" else f"{_field(m['x'], lang).capitalize()} cannot be confirmed or assumed without a value.",
    ),
    (
        re.compile(r"^(?P<x>\w+) has a value and cannot be marked missing\.$"),
        re.compile(r"^(?P<x>.+) में नंबर भरा है, उसे खाली नहीं माना जा सकता।$"),
        lambda m, lang: f"{_field(m['x'], lang)} में नंबर भरा है, उसे खाली नहीं माना जा सकता।" if lang == "hi" else f"{_field(m['x'], lang).capitalize()} has a value and cannot be marked missing.",
    ),
    (
        re.compile(r"^(?P<x>.+) must be a (?:finite )?number\.$"),
        re.compile(r"^(?P<x>.+) एक सही संख्या होनी चाहिए।$"),
        lambda m, lang: f"{_field(m['x'], lang)} एक सही संख्या होनी चाहिए।" if lang == "hi" else f"{_field(m['x'], lang).capitalize()} must be a number.",
    ),
    (
        re.compile(r"^Positive money left at or below (?P<x>[\d.]+)% of income is flagged as thin\.$"),
        re.compile(r"^कमाई के (?P<x>[\d.]+)% या उससे कम बचत को कम बचत माना गया है।$"),
        lambda m, lang: f"कमाई के {m['x']}% या उससे कम बचत को कम बचत माना गया है।" if lang == "hi" else f"Positive money left at or below {m['x']}% of income is flagged as thin.",
    ),
    (
        re.compile(r"^Crop must be one of: (?P<x>.+)\.$"),
        re.compile(r"^फसल इनमें से एक होनी चाहिए: (?P<x>.+)।$"),
        lambda m, lang: f"फसल इनमें से एक होनी चाहिए: धान, गेहूँ, मक्का।" if lang == "hi" else "Crop must be one of: paddy, wheat, maize.",
    ),
)

_EN_TO_HI = {english: hindi for english, hindi in PAIRS}
_HI_TO_EN = {hindi: english for english, hindi in PAIRS}
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def localize(message: str, language: str) -> str:
    """Return the message in ``language`` ("hi" or "en"). Unknown messages come back unchanged."""
    if not isinstance(message, str) or not message:
        return message
    text = message.strip()
    table = _EN_TO_HI if language == "hi" else _HI_TO_EN
    if text in table:
        return table[text]
    for english, hindi, build in _TEMPLATES:
        match = english.match(text) or hindi.match(text)
        if match:
            return build(match, language)
    return message


def is_in_language(message: str, language: str) -> bool:
    """True when the message is written in the script of ``language`` (brand names and numbers aside)."""
    has_hindi = bool(_DEVANAGARI.search(message))
    return has_hindi if language == "hi" else not has_hindi


def localize_result(result: dict | None, language: str) -> dict | None:
    """Copy of an engine result with its assumption lines in the farmer's language."""
    if not result:
        return result
    localized = dict(result)
    if isinstance(localized.get("assumptions"), (list, tuple)):
        localized["assumptions"] = [localize(item, language) for item in localized["assumptions"]]
    return localized
