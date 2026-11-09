import type { SchemeEvaluation, SchemeId, SchemeInfo, SchemeMetric, SchemesInfo, SchemesResult } from "../api";
import { makeScenario } from "../year/testFixtures";

const text = (s: string) => ({ hi: `${s} (hi)`, en: s });

export function makeInfo(): SchemesInfo {
  const ids: [SchemeId, SchemeInfo["kind"], string][] = [
    ["kcc", "loan", "Kisan Credit Card (KCC)"],
    ["aif", "loan", "Agriculture Infrastructure Fund (AIF)"],
    ["smam", "subsidy", "Sub-Mission on Agricultural Mechanization (SMAM)"],
    ["pmfby", "insurance", "PM Fasal Bima Yojana (PMFBY)"],
    ["pm_kisan", "income_support", "PM-KISAN"],
  ];
  return {
    as_of: "2026-11-09",
    tractor_classes: {
      "2wd_40_50": { label_en: "2WD tractor, 40 to 50 HP", label_hi: "2WD ट्रैक्टर, 40 से 50 HP", priority: 4.5, other: 3.6 },
    },
    schemes: ids.map(([id, kind, name]) => ({
      id,
      kind,
      name: text(name),
      what: text(`${id} explained`),
      terms: { hi: [`${id} term (hi)`], en: [`${id} term`] },
      watch_out: { hi: [`${id} watch (hi)`], en: [`${id} watch out`] },
      ask_bank: { hi: [`${id} q1 (hi)`], en: [`${id} question one`, `${id} question two`] },
      sources: [{ title: `${id} official page`, url: `https://example.gov.in/${id}` }],
    })),
  };
}

const metrics = (low: number[]): SchemeMetric[] =>
  [0, 25, 40].map((drop, i) => ({
    name: drop === 0 ? "normal" : `income_down_${drop}_percent`,
    income_drop_percent: drop,
    lowest_balance: low[i],
    lowest_month_index: 4,
    negative_month_indexes: [1, 2, 3, 4],
    ending_balance: 0,
  }));

const risk = (changes: number[]) =>
  ["normal", "income_down_25_percent", "income_down_40_percent"].map((name, i) => ({
    name,
    lowest_balance_change: changes[i],
    negative_months_change: 0,
    ending_balance_change: changes[i],
  }));

const balances = Array.from({ length: 12 }, (_, i) => -10_000 * (i + 1));

function evaluation(id: SchemeId, overrides: Partial<SchemeEvaluation>): SchemeEvaluation {
  return {
    id,
    status: "may_apply",
    reason: "ok",
    figures: {},
    money_effect_first_year: null,
    money_effect_is_one_time: false,
    after: metrics([-40_000, -50_000, -60_000]),
    risk_change: risk([0, 0, 0]),
    balances_normal: balances,
    ...overrides,
  };
}

/** Numbers follow the hand-checked engine tests: paddy, 6,00,000 tractor, 1,00,000 down, 10% for 5 years. */
export function makeResult(): SchemesResult {
  const base = makeScenario(0);
  return {
    as_of: "2026-11-09",
    crop: "paddy",
    season: "kharif",
    start_month: 6,
    harvest_months: [10, 11],
    baseline: {
      loan_amount: 500_000,
      monthly_kist: 10_623.52,
      cashflow: { scenarios: [base] },
      metrics: metrics([-82_494, -95_000, -110_000]),
    },
    schemes: [
      evaluation("kcc", {
        figures: {
          amount: 83_000, months_held: 5, shortfall_before_harvest: 82_494, amount_capped_at_limit: false,
          interest_on_time: 1_383.33, interest_without_incentive: 2_420.83, extra_cost_if_incentive_lost: 1_037.5,
          alternative_rate_percent: 10, interest_at_alternative: 3_458.33, saving_vs_alternative: 2_075,
        },
        money_effect_first_year: 2_075,
        risk_change: risk([83_000, 83_000, 83_000]),
      }),
      evaluation("aif", { status: "not_applicable", reason: "project_type", after: metrics([-82_494, -95_000, -110_000]) }),
      evaluation("smam", {
        figures: {
          percent: 50, uncapped_subsidy: 300_000, cap: 450_000, cap_derived: false, cap_applied: false, cap_unknown: false,
          subsidy: 300_000, effective_price: 300_000, loan_after: 200_000, kist_before: 10_623.52, kist_after: 4_249.41,
          monthly_saving: 6_374.11, total_saving_over_tenure: 382_446.6, individual_ownership_discouraged: true,
        },
        money_effect_first_year: 300_000,
        money_effect_is_one_time: true,
        risk_change: risk([25_000, 25_000, 25_000]),
      }),
      evaluation("pmfby", {
        figures: {
          season: "kharif", premium_percent: 2, sum_insured: 480_000, sum_insured_assumed: true, premium: 9_600,
          income_at_stake_25: 120_000, income_at_stake_40: 192_000,
        },
        money_effect_first_year: -9_600,
        risk_change: risk([-9_600, -9_600, -9_600]),
      }),
      evaluation("pm_kisan", {
        figures: { per_year: 6_000 },
        money_effect_first_year: 6_000,
        risk_change: risk([2_000, 2_000, 2_000]),
      }),
    ],
    ranking_by_money: ["smam", "pm_kisan", "kcc"],
    ranking_by_risk: ["kcc", "smam", "pm_kisan"],
    assumptions: [],
  };
}
