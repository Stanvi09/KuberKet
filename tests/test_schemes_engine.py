"""Hand-checked scheme numbers.

Farmer: paddy (sown June, harvest Oct-Nov), income 3,00,000, costs 10,000 a month,
tractor 6,00,000 with 1,00,000 down, 10% for 5 years -> kist 10,623.52.
Monthly outflow 20,623.52. Before harvest the balance falls to -82,494.08 in month 4.
"""

import pytest

from finance_engine import FinanceInputError
from schemes_data import SCHEMES, TRACTOR_CAPS_LAKH
from schemes_engine import evaluate_schemes

BASE = dict(
    crop="paddy", yearly_income=300_000, monthly_costs=10_000,
    asset_price=600_000, down_payment=100_000, loan_rate=10, tenure_years=5,
)


def scheme(result, scheme_id):
    return next(item for item in result["schemes"] if item["id"] == scheme_id)


def test_baseline_matches_hand_checked_cashflow():
    result = evaluate_schemes(**BASE)
    baseline = result["baseline"]

    assert baseline["monthly_kist"] == pytest.approx(10_623.52, abs=0.01)
    assert baseline["loan_amount"] == 500_000
    normal = baseline["metrics"][0]
    assert normal["lowest_balance"] == pytest.approx(-82_494.08, abs=0.02)
    assert normal["lowest_month_index"] == 4
    assert result["start_month"] == 6 and result["harvest_months"] == [10, 11]


def test_kcc_saving_is_hand_checked():
    # Shortfall 82,494.08 rounds up to 83,000. Held 5 months (June to the October harvest).
    # On time: 83,000 x 4% x 5/12 = 1,383.33. Alternative 10%: 83,000 x 10% x 5/12 = 3,458.33.
    kcc = scheme(evaluate_schemes(**BASE), "kcc")

    assert kcc["status"] == "may_apply"
    assert kcc["figures"]["amount"] == 83_000
    assert kcc["figures"]["months_held"] == 5
    assert kcc["figures"]["interest_on_time"] == pytest.approx(1_383.33, abs=0.01)
    assert kcc["figures"]["interest_without_incentive"] == pytest.approx(2_420.83, abs=0.01)
    assert kcc["figures"]["interest_at_alternative"] == pytest.approx(3_458.33, abs=0.01)
    assert kcc["money_effect_first_year"] == pytest.approx(2_075.00, abs=0.01)
    assert kcc["figures"]["extra_cost_if_incentive_lost"] == pytest.approx(1_037.50, abs=0.01)
    # The loan lifts the pre-harvest low point (month 4) by the amount borrowed.
    assert kcc["risk_change"][0]["lowest_balance_change"] > 0


def test_kcc_respects_the_three_lakh_limit_and_a_chosen_amount():
    kcc = scheme(evaluate_schemes(**BASE, crop_loan_amount=500_000), "kcc")
    assert kcc["figures"]["amount"] == 300_000
    assert kcc["figures"]["amount_capped_at_limit"] is True

    own = scheme(evaluate_schemes(**BASE, crop_loan_amount=100_000, alternative_rate=12), "kcc")
    # 100,000 x (12% - 4%) x 5/12 = 3,333.33
    assert own["money_effect_first_year"] == pytest.approx(3_333.33, abs=0.01)


def test_kcc_not_needed_when_no_shortfall_before_harvest():
    result = evaluate_schemes(**{**BASE, "savings": 1_000_000})
    assert scheme(result, "kcc")["status"] == "not_needed"
    assert scheme(result, "kcc")["money_effect_first_year"] is None


def test_aif_only_applies_to_post_harvest_projects():
    plain = scheme(evaluate_schemes(**BASE), "aif")
    assert plain["status"] == "not_applicable" and plain["reason"] == "project_type"

    aif = scheme(evaluate_schemes(**BASE, post_harvest_project=True), "aif")
    assert aif["status"] == "may_apply"
    assert aif["figures"]["kist_after"] == pytest.approx(9_900.60, abs=0.01)  # 5,00,000 at 7% for 5 years
    assert aif["figures"]["monthly_saving"] == pytest.approx(722.92, abs=0.02)
    assert aif["money_effect_first_year"] == pytest.approx(8_675.04, abs=0.3)
    assert aif["figures"]["total_saving_over_support_years"] == pytest.approx(722.92 * 60, abs=1)


def test_aif_support_is_counted_for_seven_years_at_most():
    aif = scheme(evaluate_schemes(**{**BASE, "tenure_years": 10}, post_harvest_project=True), "aif")
    assert aif["figures"]["support_years_counted"] == 7
    assert aif["figures"]["tenure_longer_than_support"] is True


def test_smam_percentages_and_caps_are_hand_checked():
    small = scheme(evaluate_schemes(**BASE, buying_machinery=True, tractor_class="2wd_40_50"), "smam")
    assert small["figures"]["percent"] == 50
    assert small["figures"]["subsidy"] == 300_000  # 50% of 6,00,000; cap 4,50,000 does not bind
    assert small["figures"]["loan_after"] == 200_000  # 6,00,000 - 3,00,000 - 1,00,000
    assert small["money_effect_first_year"] == 300_000 and small["money_effect_is_one_time"] is True

    other = scheme(
        evaluate_schemes(**BASE, small_or_marginal=False, buying_machinery=True, tractor_class="2wd_40_50"), "smam"
    )
    assert other["figures"]["percent"] == 40
    assert other["figures"]["subsidy"] == 240_000  # 40%; cap 3,60,000 does not bind

    capped = scheme(evaluate_schemes(**BASE, buying_machinery=True, tractor_class="2wd_upto20"), "smam")
    assert capped["figures"]["subsidy"] == 200_000  # cap 2,00,000 binds below 50%
    assert capped["figures"]["cap_applied"] is True


def test_smam_without_a_tractor_class_shows_an_upper_figure_and_says_the_cap_is_unknown():
    smam = scheme(evaluate_schemes(**BASE, buying_machinery=True), "smam")
    assert smam["figures"]["cap_unknown"] is True
    assert smam["figures"]["subsidy"] == 300_000


def test_smam_flags_the_derived_cap_and_discouraged_large_tractors():
    derived = scheme(
        evaluate_schemes(**BASE, small_or_marginal=False, buying_machinery=True, tractor_class="2wd_20_40"), "smam"
    )
    assert derived["figures"]["cap_derived"] is True
    big = scheme(evaluate_schemes(**BASE, buying_machinery=True, tractor_class="4wd_above50"), "smam")
    assert big["figures"]["individual_ownership_discouraged"] is True


def test_smam_not_applicable_without_machinery():
    assert scheme(evaluate_schemes(**BASE), "smam")["reason"] == "not_machinery"


def test_pmfby_premium_uses_the_crop_season_rate():
    paddy = scheme(evaluate_schemes(**BASE), "pmfby")
    assert paddy["figures"]["season"] == "kharif"
    assert paddy["figures"]["sum_insured_assumed"] is True
    assert paddy["figures"]["premium"] == pytest.approx(6_000)  # 2% of 3,00,000
    assert paddy["money_effect_first_year"] == -6_000
    assert paddy["figures"]["income_at_stake_25"] == 75_000
    assert paddy["figures"]["income_at_stake_40"] == 120_000

    wheat = scheme(evaluate_schemes(**{**BASE, "crop": "wheat"}, sum_insured=200_000), "pmfby")
    assert wheat["figures"]["season"] == "rabi"
    assert wheat["figures"]["premium"] == pytest.approx(3_000)  # 1.5% of 2,00,000
    assert wheat["figures"]["sum_insured_assumed"] is False


def test_pm_kisan_adds_six_thousand_and_respects_exclusions():
    result = evaluate_schemes(**BASE)
    kisan = scheme(result, "pm_kisan")
    assert kisan["money_effect_first_year"] == 6_000
    base_low = result["baseline"]["metrics"][0]["lowest_balance"]
    # Only the month-1 instalment has arrived by the low point in month 4.
    assert kisan["after"][0]["lowest_balance"] == pytest.approx(base_low + 2_000, abs=0.02)

    assert scheme(evaluate_schemes(**BASE, pays_income_tax=True), "pm_kisan")["status"] == "not_eligible"
    assert scheme(evaluate_schemes(**BASE, government_employee_or_pensioner=True), "pm_kisan")["status"] == "not_eligible"


def test_ranking_orders_by_money_and_names_the_best_for_risk():
    result = evaluate_schemes(**BASE, buying_machinery=True, tractor_class="2wd_40_50", post_harvest_project=True)

    assert result["ranking_by_money"][0] == "smam"  # 3,00,000 one-time
    assert "pmfby" not in result["ranking_by_money"]  # a premium is a cost
    assert result["ranking_by_risk"][0] == "kcc"  # largest rise in the lowest balance (83,000 drawn)


def test_every_scheme_reports_all_three_income_scenarios_and_twelve_balances():
    result = evaluate_schemes(**BASE)
    assert [s["id"] for s in result["schemes"]] == ["kcc", "aif", "smam", "pmfby", "pm_kisan"]
    for item in result["schemes"]:
        assert [m["name"] for m in item["after"]] == ["normal", "income_down_25_percent", "income_down_40_percent"]
        assert len(item["balances_normal"]) == 12


def test_no_loan_farmer_still_gets_a_crop_based_evaluation():
    result = evaluate_schemes(crop="maize", yearly_income=240_000, monthly_costs=12_000)
    assert result["baseline"]["monthly_kist"] == 0
    assert scheme(result, "aif")["reason"] == "no_loan"
    assert scheme(result, "smam")["reason"] == "no_loan"
    assert result["harvest_months"] == [9, 10]


@pytest.mark.parametrize(
    "overrides",
    [
        {"crop": "cotton"},
        {"down_payment": 600_000},
        {"tractor_class": "9wd"},
        {"yearly_income": -1},
        {"alternative_rate": -2},
        {"sum_insured": -5},
    ],
)
def test_bad_inputs_are_rejected(overrides):
    with pytest.raises(FinanceInputError):
        evaluate_schemes(**{**BASE, **overrides})


def test_scheme_facts_all_carry_a_source_and_both_languages():
    assert [s["id"] for s in SCHEMES] == ["kcc", "aif", "smam", "pmfby", "pm_kisan"]
    for item in SCHEMES:
        assert item["sources"] and all(src["url"].startswith("https://") for src in item["sources"])
        for key in ("name", "what", "terms", "watch_out", "ask_bank"):
            assert item[key]["en"] and item[key]["hi"], (item["id"], key)
    assert TRACTOR_CAPS_LAKH["2wd_40_50"] == {
        "label_en": "2WD tractor, 40 to 50 HP", "label_hi": "2WD ट्रैक्टर, 40 से 50 HP", "priority": 4.50, "other": 3.60,
    }
