import type { Language, SessionSnapshot } from "../api";
import { homeText } from "./copy";
import { formatMoney, formatPercent, formatYears } from "./format";

type Result = NonNullable<SessionSnapshot["finance_result"]>;

/** The key numbers of the farmer's loan, big enough to read at a glance. */
export default function Results({ result, language }: { result: Result; language: Language }) {
  const t = homeText[language];
  return (
    <div className="hm-results">
      <div className="hm-hero">
        <span>{t.kist}</span>
        <strong>{formatMoney(result.monthly_kist)}</strong>
      </div>
      <dl className="hm-facts">
        <div><dt>{t.loanAmount}</dt><dd>{formatMoney(result.loan_amount)}</dd></div>
        <div><dt>{t.interest}</dt><dd>{formatPercent(result.yearly_interest_rate_percent, language)}</dd></div>
        <div><dt>{t.tenure}</dt><dd>{formatYears(result.tenure_years, language)}</dd></div>
        <div><dt>{t.total}</dt><dd>{formatMoney(result.total_repayment)}</dd></div>
        <div><dt>{t.totalInterest}</dt><dd>{formatMoney(result.total_interest)}</dd></div>
      </dl>
      <h4>{t.scenarios}</h4>
      <ul className="hm-scenarios">
        {(result.scenarios ?? []).map((scenario) => {
          const amount = scenario.affordability.yearly_money_left;
          const negative = amount < 0;
          const thin = scenario.affordability.yearly_status === "thin";
          return (
            <li key={scenario.name} data-tone={negative ? "negative" : thin ? "thin" : "ok"}>
              <span>
                {scenario.income_drop_percent === 0
                  ? t.normalYear
                  : t.incomeDown(formatPercent(scenario.income_drop_percent, language))}
              </span>
              <strong>
                {formatMoney(Math.abs(amount))} {negative ? t.short : t.left}
              </strong>
              {thin && <small>{t.thin}</small>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
