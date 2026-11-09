import type { CashflowReport, CashflowScenario, DemoYear } from "../api";

/**
 * A tiny year with numbers that can be checked by hand.
 * Paddy: sown June, income 144,000 split over months 5 and 6 (October, November).
 * Outgo is 10,000 every month (costs 5,000 + kist 5,000).
 * Normal balances (thousands): -10 -20 -30 -40 +22 +84 +74 +64 +54 +44 +34 +24.
 * 25% lower (harvest 54,000 each): -10 -20 -30 -40 +4 +48 +38 +28 +18 +8 -2 -12.
 */
export function makeScenario(drop: number): CashflowScenario {
  const harvest = (144_000 * (1 - drop / 100)) / 2;
  let balance = 0;
  const rows = Array.from({ length: 12 }, (_, i) => {
    const index = i + 1;
    const income = index === 5 || index === 6 ? harvest : 0;
    const net = income - 10_000;
    balance += net;
    return {
      index,
      calendar_month: ((5 + i) % 12) + 1,
      income,
      household_and_farm_costs: 5_000,
      existing_loan_payments: 0,
      kist: 5_000,
      other_flows: 0,
      net,
      balance,
    };
  });
  const lowest = rows.reduce((a, b) => (b.balance < a.balance ? b : a));
  return {
    name: drop === 0 ? "normal" : `income_down_${drop}_percent`,
    income_drop_percent: drop,
    yearly_income: 144_000 * (1 - drop / 100),
    rows,
    lowest_balance: lowest.balance,
    lowest_month_index: lowest.index,
    negative_month_indexes: rows.filter((r) => r.balance < 0).map((r) => r.index),
    ending_balance: rows[11].balance,
  };
}

export function makeReport(drop = 0): CashflowReport {
  const scenarios = [makeScenario(0), makeScenario(25), makeScenario(40)];
  const selected = drop === 0 ? scenarios[0] : scenarios.find((s) => s.income_drop_percent === drop) ?? makeScenario(drop);
  const narration = [
    { text: "Sentence one about income.", at_month: 1 },
    { text: "Sentence two about outgo.", at_month: 1 },
    { text: "Sentence three about the tightest month.", at_month: 4 },
  ];
  if (drop > 0) narration.push({ text: "Sentence four about lower income.", at_month: 12 });
  return {
    crop: "paddy",
    crop_name: "Paddy",
    season: "kharif",
    start_month: 6,
    harvest_months: [10, 11],
    month_names: [],
    loan_amount: 250_000,
    monthly_kist: 5_000,
    monthly_outgo: 10_000,
    savings: 0,
    scenarios,
    selected_drop_percent: drop,
    selected,
    risky_sentence:
      selected.negative_month_indexes.length === 0
        ? "Money does not run short."
        : `Risky months: ${selected.negative_month_indexes.join(",")}`,
    normal_risky_sentence: "Normal risky",
    narration,
    answers: [
      { question: "Which month is hardest?", answer: "September is the hardest month." },
      { question: "What if income falls?", answer: "Money runs short in six months." },
    ],
    assumptions: ["Savings are assumed to be zero."],
  };
}

export const makeDemoYear = (drop: number): DemoYear => ({
  ...makeReport(drop),
  synthetic: true,
  farmer: { name: "रामू", inputs: {} },
});
