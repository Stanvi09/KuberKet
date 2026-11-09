import type { DemoYear } from "../api";
import { money, monthLong, monthShort } from "../year/text";
import { storyCopy } from "./copy";
import type { StoryLang } from "./copy";

type Props = { report: DemoYear | null; lang?: StoryLang };

type Tone = "save" | "harvest" | "ok" | "short";

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Ramu's year as four diary chapters and a 12-month strip. Every figure is read from the engine's
 * report for the chosen income drop. Money is told as change from the start of the year, so the
 * months before harvest read as "paid from savings", not as a made-up debt.
 */
export default function YearDiary({ report, lang = "hi" }: Props) {
  const t = storyCopy[lang].diary;
  if (!report) {
    return <div className="st-diary st-diary-wait" aria-busy="true">{t.wait}</div>;
  }

  const rows = report.selected.rows;
  const start = report.savings;
  const firstHarvest = rows.findIndex((row) => row.income > 0);
  const before = firstHarvest > 0 ? rows.slice(0, firstHarvest) : [];
  const beforeKist = before.reduce((sum, row) => sum + row.kist, 0);
  // What leaves the pocket before the first harvest, straight from the engine's monthly net figures.
  const beforeNeed = -before.reduce((sum, row) => sum + row.net, 0);
  const beforeOther = beforeNeed - beforeKist;
  const harvestRows = rows.filter((row) => row.income > 0);
  const harvestTotal = harvestRows.reduce((sum, row) => sum + row.income, 0);
  const harvestNames = harvestRows.map((row) => monthLong[lang][row.calendar_month - 1]).join(t.monthJoin);
  const change = report.selected.ending_balance - start;

  const tones: Tone[] = rows.map((row, index) => {
    if (row.income > 0) return "harvest";
    if (firstHarvest === -1 || index < firstHarvest) return "save";
    return row.balance < start ? "short" : "ok";
  });
  const shortAfter = tones.filter((tone) => tone === "short").length;

  const inputs = report.farmer.inputs;
  const tenure = num(inputs.tenure_years);
  const rate = num(inputs.loan_rate);
  const price = num(inputs.asset_price);
  const down = num(inputs.down_payment);
  const drop = report.selected.income_drop_percent;
  let chapter = 0;
  const next = () => t.chapter(++chapter);

  return (
    <div className="st-diary" lang={lang}>
      <div className="st-diary-strip" role="list" aria-label={t.stripLabel}>
        {rows.map((row, index) => (
          <div key={row.index} role="listitem" className="st-month" data-tone={tones[index]}>
            <span className="st-month-name">{monthShort[lang][row.calendar_month - 1]}</span>
            <span className="st-month-tone">{t.tones[tones[index]]}</span>
          </div>
        ))}
      </div>

      <ol className="st-chapters">
        <li className="st-chapter">
          <span className="st-chapter-no">{next()}</span>
          <h3>{t.loanTitle}</h3>
          <p className="st-chapter-big">{money(report.monthly_kist)} <small>{t.kistNote}</small></p>
          <p>{t.loanLine(price !== null ? money(price) : null, down !== null ? money(down) : null, money(report.loan_amount), rate, tenure)}</p>
        </li>

        {before.length > 0 && (
          <li className="st-chapter" data-tone="save">
            <span className="st-chapter-no">{next()}</span>
            <h3>{t.beforeTitle}</h3>
            <p className="st-chapter-big">{money(beforeNeed)} <small>{t.beforeNote(before.length)}</small></p>
            <p>{t.beforeLine(before.length, money(beforeKist), money(beforeOther))}</p>
          </li>
        )}

        <li className="st-chapter" data-tone="harvest">
          <span className="st-chapter-no">{next()}</span>
          <h3>{t.harvestTitle}</h3>
          <p className="st-chapter-big">{money(harvestTotal)} <small>{t.harvestNote(harvestNames)}</small></p>
          <p>{t.harvestLine(drop)}</p>
        </li>

        <li className="st-chapter" data-tone={change >= 0 ? "ok" : "short"}>
          <span className="st-chapter-no">{next()}</span>
          <h3>{t.endTitle}</h3>
          <p className="st-chapter-big">
            {change >= 0 ? "+" : ""}{money(change)} <small>{t.endNote(change >= 0)}</small>
          </p>
          <p>{t.endLine(shortAfter)}</p>
        </li>
      </ol>
    </div>
  );
}
