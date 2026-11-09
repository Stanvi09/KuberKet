import { useCallback } from "react";

import { getDemoYear, speakCashflow } from "../api";
import type { CashflowInputs, CashflowReport, DemoYear } from "../api";
import YearPanel from "../year/YearPanel";
import { storyCopy } from "./copy";
import type { StoryLang } from "./copy";

type Props = { onLoaded?: (data: DemoYear) => void; lang?: StoryLang };

// The same made-up farmer the server uses, so the spoken sentences match the chart.
const DEMO_INPUTS: CashflowInputs = {
  crop: "paddy",
  yearly_income: 480_000,
  monthly_costs: 18_000,
  monthly_existing_loan_payments: 3_000,
  asset_price: 600_000,
  down_payment: 100_000,
  loan_rate: 9,
  tenure_years: 5,
  savings: 0,
};

/** "साल की कहानी" on the story page: a made-up farmer's harvest-based year, every number from the finance engine. */
export default function YearStory({ onLoaded, lang = "hi" }: Props) {
  const load = useCallback((drop: number, signal: AbortSignal) => getDemoYear(drop, lang, signal) as Promise<CashflowReport>, [lang]);
  const speak = useCallback(
    (mode: "narration" | "answer", index: number, drop: number) => speakCashflow(DEMO_INPUTS, drop, lang, mode, index),
    [lang],
  );
  return (
    <YearPanel
      language={lang}
      reloadKey={lang}
      load={load}
      speak={speak}
      tag={storyCopy[lang].yearTag}
      heading={storyCopy[lang].yearHeading}
      onLoaded={(report) => onLoaded?.(report as DemoYear)}
    />
  );
}
