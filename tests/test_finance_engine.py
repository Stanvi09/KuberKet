import pytest

from finance_engine import FinanceInputError, calculate_farm_loan


def make_result(**overrides):
    inputs = {
        "asset_price": 500_000,
        "down_payment": 0,
        "yearly_interest_rate_percent": 10,
        "tenure_years": 5,
        "yearly_farm_income": 600_000,
        "monthly_costs": 20_000,
        "monthly_existing_loan_payments": 2_000,
    }
    inputs.update(overrides)
    return calculate_farm_loan(**inputs)


def test_hand_checked_kist_for_five_lakh_loan():
    result = make_result()

    assert result.loan_amount == 500_000
    assert result.monthly_kist == pytest.approx(10_624, abs=1)
    assert result.total_repayment == pytest.approx(result.monthly_kist * 60)
    assert result.total_interest == pytest.approx(result.total_repayment - 500_000)


def test_down_payment_reduces_loan_and_interest():
    result = make_result(down_payment=100_000)

    assert result.loan_amount == 400_000
    assert result.monthly_kist < make_result().monthly_kist
    assert result.interest_saved_by_down_payment > 0


def test_zero_interest_uses_principal_divided_by_months():
    result = make_result(yearly_interest_rate_percent=0)

    assert result.monthly_kist == pytest.approx(500_000 / 60)
    assert result.total_interest == pytest.approx(0)


def test_income_drop_scenarios_apply_to_monthly_and_yearly_views():
    result = make_result()
    normal, down_25, down_40 = result.scenarios

    assert [scenario.income_drop_percent for scenario in result.scenarios] == [0, 25, 40]
    assert down_25.affordability.monthly_income == pytest.approx(37_500)
    assert down_25.affordability.yearly_income == pytest.approx(450_000)
    assert down_25.affordability.monthly_costs == normal.affordability.monthly_costs
    assert (
        down_25.affordability.monthly_existing_loan_payments
        == normal.affordability.monthly_existing_loan_payments
    )
    assert down_25.affordability.yearly_money_left == pytest.approx(
        450_000
        - 20_000 * 12
        - 2_000 * 12
        - result.monthly_kist * 12
    )
    assert down_40.affordability.yearly_income == pytest.approx(360_000)


def test_thin_remainder_uses_ten_percent_of_income():
    result = make_result(
        yearly_farm_income=12_000 * 12,
        monthly_costs=3_000,
        monthly_existing_loan_payments=0,
        yearly_interest_rate_percent=0,
    )

    assert result.scenarios[0].affordability.monthly_money_left == pytest.approx(
        12_000 - 3_000 - 500_000 / 60
    )
    assert result.scenarios[0].affordability.monthly_status == "thin"


def test_negative_remainder_is_flagged_separately():
    result = make_result(yearly_farm_income=120_000, monthly_costs=20_000)

    assert result.scenarios[0].affordability.monthly_status == "negative"
    assert result.scenarios[0].affordability.yearly_status == "negative"


def test_seasonal_income_caveat_is_returned():
    result = make_result()

    assert any("when the crop is sold" in item for item in result.assumptions)
    assert any("spread evenly over 12 months" in item for item in result.assumptions)


def test_hiring_comparison_is_omitted_when_spend_is_missing():
    assert make_result().buy_rent_comparison is None


def test_hiring_comparison_spreads_down_payment_over_tenure():
    result = make_result(down_payment=100_000, yearly_hiring_spend=180_000)
    comparison = result.buy_rent_comparison

    assert comparison is not None
    assert comparison.yearly_buying_cash_outlay == pytest.approx(
        result.monthly_kist * 12 + 100_000 / 5
    )
    assert comparison.total_hiring_spend == 900_000
    assert comparison.total_buying_cash_outlay == pytest.approx(
        result.total_repayment + 100_000
    )
    assert comparison.exclusions == (
        "running costs such as fuel, repairs or feed",
        "fees",
        "the resale value of what is bought",
    )


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("asset_price", 0, "greater than zero"),
        ("asset_price", -1, "greater than zero"),
        ("down_payment", -1, "cannot be negative"),
        ("yearly_interest_rate_percent", -1, "cannot be negative"),
        ("tenure_years", 0, "at least one year"),
        ("yearly_farm_income", -1, "cannot be negative"),
        ("monthly_costs", -1, "cannot be negative"),
        ("monthly_existing_loan_payments", -1, "cannot be negative"),
        ("yearly_hiring_spend", -1, "cannot be negative"),
    ],
)
def test_invalid_values_raise_friendly_input_errors(field, value, message):
    with pytest.raises(FinanceInputError, match=message):
        make_result(**{field: value})


def test_down_payment_equal_to_or_above_price_is_rejected():
    for down_payment in (500_000, 500_001):
        with pytest.raises(FinanceInputError, match="less than the asset price"):
            make_result(down_payment=down_payment)


def test_tractor_loan_alias_matches_farm_loan():
    from finance_engine import calculate_tractor_loan

    rest = {
        "down_payment": 0,
        "yearly_interest_rate_percent": 10,
        "tenure_years": 5,
        "yearly_farm_income": 600_000,
        "monthly_costs": 20_000,
        "monthly_existing_loan_payments": 2_000,
    }
    assert calculate_tractor_loan(tractor_price=500_000, **rest) == calculate_farm_loan(
        asset_price=500_000, **rest
    )


def test_monthly_story_matches_scenario_and_keeps_a_running_balance():
    from finance_engine import monthly_story

    result = make_result()
    affordability = result.scenarios[0].affordability
    story = monthly_story(affordability)

    assert [item["month"] for item in story] == list(range(1, 13))
    assert story[0]["left"] == affordability.monthly_money_left
    assert story[-1]["cumulative"] == pytest.approx(affordability.yearly_money_left)
    assert story[5]["cumulative"] == pytest.approx(affordability.monthly_money_left * 6)


def test_monthly_story_rejects_bad_month_counts():
    from finance_engine import monthly_story

    affordability = make_result().scenarios[0].affordability
    for months in (0, -1, True):
        with pytest.raises(FinanceInputError):
            monthly_story(affordability, months)


# --- harvest-calendar cash flow -------------------------------------------------
# Hand-checked case: income 1,20,000 lands in Oct and Nov (60,000 each), the window
# starts in June, costs 8,000 + kist 5,000 = 13,000 fall due every month.
#   Jun..Sep balances: -13,000 -26,000 -39,000 -52,000
#   Oct: -52,000 - 13,000 + 60,000 = -5,000     Nov: -5,000 - 13,000 + 60,000 = 42,000
#   Dec..May: 42,000 - 13,000 per month -> 29,000 16,000 3,000 -10,000 -23,000 -36,000


def make_cashflow(**overrides):
    from finance_engine import monthly_cashflow

    inputs = {
        "yearly_income": 120_000,
        "monthly_costs": 8_000,
        "monthly_existing_loan_payments": 0,
        "monthly_kist": 5_000,
        "harvest_months": (10, 11),
        "start_month": 6,
    }
    inputs.update(overrides)
    return monthly_cashflow(**inputs)


def test_cashflow_normal_year_matches_hand_checked_balances():
    normal = make_cashflow().scenarios[0]

    assert [round(row.balance) for row in normal.rows] == [
        -13_000, -26_000, -39_000, -52_000, -5_000, 42_000,
        29_000, 16_000, 3_000, -10_000, -23_000, -36_000,
    ]
    assert normal.lowest_balance == -52_000
    assert normal.lowest_month_index == 4
    assert normal.negative_month_indexes == (1, 2, 3, 4, 5, 10, 11, 12)
    assert normal.ending_balance == -36_000
    assert [row.calendar_month for row in normal.rows][:3] == [6, 7, 8]
    assert [row.income for row in normal.rows if row.income] == [60_000, 60_000]


def test_cashflow_income_drop_scenarios_are_hand_checked():
    result = make_cashflow()
    assert [s.name for s in result.scenarios] == ["normal", "income_down_25_percent", "income_down_40_percent"]

    down25 = result.scenarios[1]  # income 90,000 -> 45,000 in Oct and Nov
    assert [round(row.balance) for row in down25.rows][4:7] == [-20_000, 12_000, -1_000]
    assert down25.ending_balance == -66_000
    assert down25.lowest_balance == -66_000 and down25.lowest_month_index == 12
    assert down25.negative_month_indexes == (1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12)

    down40 = result.scenarios[2]  # income 72,000 -> 36,000 each
    # month 5: -52,000 - 13,000 + 36,000 = -29,000; month 6: -29,000 - 13,000 + 36,000 = -6,000
    assert [round(row.balance) for row in down40.rows][4:6] == [-29_000, -6_000]
    assert down40.ending_balance == 72_000 - 13_000 * 12


def test_cashflow_starts_from_savings_and_reports_no_negative_months_when_covered():
    result = make_cashflow(savings=60_000)
    normal = result.scenarios[0]

    assert normal.rows[0].balance == 47_000
    assert normal.lowest_balance == pytest.approx(8_000)  # -52,000 + 60,000 at month 4
    assert normal.negative_month_indexes == ()
    assert normal.ending_balance == 24_000  # 60,000 + 120,000 - 13,000 * 12
    assert result.savings == 60_000


def test_cashflow_extra_flows_and_existing_payments_are_counted():
    result = make_cashflow(
        monthly_existing_loan_payments=1_000, other_flows={1: 10_000, 5: -2_000}
    )
    row1, row5 = result.scenarios[0].rows[0], result.scenarios[0].rows[4]

    assert row1.net == -14_000 + 10_000
    assert row1.existing_loan_payments == 1_000
    assert row5.other_flows == -2_000
    assert row5.net == 60_000 - 14_000 - 2_000


def test_cashflow_wraps_across_the_new_year_for_wheat():
    from finance_engine import crop_calendar

    calendar = crop_calendar("wheat")
    result = make_cashflow(
        harvest_months=calendar["harvest_months"], start_month=calendar["sowing_month"]
    )
    income_months = [row.calendar_month for row in result.scenarios[0].rows if row.income]
    # Sown in November, harvested in March and April: months 5 and 6 of the window.
    assert income_months == [3, 4]
    assert [row.index for row in result.scenarios[0].rows if row.income] == [5, 6]


@pytest.mark.parametrize(
    "overrides",
    [
        {"harvest_months": ()},
        {"harvest_months": (10, 10)},
        {"harvest_months": (13,)},
        {"start_month": 0},
        {"yearly_income": -1},
        {"monthly_costs": -1},
        {"income_drop_percentages": (25, 25)},
        {"income_drop_percentages": (120,)},
        {"other_flows": {13: 5}},
    ],
)
def test_cashflow_rejects_bad_inputs(overrides):
    with pytest.raises(FinanceInputError):
        make_cashflow(**overrides)


def test_crop_calendar_knows_paddy_wheat_maize_only():
    from finance_engine import crop_calendar

    assert crop_calendar("paddy")["season"] == "kharif"
    assert crop_calendar("wheat")["season"] == "rabi"
    assert crop_calendar("maize")["harvest_months"] == (9, 10)
    with pytest.raises(FinanceInputError):
        crop_calendar("cotton")


def test_monthly_installment_matches_hand_checked_values():
    from finance_engine import monthly_installment

    assert monthly_installment(500_000, 10, 5) == pytest.approx(10_623.52, abs=0.01)
    assert monthly_installment(500_000, 7, 5) == pytest.approx(9_900.60, abs=0.01)
    assert monthly_installment(0, 10, 5) == 0
    assert monthly_installment(120_000, 0, 5) == pytest.approx(2_000)
