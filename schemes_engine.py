"""Evaluate five farm schemes against one farmer's own numbers.

Every figure comes from finance_engine (the monthly cash flow) and the terms in
schemes_data (each with a source). Nothing here predicts a claim, a yield or a
price, and nothing here recommends a scheme: it reports what each scheme would
change on the numbers the farmer entered.
"""

from __future__ import annotations

from dataclasses import asdict
import math

from finance_engine import (
    CashflowResult,
    FinanceInputError,
    crop_calendar,
    monthly_cashflow,
    monthly_installment,
)
from schemes_data import AS_OF, TERMS, TRACTOR_CAPS_LAKH

SCHEME_IDS = ("kcc", "aif", "smam", "pmfby", "pm_kisan")

ASSUMPTION_CODES = (
    "harvest_months_typical",
    "savings_zero",
    "down_payment_outside",
    "kist_from_month_one",
    "kcc_one_draw",
    "pm_kisan_months",
    "pmfby_premium_month_one",
    "smam_lowers_loan",
)


def _metrics(result: CashflowResult) -> list[dict]:
    return [
        {
            "name": s.name,
            "income_drop_percent": s.income_drop_percent,
            "lowest_balance": s.lowest_balance,
            "lowest_month_index": s.lowest_month_index,
            "negative_month_indexes": list(s.negative_month_indexes),
            "ending_balance": s.ending_balance,
        }
        for s in result.scenarios
    ]


def _risk_change(before: list[dict], after: list[dict]) -> list[dict]:
    return [
        {
            "name": b["name"],
            "lowest_balance_change": a["lowest_balance"] - b["lowest_balance"],
            "negative_months_change": len(a["negative_month_indexes"]) - len(b["negative_month_indexes"]),
            "ending_balance_change": a["ending_balance"] - b["ending_balance"],
        }
        for b, a in zip(before, after)
    ]


def _non_negative(name: str, value: int | float | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise FinanceInputError(f"{name} must be a number that is not negative.")
    return float(value)


def evaluate_schemes(
    *,
    crop: str,
    yearly_income: int | float,
    monthly_costs: int | float,
    monthly_existing_loan_payments: int | float = 0,
    asset_price: int | float = 0,
    down_payment: int | float = 0,
    loan_rate: int | float = 0,
    tenure_years: int = 0,
    alternative_rate: int | float | None = None,
    savings: int | float = 0,
    small_or_marginal: bool = True,
    sc_st_or_women: bool = False,
    buying_machinery: bool = False,
    tractor_class: str | None = None,
    post_harvest_project: bool = False,
    pays_income_tax: bool = False,
    government_employee_or_pensioner: bool = False,
    sum_insured: int | float | None = None,
    crop_loan_amount: int | float | None = None,
) -> dict:
    calendar = crop_calendar(crop)
    start_month = int(calendar["sowing_month"])  # type: ignore[arg-type]
    harvest_months = tuple(calendar["harvest_months"])  # type: ignore[arg-type]
    season = str(calendar["season"])

    price = _non_negative("Asset price", asset_price) or 0.0
    down = _non_negative("Down payment", down_payment) or 0.0
    rate = _non_negative("Loan interest rate", loan_rate) or 0.0
    alt_rate = _non_negative("Alternative interest rate", alternative_rate)
    income = _non_negative("Yearly income", yearly_income) or 0.0
    if price and down >= price:
        raise FinanceInputError("Down payment must be less than the asset price.")
    if tractor_class is not None and tractor_class not in TRACTOR_CAPS_LAKH:
        raise FinanceInputError("Unknown tractor class.")

    principal = price - down if price else 0.0
    kist = monthly_installment(principal, rate, tenure_years) if principal > 0 else 0.0

    def run(kist_value: float = kist, flows: dict[int, float] | None = None) -> CashflowResult:
        return monthly_cashflow(
            yearly_income=income,
            monthly_costs=monthly_costs,
            monthly_existing_loan_payments=monthly_existing_loan_payments,
            monthly_kist=kist_value,
            harvest_months=harvest_months,
            start_month=start_month,
            savings=savings,
            other_flows=flows,
        )

    base = run()
    base_metrics = _metrics(base)
    base_normal = base.scenarios[0]
    first_harvest_index = min((m - start_month) % 12 + 1 for m in harvest_months)

    def package(scheme_id: str, status: str, reason: str, result: CashflowResult | None, figures: dict, money: float | None, one_time: bool = False) -> dict:
        after = _metrics(result) if result is not None else base_metrics
        return {
            "id": scheme_id,
            "status": status,  # may_apply | not_applicable | not_eligible | not_needed
            "reason": reason,
            "figures": figures,
            "money_effect_first_year": money,
            "money_effect_is_one_time": one_time,
            "after": after,
            "risk_change": _risk_change(base_metrics, after),
            "balances_normal": [row.balance for row in (result or base).scenarios[0].rows],
        }

    schemes: list[dict] = []

    # --- KCC: a crop loan that bridges the months before harvest -------------------
    kcc = TERMS["kcc"]
    pre_harvest = [row.balance for row in base_normal.rows if row.index < first_harvest_index]
    shortfall = max(0.0, -min(pre_harvest)) if pre_harvest else 0.0
    requested = _non_negative("Crop loan amount", crop_loan_amount)
    if requested is not None:
        amount = requested
    else:
        amount = math.ceil(shortfall / 1000) * 1000 if shortfall else 0.0
    capped = amount > kcc["limit_rupees"]
    amount = min(amount, float(kcc["limit_rupees"]))
    held = first_harvest_index
    alt = alt_rate if alt_rate is not None else (rate if rate > 0 else None)
    if amount <= 0 or first_harvest_index < 2:
        schemes.append(package("kcc", "not_needed", "no_shortfall", None, {"shortfall": shortfall}, None))
    else:
        on_time = amount * kcc["effective_rate_percent"] / 100 * held / 12
        late = amount * kcc["rate_before_incentive_percent"] / 100 * held / 12
        result = run(flows={1: amount, first_harvest_index: -(amount + on_time)})
        at_alt = None if alt is None else amount * alt / 100 * held / 12
        saving = None if at_alt is None else at_alt - on_time
        schemes.append(
            package(
                "kcc", "may_apply", "ok", result,
                {
                    "amount": amount, "amount_capped_at_limit": capped, "months_held": held,
                    "shortfall_before_harvest": shortfall,
                    "interest_on_time": on_time, "interest_without_incentive": late,
                    "alternative_rate_percent": alt, "interest_at_alternative": at_alt,
                    "saving_vs_alternative": saving,
                    "extra_cost_if_incentive_lost": late - on_time,
                },
                saving,
            )
        )

    # --- AIF: only for post-harvest infrastructure or shared farm assets -----------
    aif = TERMS["aif"]
    if principal <= 0:
        schemes.append(package("aif", "not_applicable", "no_loan", None, {}, None))
    elif not post_harvest_project:
        schemes.append(package("aif", "not_applicable", "project_type", None, {}, None))
    else:
        new_rate = max(0.0, rate - aif["interest_support_percent"])
        new_kist = monthly_installment(principal, new_rate, tenure_years)
        years = min(tenure_years, aif["support_years"])
        monthly_saving = kist - new_kist
        schemes.append(
            package(
                "aif", "may_apply", "ok", run(new_kist),
                {
                    "rate_after_percent": new_rate, "kist_after": new_kist, "kist_before": kist,
                    "monthly_saving": monthly_saving, "support_years_counted": years,
                    "total_saving_over_support_years": monthly_saving * 12 * years,
                    "tenure_longer_than_support": tenure_years > aif["support_years"],
                    "loan_above_limit": principal > aif["loan_limit_rupees"],
                },
                monthly_saving * 12,
            )
        )

    # --- SMAM: a subsidy on machinery; selection is not guaranteed -------------------
    smam = TERMS["smam"]
    if price <= 0:
        schemes.append(package("smam", "not_applicable", "no_loan", None, {}, None))
    elif not buying_machinery:
        schemes.append(package("smam", "not_applicable", "not_machinery", None, {}, None))
    else:
        priority = bool(small_or_marginal or sc_st_or_women)
        percent = smam["priority_percent"] if priority else smam["other_percent"]
        uncapped = price * percent / 100
        cap = None
        cap_derived = False
        if tractor_class:
            caps = TRACTOR_CAPS_LAKH[tractor_class]
            cap = float(caps["priority" if priority else "other"]) * 100_000
            cap_derived = bool(caps.get("other_derived")) and not priority
        subsidy = min(uncapped, cap) if cap is not None else uncapped
        principal_after = max(0.0, price - subsidy - down)
        new_kist = monthly_installment(principal_after, rate, tenure_years) if principal_after > 0 else 0.0
        schemes.append(
            package(
                "smam", "may_apply", "ok", run(new_kist),
                {
                    "percent": percent, "uncapped_subsidy": uncapped, "cap": cap, "cap_derived": cap_derived,
                    "cap_applied": cap is not None and uncapped > cap, "cap_unknown": cap is None,
                    "subsidy": subsidy, "effective_price": price - subsidy,
                    "loan_after": principal_after, "kist_before": kist, "kist_after": new_kist,
                    "monthly_saving": kist - new_kist,
                    "total_saving_over_tenure": (kist - new_kist) * 12 * tenure_years,
                    "individual_ownership_discouraged": bool(tractor_class and ("40_50" in tractor_class or "above50" in tractor_class)),
                },
                subsidy,
                one_time=True,
            )
        )

    # --- PMFBY: a premium now against income at stake -------------------------------
    pmfby = TERMS["pmfby"]
    premium_percent = pmfby["kharif_premium_percent"] if season == "kharif" else pmfby["rabi_premium_percent"]
    insured = _non_negative("Sum insured", sum_insured)
    insured_assumed = insured is None
    insured = income if insured is None else insured
    premium = insured * premium_percent / 100
    schemes.append(
        package(
            "pmfby", "may_apply", "ok", run(flows={1: -premium}),
            {
                "season": season, "premium_percent": premium_percent, "sum_insured": insured,
                "sum_insured_assumed": insured_assumed, "premium": premium,
                "income_at_stake_25": income * 0.25, "income_at_stake_40": income * 0.40,
            },
            -premium,
        )
    )

    # --- PM-KISAN: ₹2,000 three times a year ----------------------------------------
    pmk = TERMS["pm_kisan"]
    if pays_income_tax or government_employee_or_pensioner:
        schemes.append(package("pm_kisan", "not_eligible", "exclusion", None, {}, None))
    else:
        flows = {1: float(pmk["instalment_rupees"]), 5: float(pmk["instalment_rupees"]), 9: float(pmk["instalment_rupees"])}
        schemes.append(
            package("pm_kisan", "may_apply", "ok", run(flows=flows), {"per_year": float(pmk["per_year_rupees"])}, float(pmk["per_year_rupees"]))
        )

    counted = [s for s in schemes if s["status"] == "may_apply" and s["money_effect_first_year"] is not None]
    by_money = sorted((s for s in counted if s["money_effect_first_year"] > 0), key=lambda s: s["money_effect_first_year"], reverse=True)
    by_risk = sorted(
        (s for s in schemes if s["status"] == "may_apply" and s["risk_change"][1]["lowest_balance_change"] > 0),
        key=lambda s: s["risk_change"][1]["lowest_balance_change"],
        reverse=True,
    )

    return {
        "as_of": AS_OF,
        "crop": crop,
        "season": season,
        "start_month": start_month,
        "harvest_months": list(harvest_months),
        "baseline": {
            "loan_amount": principal,
            "monthly_kist": kist,
            "cashflow": asdict(base),
            "metrics": base_metrics,
        },
        "schemes": schemes,
        "ranking_by_money": [s["id"] for s in by_money],
        "ranking_by_risk": [s["id"] for s in by_risk],
        "assumptions": list(ASSUMPTION_CODES),
    }
