"""Deterministic calculations for farm term loans (equipment, irrigation, livestock, other)."""

from dataclasses import dataclass
import math


class FinanceInputError(ValueError):
    """Raised when a farmer-provided finance value cannot be used safely."""


@dataclass(frozen=True)
class Affordability:
    monthly_income: float
    monthly_costs: float
    monthly_existing_loan_payments: float
    monthly_kist: float
    monthly_money_left: float
    monthly_status: str
    yearly_income: float
    yearly_costs: float
    yearly_existing_loan_payments: float
    yearly_kist: float
    yearly_money_left: float
    yearly_status: str


@dataclass(frozen=True)
class IncomeScenario:
    name: str
    income_drop_percent: float
    yearly_farm_income: float
    affordability: Affordability


@dataclass(frozen=True)
class BuyRentComparison:
    yearly_hiring_spend: float
    yearly_buying_cash_outlay: float
    yearly_difference_buying_minus_hiring: float
    total_hiring_spend: float
    total_buying_cash_outlay: float
    lower_cash_outlay: str
    exclusions: tuple[str, ...]


@dataclass(frozen=True)
class FinanceResult:
    asset_price: float
    down_payment: float
    loan_amount: float
    yearly_interest_rate_percent: float
    tenure_years: int
    monthly_kist: float
    total_repayment: float
    total_interest: float
    interest_saved_by_down_payment: float
    scenarios: tuple[IncomeScenario, ...]
    buy_rent_comparison: BuyRentComparison | None
    assumptions: tuple[str, ...]


def _number(name: str, value: int | float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FinanceInputError(f"{name} must be a number.")
    number = float(value)
    if not math.isfinite(number):
        raise FinanceInputError(f"{name} must be a finite number.")
    return number


def _monthly_kist(principal: float, annual_rate_percent: float, years: int) -> float:
    payment_count = years * 12
    monthly_rate = annual_rate_percent / 100 / 12
    if monthly_rate == 0:
        return principal / payment_count
    return principal * monthly_rate / (1 - (1 + monthly_rate) ** -payment_count)


def _status(money_left: float, income: float, thin_limit_percent: float) -> str:
    if money_left < 0:
        return "negative"
    if money_left > 0 and money_left <= income * thin_limit_percent / 100:
        return "thin"
    return "positive"


def calculate_farm_loan(
    *,
    asset_price: int | float,
    down_payment: int | float,
    yearly_interest_rate_percent: int | float,
    tenure_years: int,
    yearly_farm_income: int | float,
    monthly_costs: int | float,
    monthly_existing_loan_payments: int | float,
    yearly_hiring_spend: int | float | None = None,
    income_drop_percentages: tuple[int | float, ...] = (25, 40),
    thin_limit_percent: int | float = 10,
) -> FinanceResult:
    """Calculate a farm term loan and income-drop affordability scenarios.

    ``asset_price`` is the full price of whatever the loan buys: a tractor or
    other equipment, an irrigation setup, livestock, or any other farm purchase.

    Monthly income is an even-spread average of yearly farm income. Costs and
    existing loan payments are held constant in every income-drop scenario.
    """
    price = _number("Asset price", asset_price)
    down = _number("Down payment", down_payment)
    rate = _number("Yearly interest rate", yearly_interest_rate_percent)
    income = _number("Yearly farm income", yearly_farm_income)
    costs = _number("Monthly household and farm costs", monthly_costs)
    existing = _number("Monthly existing loan payments", monthly_existing_loan_payments)
    thin_limit = _number("Thin-remainder limit", thin_limit_percent)

    if price <= 0:
        raise FinanceInputError("Asset price must be greater than zero.")
    if down < 0:
        raise FinanceInputError("Down payment cannot be negative.")
    if down >= price:
        raise FinanceInputError("Down payment must be less than the asset price.")
    if rate < 0:
        raise FinanceInputError("Yearly interest rate cannot be negative.")
    if isinstance(tenure_years, bool) or not isinstance(tenure_years, int):
        raise FinanceInputError("Loan tenure must be a whole number of years.")
    if tenure_years <= 0:
        raise FinanceInputError("Loan tenure must be at least one year.")
    if income < 0:
        raise FinanceInputError("Yearly farm income cannot be negative.")
    if costs < 0:
        raise FinanceInputError("Monthly household and farm costs cannot be negative.")
    if existing < 0:
        raise FinanceInputError("Monthly existing loan payments cannot be negative.")
    if not 0 <= thin_limit <= 100:
        raise FinanceInputError("Thin-remainder limit must be from 0 to 100 percent.")

    loan_amount = price - down
    monthly_payment = _monthly_kist(loan_amount, rate, tenure_years)
    total_repayment = (
        loan_amount
        if rate == 0
        else monthly_payment * tenure_years * 12
    )
    total_interest = 0.0 if rate == 0 else total_repayment - loan_amount
    full_price_repayment = (
        price
        if rate == 0
        else _monthly_kist(price, rate, tenure_years) * tenure_years * 12
    )
    full_price_interest = full_price_repayment - price

    drops = tuple(_number("Income-drop percentage", item) for item in income_drop_percentages)
    if any(not 0 <= drop <= 100 for drop in drops):
        raise FinanceInputError("Income-drop percentages must be from 0 to 100.")
    if len(set(drops)) != len(drops):
        raise FinanceInputError("Income-drop percentages must not be repeated.")

    scenarios: list[IncomeScenario] = []
    for drop in (0.0, *drops):
        scenario_yearly_income = income * (1 - drop / 100)
        scenario_monthly_income = scenario_yearly_income / 12
        monthly_left = (
            scenario_monthly_income - costs - existing - monthly_payment
        )
        yearly_costs = costs * 12
        yearly_existing = existing * 12
        yearly_kist = monthly_payment * 12
        yearly_left = (
            scenario_yearly_income - yearly_costs - yearly_existing - yearly_kist
        )
        scenarios.append(
            IncomeScenario(
                name="normal" if drop == 0 else f"income_down_{drop:g}_percent",
                income_drop_percent=drop,
                yearly_farm_income=scenario_yearly_income,
                affordability=Affordability(
                    monthly_income=scenario_monthly_income,
                    monthly_costs=costs,
                    monthly_existing_loan_payments=existing,
                    monthly_kist=monthly_payment,
                    monthly_money_left=monthly_left,
                    monthly_status=_status(
                        monthly_left, scenario_monthly_income, thin_limit
                    ),
                    yearly_income=scenario_yearly_income,
                    yearly_costs=yearly_costs,
                    yearly_existing_loan_payments=yearly_existing,
                    yearly_kist=yearly_kist,
                    yearly_money_left=yearly_left,
                    yearly_status=_status(
                        yearly_left, scenario_yearly_income, thin_limit
                    ),
                ),
            )
        )

    comparison = None
    if yearly_hiring_spend is not None:
        hiring_spend = _number("Yearly hiring or renting spend", yearly_hiring_spend)
        if hiring_spend < 0:
            raise FinanceInputError("Yearly hiring or renting spend cannot be negative.")
        yearly_buying = monthly_payment * 12 + down / tenure_years
        yearly_difference = yearly_buying - hiring_spend
        comparison = BuyRentComparison(
            yearly_hiring_spend=hiring_spend,
            yearly_buying_cash_outlay=yearly_buying,
            yearly_difference_buying_minus_hiring=yearly_difference,
            total_hiring_spend=hiring_spend * tenure_years,
            total_buying_cash_outlay=total_repayment + down,
            lower_cash_outlay=(
                "buying"
                if yearly_difference < 0
                else "hiring"
                if yearly_difference > 0
                else "about_equal"
            ),
            exclusions=(
                "running costs such as fuel, repairs or feed",
                "fees",
                "the resale value of what is bought",
            ),
        )

    return FinanceResult(
        asset_price=price,
        down_payment=down,
        loan_amount=loan_amount,
        yearly_interest_rate_percent=rate,
        tenure_years=tenure_years,
        monthly_kist=monthly_payment,
        total_repayment=total_repayment,
        total_interest=total_interest,
        interest_saved_by_down_payment=full_price_interest - total_interest,
        scenarios=tuple(scenarios),
        buy_rent_comparison=comparison,
        assumptions=(
            "The yearly interest rate is fixed and divided into monthly periods.",
            "The instalment is a fixed monthly payment on a reducing loan balance.",
            "Monthly income is yearly farm income spread evenly over 12 months.",
            "Actual cash flow depends on when the crop is sold.",
            "Income-drop scenarios change farm income only; costs and existing loan payments stay unchanged.",
            "No lender fees, insurance, or taxes are included in the loan calculation.",
            f"Positive money left at or below {thin_limit:g}% of income is flagged as thin.",
            "The buy-versus-hiring comparison is omitted unless yearly hiring or renting spend is provided.",
            "The buy-versus-hiring comparison excludes running costs such as fuel, repairs or feed, fees, and the resale value of what is bought.",
        ),
    )


def monthly_story(affordability: Affordability, months: int = 12) -> list[dict[str, float | int]]:
    """Spread one scenario over a year, month by month, with a running balance.

    The engine assumes income is spread evenly, so every month is identical;
    only the running balance changes. Nothing here is a forecast.
    """
    if isinstance(months, bool) or not isinstance(months, int) or months <= 0:
        raise FinanceInputError("Months must be a positive whole number.")
    running = 0.0
    story: list[dict[str, float | int]] = []
    for month in range(1, months + 1):
        running += affordability.monthly_money_left
        story.append(
            {
                "month": month,
                "income": affordability.monthly_income,
                "costs": affordability.monthly_costs,
                "existing_loan_payments": affordability.monthly_existing_loan_payments,
                "kist": affordability.monthly_kist,
                "left": affordability.monthly_money_left,
                "cumulative": running,
            }
        )
    return story


# ---------------------------------------------------------------------------
# Harvest-calendar cash flow
# ---------------------------------------------------------------------------

# Typical months only. Sowing and harvest dates differ by state, variety and
# year, so the farmer should confirm or edit them. These are not an official
# calendar. Month numbers: January = 1.
CROP_CALENDARS: dict[str, dict[str, object]] = {
    "paddy": {"season": "kharif", "sowing_month": 6, "harvest_months": (10, 11)},
    "wheat": {"season": "rabi", "sowing_month": 11, "harvest_months": (3, 4)},
    "maize": {"season": "kharif", "sowing_month": 6, "harvest_months": (9, 10)},
}

CASHFLOW_ASSUMPTIONS = (
    "Yearly income arrives only in the harvest months, split equally between them.",
    "Household and farm costs, other loan payments and the instalment fall due every month, starting in the first month.",
    "Savings at the start of the year are assumed to be zero unless you enter a figure.",
    "The down payment is assumed to be paid from savings outside this year and is not counted here.",
    "Income-drop scenarios lower income only; costs and payments stay the same.",
    "Harvest months are typical for the crop; actual dates vary by place and year.",
)


@dataclass(frozen=True)
class CashflowRow:
    index: int
    calendar_month: int
    income: float
    household_and_farm_costs: float
    existing_loan_payments: float
    kist: float
    other_flows: float
    net: float
    balance: float


@dataclass(frozen=True)
class CashflowScenario:
    name: str
    income_drop_percent: float
    yearly_income: float
    rows: tuple[CashflowRow, ...]
    lowest_balance: float
    lowest_month_index: int
    negative_month_indexes: tuple[int, ...]
    ending_balance: float


@dataclass(frozen=True)
class CashflowResult:
    start_month: int
    harvest_months: tuple[int, ...]
    savings: float
    scenarios: tuple[CashflowScenario, ...]
    assumptions: tuple[str, ...]


def crop_calendar(crop: str) -> dict[str, object]:
    """Return the typical season, sowing month and harvest months for a crop."""
    try:
        return CROP_CALENDARS[crop]
    except KeyError as exc:
        raise FinanceInputError(
            f"Crop must be one of: {', '.join(CROP_CALENDARS)}."
        ) from exc


def monthly_installment(principal: int | float, yearly_rate_percent: int | float, years: int) -> float:
    """The fixed monthly kist for a reducing-balance loan; 0 if nothing is borrowed."""
    amount = _number("Loan amount", principal)
    rate = _number("Yearly interest rate", yearly_rate_percent)
    if amount < 0:
        raise FinanceInputError("Loan amount cannot be negative.")
    if rate < 0:
        raise FinanceInputError("Yearly interest rate cannot be negative.")
    if amount == 0:
        return 0.0
    if isinstance(years, bool) or not isinstance(years, int) or years <= 0:
        raise FinanceInputError("Loan tenure must be at least one whole year.")
    return _monthly_kist(amount, rate, years)


def monthly_cashflow(
    *,
    yearly_income: int | float,
    monthly_costs: int | float,
    monthly_existing_loan_payments: int | float,
    monthly_kist: int | float,
    harvest_months: tuple[int, ...],
    start_month: int,
    savings: int | float = 0,
    income_drop_percentages: tuple[int | float, ...] = (25, 40),
    other_flows: dict[int, int | float] | None = None,
) -> CashflowResult:
    """Month-by-month cash for one 12-month window, for normal and lower income.

    The window starts in ``start_month`` (1-12). ``other_flows`` maps a window
    month (1-12) to extra money in (positive) or out (negative), for example a
    scheme payment or a seasonal loan.
    """
    income = _number("Yearly income", yearly_income)
    costs = _number("Monthly costs", monthly_costs)
    existing = _number("Monthly existing loan payments", monthly_existing_loan_payments)
    kist = _number("Monthly kist", monthly_kist)
    start_cash = _number("Savings", savings)
    if income < 0 or costs < 0 or existing < 0 or kist < 0:
        raise FinanceInputError("Income, costs and payments cannot be negative.")
    if isinstance(start_month, bool) or not isinstance(start_month, int) or not 1 <= start_month <= 12:
        raise FinanceInputError("Start month must be from 1 to 12.")
    if not harvest_months:
        raise FinanceInputError("At least one harvest month is required.")
    if len(set(harvest_months)) != len(harvest_months):
        raise FinanceInputError("Harvest months must not be repeated.")
    if any(isinstance(m, bool) or not isinstance(m, int) or not 1 <= m <= 12 for m in harvest_months):
        raise FinanceInputError("Harvest months must be from 1 to 12.")
    drops = tuple(_number("Income-drop percentage", d) for d in income_drop_percentages)
    if any(not 0 <= d <= 100 for d in drops) or len(set(drops)) != len(drops):
        raise FinanceInputError("Income-drop percentages must be unique values from 0 to 100.")
    extras = dict(other_flows or {})
    if any(not isinstance(k, int) or not 1 <= k <= 12 for k in extras):
        raise FinanceInputError("Extra flows must be keyed by a window month from 1 to 12.")

    def window_index(calendar_month: int) -> int:
        return (calendar_month - start_month) % 12 + 1

    harvest_indexes = {window_index(m) for m in harvest_months}
    scenarios: list[CashflowScenario] = []
    for drop in (0.0, *drops):
        scenario_income = income * (1 - drop / 100)
        per_harvest = scenario_income / len(harvest_months)
        balance = start_cash
        rows: list[CashflowRow] = []
        for index in range(1, 13):
            received = per_harvest if index in harvest_indexes else 0.0
            extra = float(extras.get(index, 0.0))
            net = received - costs - existing - kist + extra
            balance += net
            rows.append(
                CashflowRow(
                    index=index,
                    calendar_month=(start_month - 1 + index - 1) % 12 + 1,
                    income=received,
                    household_and_farm_costs=costs,
                    existing_loan_payments=existing,
                    kist=kist,
                    other_flows=extra,
                    net=net,
                    balance=balance,
                )
            )
        lowest = min(rows, key=lambda row: row.balance)
        scenarios.append(
            CashflowScenario(
                name="normal" if drop == 0 else f"income_down_{drop:g}_percent",
                income_drop_percent=drop,
                yearly_income=scenario_income,
                rows=tuple(rows),
                lowest_balance=lowest.balance,
                lowest_month_index=lowest.index,
                negative_month_indexes=tuple(row.index for row in rows if row.balance < -0.005),
                ending_balance=rows[-1].balance,
            )
        )
    return CashflowResult(
        start_month=start_month,
        harvest_months=tuple(harvest_months),
        savings=start_cash,
        scenarios=tuple(scenarios),
        assumptions=CASHFLOW_ASSUMPTIONS,
    )


def calculate_tractor_loan(*, tractor_price: int | float, **kwargs: object) -> FinanceResult:
    """Backward-compatible alias: a tractor loan is a farm loan for one asset."""
    return calculate_farm_loan(asset_price=tractor_price, **kwargs)  # type: ignore[arg-type]
