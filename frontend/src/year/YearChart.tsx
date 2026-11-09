import type { CashflowReport, CashflowScenario, ReportLanguage } from "../api";
import { money, monthShort, shortMoney, yearText } from "./text";

const W = 720;
const H = 320;
const PAD = { left: 70, right: 12, top: 14, bottom: 40 };

const STEPS = [10_000, 20_000, 25_000, 50_000, 100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];

/** One shared scale for all scenarios, so the slider visibly moves the bars. */
export function chartDomain(report: CashflowReport): { min: number; max: number; ticks: number[] } {
  const values: number[] = [0];
  const outgo = report.monthly_outgo;
  values.push(outgo);
  for (const scenario of report.scenarios) {
    for (const row of scenario.rows) values.push(row.income, row.balance);
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(1, rawMax - rawMin);
  const step = STEPS.find((candidate) => span / candidate <= 6) ?? STEPS[STEPS.length - 1];
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max + 0.5; tick += step) ticks.push(tick);
  return { min, max, ticks };
}

type Props = {
  report: CashflowReport;
  scenario: CashflowScenario;
  language: ReportLanguage;
  /** How many months have been revealed (0 to 12). */
  shown: number;
  /** The month being walked through right now, if any. */
  highlight?: number | null;
};

/** Income bars, costs-plus-kist bars, the cash line, and red hatching on months with no money. */
export default function YearChart({ report, scenario, language, shown, highlight = null }: Props) {
  const t = yearText[language];
  const { min, max, ticks } = chartDomain(report);
  const plotH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / 12;
  const y = (value: number) => PAD.top + ((max - value) / (max - min)) * plotH;
  const zero = y(0);
  const rows = scenario.rows;
  const visible = rows.slice(0, shown);
  const points = visible.map((row, index) => `${PAD.left + index * slot + slot / 2},${y(row.balance)}`).join(" ");
  const last = visible[visible.length - 1];
  const names = monthShort[language];
  const label = t.chartLabel(report.crop_name, money(scenario.ending_balance));

  return (
    <div className="yr-chart-wrap">
      <svg className="yr-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          <pattern id="yr-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="rgba(179, 38, 30, 0.10)" />
            <rect width="2" height="7" fill="rgba(179, 38, 30, 0.28)" />
          </pattern>
        </defs>

        {rows.map((row, index) =>
          index < shown && row.balance < -0.005 ? (
            <rect
              key={`short-${row.index}`}
              className="yr-short"
              data-month={row.index}
              x={PAD.left + index * slot}
              y={PAD.top}
              width={slot}
              height={plotH}
              fill="url(#yr-hatch)"
            />
          ) : null,
        )}

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "yr-axis-zero" : "yr-axis"} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="yr-tick">{shortMoney(tick, language)}</text>
          </g>
        ))}

        {rows.map((row, index) => {
          const x = PAD.left + index * slot;
          const outgo = row.household_and_farm_costs + row.existing_loan_payments + row.kist;
          const on = index < shown;
          return (
            <g key={row.index} className="yr-month" data-on={on ? "true" : "false"}>
              {row.income > 0 && (
                <rect className="yr-income" x={x + slot * 0.1} width={slot * 0.38} y={y(row.income)} height={Math.max(1, zero - y(row.income))} rx={2} />
              )}
              <rect className="yr-outgo" x={x + slot * 0.52} width={slot * 0.38} y={y(outgo)} height={Math.max(1, zero - y(outgo))} rx={2} />
            </g>
          );
        })}

        {rows.map((row, index) => (
          <text
            key={`m-${row.index}`}
            x={PAD.left + index * slot + slot / 2}
            y={H - 18}
            textAnchor="middle"
            className={`yr-tick ${highlight === row.index ? "yr-tick-now" : ""}`}
          >
            {names[row.calendar_month - 1]}
          </text>
        ))}

        {highlight && highlight >= 1 && highlight <= 12 && (
          <rect
            className="yr-now"
            x={PAD.left + (highlight - 1) * slot + 1}
            y={PAD.top}
            width={slot - 2}
            height={plotH + 24}
            rx={6}
          />
        )}

        {visible.length > 0 && <polyline className="yr-line" points={points} />}
        {last && <circle className="yr-dot" cx={PAD.left + (visible.length - 1) * slot + slot / 2} cy={y(last.balance)} r={5} />}
      </svg>

      <ul className="yr-legend">
        <li><i className="yr-sw yr-sw-income" />{t.legendIncome}</li>
        <li><i className="yr-sw yr-sw-outgo" />{t.legendCosts}</li>
        <li><i className="yr-sw yr-sw-line" />{t.legendCash}</li>
        <li><i className="yr-sw yr-sw-short" />{t.legendShort}</li>
      </ul>

      <table className="yr-sr-only">
        <caption>{t.tableCaption}</caption>
        <thead>
          <tr>{t.tableHeads.map((head) => <th key={head} scope="col">{head}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index}>
              <th scope="row">{names[row.calendar_month - 1]}</th>
              <td>{money(row.income)}</td>
              <td>{money(row.household_and_farm_costs + row.existing_loan_payments + row.kist)}</td>
              <td>{money(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
