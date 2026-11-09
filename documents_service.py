"""Local, conservative text extraction for session-scoped financial PDFs."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import re

from pypdf import PdfReader


MAX_DOCUMENT_PAGES = 100
MAX_EXTRACTED_CHARACTERS = 100_000
MAX_PDF_BYTES = 10 * 1024 * 1024


@dataclass(frozen=True)
class ExtractedDocument:
    page_count: int
    text: str
    terms: dict[str, dict[str, object]]


_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "lender_name": (
        re.compile(r"(?:lender|bank|finance company|financial institution)\s*(?:name)?\s*[:\-]\s*([^\n,;]{2,100})", re.I),
    ),
    "tractor_price": (
        re.compile(r"(?:tractor|vehicle|on[\s-]?road)\s+(?:price|cost|value)\s*[:\-]?\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b))?)", re.I),
    ),
    "loan_amount": (
        re.compile(r"(?:loan amount|principal amount|amount financed|sanctioned amount|loan principal)\s*[:\-]?\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b))?)", re.I),
    ),
    "down_payment": (
        re.compile(r"(?:down payment|margin money|initial contribution)\s*[:\-]?\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b))?)", re.I),
    ),
    "interest_rate": (
        re.compile(r"(?:rate of interest|interest rate|annual rate)\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:%|percent|per cent))", re.I),
    ),
    "interest_type": (
        re.compile(r"(?:rate type|interest type)\s*[:\-]\s*(fixed|floating|variable)", re.I),
        re.compile(r"\b(fixed|floating|variable)\s+(?:interest\s+)?rate\b|\b(?:interest\s+)?rate\s+(?:is\s+)?(fixed|floating|variable)\b", re.I),
    ),
    "tenure": (
        re.compile(r"(?:loan tenure|tenure|loan period|repayment period)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(years?|yrs?|months?)", re.I),
    ),
    "installment_amount": (
        re.compile(r"(?:monthly\s+)?(?:EMI|instalment|installment|monthly payment)\s*[:\-]?\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b))?)", re.I),
    ),
    "total_repayment": (
        re.compile(r"(?:total amount payable|total repayment|total amount repayable)\s*[:\-]?\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b))?)", re.I),
    ),
    "repayment_frequency": (
        re.compile(r"(?:repayment frequency|payment frequency|repayment shall be)\s*[:\-]?\s*(monthly|quarterly|half[\s-]?yearly|annually|yearly|weekly)", re.I),
    ),
    "processing_fee": (
        re.compile(r"(?:processing fee|processing charge)\s*[:\-]?\s*(?:₹|INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?\s*%?)", re.I),
    ),
    "other_charges": (
        re.compile(r"(?:other charges|additional charges|documentation fee|insurance premium)\s*[:\-]?\s*([^\n;]{1,140})", re.I),
    ),
    "collateral": (
        re.compile(r"(?:collateral|security offered|security)\s*[:\-]?\s*([^\n;]{1,140})", re.I),
    ),
    "late_payment_charges": (
        re.compile(r"(?:late payment (?:charge|fee|penalty)|penal interest|overdue charge)\s*[:\-]?\s*([^\n;]{1,140})", re.I),
    ),
    "prepayment_conditions": (
        re.compile(r"(?:prepayment|foreclosure|early repayment)\s*(?:charges|conditions|terms)?\s*[:\-]?\s*([^\n;]{1,180})", re.I),
    ),
}

_LABELS = {
    "lender_name": "Lender name",
    "tractor_price": "Tractor price",
    "loan_amount": "Loan amount",
    "down_payment": "Down payment",
    "interest_rate": "Interest rate",
    "interest_type": "Rate type",
    "tenure": "Loan tenure",
    "installment_amount": "Instalment amount",
    "total_repayment": "Total repayment",
    "repayment_frequency": "Repayment frequency",
    "processing_fee": "Processing fee",
    "other_charges": "Other charges",
    "collateral": "Collateral or security",
    "late_payment_charges": "Late-payment charges",
    "prepayment_conditions": "Prepayment or foreclosure terms",
}


def extract_pdf(filename: str, payload: bytes) -> ExtractedDocument:
    """Extract bounded text from a valid, unencrypted PDF without writing it to disk."""
    if not payload:
        raise ValueError("The PDF file is empty.")
    if len(payload) > MAX_PDF_BYTES:
        raise ValueError("The PDF exceeds the 10 MB limit.")
    if not payload.startswith(b"%PDF-"):
        raise ValueError("The uploaded file is not a valid PDF.")

    try:
        reader = PdfReader(BytesIO(payload), strict=False)
        if reader.is_encrypted:
            raise ValueError("This PDF is encrypted. Upload an unlocked copy.")
        page_count = len(reader.pages)
        if page_count == 0:
            raise ValueError("This PDF has no pages.")
        if page_count > MAX_DOCUMENT_PAGES:
            raise ValueError(f"The PDF has more than {MAX_DOCUMENT_PAGES} pages.")
        pages: list[str] = []
        total_characters = 0
        for page in reader.pages:
            page_text = page.extract_text() or ""
            remaining = MAX_EXTRACTED_CHARACTERS - total_characters
            page_text = page_text[:remaining]
            pages.append(page_text)
            total_characters += len(page_text)
            if total_characters >= MAX_EXTRACTED_CHARACTERS:
                break
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("The PDF could not be read. It may be damaged or unsupported.") from exc

    text = "\n".join(page for page in pages if page.strip())
    return ExtractedDocument(
        page_count=page_count,
        text=text,
        terms=extract_terms(pages),
    )


def extract_terms(pages: list[str]) -> dict[str, dict[str, object]]:
    """Extract only unambiguous label/value pairs and retain their page references."""
    terms: dict[str, dict[str, object]] = {}
    for field_id, patterns in _PATTERNS.items():
        hits: list[tuple[str, int, str]] = []
        for page_number, page_text in enumerate(pages, start=1):
            for pattern in patterns:
                for match in pattern.finditer(page_text):
                    raw_value = next(
                        (part for part in match.groups() if part is not None),
                        "",
                    ).strip().rstrip(".,;")
                    if field_id == "interest_type":
                        raw_value = raw_value.casefold()
                    if not raw_value:
                        continue
                    excerpt = page_text[max(0, match.start() - 70): min(len(page_text), match.end() + 100)]
                    hits.append((raw_value, page_number, re.sub(r"\s+", " ", excerpt).strip()))

        unique_values = {value.casefold() for value, _, _ in hits}
        if len(unique_values) == 1:
            value, page_number, excerpt = hits[0]
            terms[field_id] = {
                "field_id": field_id,
                "label": _LABELS[field_id],
                "value": value,
                "status": "found",
                "origin": "document",
                "page": page_number,
                "source": excerpt,
                "issue": None,
            }
        elif len(unique_values) > 1:
            terms[field_id] = {
                "field_id": field_id,
                "label": _LABELS[field_id],
                "value": None,
                "status": "missing",
                "origin": "document",
                "page": None,
                "source": None,
                "issue": "More than one value appears; the correct value is unclear.",
            }
        else:
            terms[field_id] = {
                "field_id": field_id,
                "label": _LABELS[field_id],
                "value": None,
                "status": "missing",
                "origin": "document",
                "page": None,
                "source": None,
                "issue": None,
            }
    return terms


def numeric_value(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\b|thousand|लाख|करोड़|करोड|हज़ार|हजार)?", value, re.IGNORECASE)
    if not match:
        return None
    try:
        number = float(match.group(1).replace(",", ""))
    except ValueError:
        return None
    # "Rs 6 Lakh" on a loan paper means 6,00,000, not 6.
    scale = (match.group(2) or "").casefold()
    if scale.startswith(("lakh", "lac", "लाख")):
        number *= 100_000
    elif scale.startswith(("crore", "cr", "करोड")):
        number *= 10_000_000
    elif scale in ("thousand", "हज़ार", "हजार"):
        number *= 1_000
    return number
