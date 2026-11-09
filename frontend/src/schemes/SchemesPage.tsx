import { useEffect, useId, useMemo, useState } from "react";

import { evaluateSchemes, getSchemesInfo } from "../api";
import type {
  Crop,
  Language,
  SchemeEvaluation,
  SchemeInfo,
  SchemesInfo,
  SchemesInputs,
  SchemesResult,
  SessionSnapshot,
} from "../api";
import { CROPS, cropNames, harvestHint, money, monthLong, toReportLanguage } from "../year/text";
import "./schemes.css";
import { figureLines, harvestMonths, riskVerdict, schemesText, signedMoney } from "./text";

type Props = {
  language: Language;
  crop: Crop;
  onCropChange: (crop: Crop) => void;
  slots: SessionSnapshot["slots"];
};

type FormState = {
  yearly_income: string;
  monthly_costs: string;
  monthly_existing_loan_payments: string;
  asset_price: string;
  down_payment: string;
  loan_rate: string;
  tenure_years: string;
  savings: string;
  alternative_rate: string;
  sum_insured: string;
  crop_loan_amount: string;
  small_or_marginal: boolean;
  sc_st_or_women: boolean;
  buying_machinery: boolean;
  post_harvest_project: boolean;
  pays_income_tax: boolean;
  government_employee_or_pensioner: boolean;
  tractor_class: string;
};

const EMPTY: FormState = {
  yearly_income: "",
  monthly_costs: "",
  monthly_existing_loan_payments: "",
  asset_price: "",
  down_payment: "",
  loan_rate: "",
  tenure_years: "",
  savings: "",
  alternative_rate: "",
  sum_insured: "",
  crop_loan_amount: "",
  small_or_marginal: true,
  sc_st_or_women: false,
  buying_machinery: false,
  post_harvest_project: false,
  pays_income_tax: false,
  government_employee_or_pensioner: false,
  tractor_class: "",
};

// A made-up farmer, labelled as made-up on the button that fills it.
const DEMO: FormState = {
  ...EMPTY,
  yearly_income: "480000",
  monthly_costs: "18000",
  monthly_existing_loan_payments: "3000",
  asset_price: "600000",
  down_payment: "100000",
  loan_rate: "9",
  tenure_years: "5",
  buying_machinery: true,
  tractor_class: "2wd_40_50",
};

const SLOT_TO_FIELD: Record<string, keyof FormState> = {
  yearly_farm_income: "yearly_income",
  monthly_costs: "monthly_costs",
  monthly_existing_loan_payments: "monthly_existing_loan_payments",
  asset_price: "asset_price",
  down_payment: "down_payment",
  yearly_interest_rate_percent: "loan_rate",
  tenure_years: "tenure_years",
};

function prefill(slots: SessionSnapshot["slots"]): FormState {
  const next = { ...EMPTY } as Record<string, string | boolean>;
  for (const [slot, field] of Object.entries(SLOT_TO_FIELD)) {
    const item = slots?.[slot];
    if (item && item.status !== "missing" && typeof item.value === "number") next[field] = String(item.value);
  }
  return next as FormState;
}

const toNumber = (text: string): number | null => {
  if (text.trim() === "") return null;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
};

function buildInputs(form: FormState, crop: Crop): SchemesInputs | null {
  const income = toNumber(form.yearly_income);
  const costs = toNumber(form.monthly_costs);
  if (income === null || costs === null || Number.isNaN(income) || Number.isNaN(costs)) return null;
  const fields = {
    existing: toNumber(form.monthly_existing_loan_payments),
    price: toNumber(form.asset_price),
    down: toNumber(form.down_payment),
    rate: toNumber(form.loan_rate),
    years: toNumber(form.tenure_years),
    savings: toNumber(form.savings),
    alt: toNumber(form.alternative_rate),
    insured: toNumber(form.sum_insured),
    kcc: toNumber(form.crop_loan_amount),
  };
  if (Object.values(fields).some((value) => value !== null && Number.isNaN(value))) return null;
  const price = fields.price ?? 0;
  const down = fields.down ?? 0;
  if (price > 0) {
    if (down >= price) return null;
    if (!fields.years || fields.years < 1 || !Number.isInteger(fields.years)) return null;
  }
  return {
    crop,
    yearly_income: income,
    monthly_costs: costs,
    monthly_existing_loan_payments: fields.existing ?? 0,
    asset_price: price,
    down_payment: down,
    loan_rate: fields.rate ?? 0,
    tenure_years: price > 0 ? (fields.years as number) : 0,
    savings: fields.savings ?? 0,
    alternative_rate: fields.alt,
    small_or_marginal: form.small_or_marginal,
    sc_st_or_women: form.sc_st_or_women,
    buying_machinery: form.buying_machinery,
    tractor_class: form.buying_machinery && form.tractor_class ? form.tractor_class : null,
    post_harvest_project: form.post_harvest_project,
    pays_income_tax: form.pays_income_tax,
    government_employee_or_pensioner: form.government_employee_or_pensioner,
    sum_insured: fields.insured,
    crop_loan_amount: fields.kcc,
  };
}

function Sparkline({ base, after, label }: { base: number[]; after: number[]; label: string }) {
  const W = 240;
  const H = 70;
  const all = [...base, ...after, 0];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const x = (i: number) => 6 + (i * (W - 12)) / 11;
  const y = (v: number) => 6 + ((max - v) / span) * (H - 12);
  const path = (values: number[]) => values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg className="sc-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1={6} x2={W - 6} y1={y(0)} y2={y(0)} className="sc-spark-zero" />
      <polyline points={path(base)} className="sc-spark-base" />
      <polyline points={path(after)} className="sc-spark-after" />
    </svg>
  );
}

export default function SchemesPage({ language, crop, onCropChange, slots }: Props) {
  const lang = toReportLanguage(language);
  const t = schemesText[lang];
  const idBase = useId();
  const [form, setForm] = useState<FormState>(() => prefill(slots));
  const [info, setInfo] = useState<SchemesInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [infoAttempt, setInfoAttempt] = useState(0);
  const [result, setResult] = useState<SchemesResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getSchemesInfo(controller.signal)
      .then((next) => {
        setInfo(next);
        setInfoError(false);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setInfoError(true);
      });
    return () => controller.abort();
  }, [infoAttempt]);

  const inputs = useMemo(() => buildInputs(form, crop), [form, crop]);

  useEffect(() => {
    if (!inputs) {
      setResult(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    const wait = window.setTimeout(() => {
      evaluateSchemes(inputs, controller.signal)
        .then((next) => {
          setResult(next);
          setError("");
          setBusy(false);
        })
        .catch((caught: unknown) => {
          if (caught instanceof DOMException && caught.name === "AbortError") return;
          setError(caught instanceof Error ? caught.message : t.failed);
          setBusy(false);
        });
    }, 400);
    return () => {
      window.clearTimeout(wait);
      controller.abort();
    };
  }, [inputs, t.failed]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const numberField = (key: keyof typeof t.fields & keyof FormState) => (
    <div className="sc-field" key={key}>
      <label htmlFor={`${idBase}-${key}`}>{t.fields[key]}</label>
      <input
        id={`${idBase}-${key}`}
        inputMode="decimal"
        autoComplete="off"
        value={form[key] as string}
        onChange={(event) => set(key, event.target.value as never)}
      />
    </div>
  );

  const infoById = useMemo(() => new Map((info?.schemes ?? []).map((item) => [item.id, item])), [info]);
  const nameOf = (id: string) => infoById.get(id as SchemeInfo["id"])?.name[lang] ?? id;
  const ordered = useMemo(() => {
    if (!result) return [];
    return [...result.schemes].sort((a, b) => Number(b.status === "may_apply") - Number(a.status === "may_apply"));
  }, [result]);

  const copyQuestions = async (scheme: SchemeInfo) => {
    const text = `${scheme.name[lang]}\n${scheme.ask_bank[lang].map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(scheme.id);
    } catch {
      setCopied(null);
    }
  };

  const base = result?.baseline.metrics[0];
  const base40 = result?.baseline.metrics[2];
  const topMoney = result?.ranking_by_money[0];
  const topRisk = result?.ranking_by_risk[0];
  const moneyScheme = result?.schemes.find((s) => s.id === topMoney);
  const riskScheme = result?.schemes.find((s) => s.id === topRisk);
  const baseBalances = result?.baseline.cashflow.scenarios[0].rows.map((row) => row.balance) ?? [];
  const loanRate = Number(form.loan_rate) || 0;

  return (
    <section className="sc" aria-labelledby={`${idBase}-title`}>
      <header className="sc-hero">
        <p className="sc-overline">{lang === "hi" ? "कुबेरकेत" : "KUBERKET"} / {lang === "hi" ? t.navTitle : t.navTitle.toUpperCase()}</p>
        <h1 id={`${idBase}-title`}>{t.heading}</h1>
        <p className="sc-lead">{t.lead}</p>
        <p className="sc-disclaimer" role="note">{t.notAdvice}</p>
      </header>

      <div className="sc-crop" role="group" aria-label={t.cropLabel}>
        <span>{t.cropLabel}</span>
        {CROPS.map((item) => (
          <button
            key={item}
            type="button"
            className={`sc-chip ${crop === item ? "active" : ""}`}
            aria-pressed={crop === item}
            onClick={() => onCropChange(item)}
          >
            {cropNames[lang][item]}
          </button>
        ))}
        <small>{harvestHint(lang, crop)}</small>
      </div>

      <form className="sc-form" onSubmit={(event) => event.preventDefault()} aria-label={t.formTitle}>
        <div className="sc-form-head">
          <h2>{t.formTitle}</h2>
          <div className="sc-form-actions">
            <button type="button" className="sc-btn" onClick={() => setForm(DEMO)}>{t.fill}</button>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setForm(EMPTY)}>{t.clear}</button>
          </div>
        </div>
        <div className="sc-grid">
          {numberField("yearly_income")}
          {numberField("monthly_costs")}
          {numberField("monthly_existing_loan_payments")}
          {numberField("asset_price")}
          {numberField("down_payment")}
          {numberField("loan_rate")}
          {numberField("tenure_years")}
        </div>
        <fieldset className="sc-toggles">
          <legend className="sc-sr-only">{t.formTitle}</legend>
          {(Object.keys(t.toggles) as (keyof typeof t.toggles)[]).map((key) => (
            <label key={key} className="sc-check">
              <input type="checkbox" checked={form[key]} onChange={(event) => set(key, event.target.checked)} />
              <span>{t.toggles[key]}</span>
            </label>
          ))}
        </fieldset>
        {form.buying_machinery && (
          <div className="sc-field">
            <label htmlFor={`${idBase}-tractor`}>{t.tractorClass}</label>
            <select id={`${idBase}-tractor`} value={form.tractor_class} onChange={(event) => set("tractor_class", event.target.value)}>
              <option value="">{t.tractorAny}</option>
              {Object.entries(info?.tractor_classes ?? {}).map(([key, item]) => (
                <option key={key} value={key}>{lang === "hi" ? item.label_hi : item.label_en}</option>
              ))}
            </select>
          </div>
        )}
        <details className="sc-more">
          <summary>{t.optional}</summary>
          <div className="sc-grid">
            {numberField("savings")}
            {numberField("alternative_rate")}
            <div className="sc-field">
              <label htmlFor={`${idBase}-insured`}>{t.sumInsured}</label>
              <input id={`${idBase}-insured`} inputMode="decimal" value={form.sum_insured} onChange={(event) => set("sum_insured", event.target.value)} />
            </div>
            <div className="sc-field">
              <label htmlFor={`${idBase}-kcc`}>{t.cropLoanAmount}</label>
              <input id={`${idBase}-kcc`} inputMode="decimal" value={form.crop_loan_amount} onChange={(event) => set("crop_loan_amount", event.target.value)} />
            </div>
          </div>
        </details>
      </form>

      {error && <div className="sc-error" role="alert">{error}</div>}
      {infoError && (
        <div className="sc-error" role="alert">
          <p>{lang === "hi" ? "योजनाओं की जानकारी लोड नहीं हो पाई।" : "Scheme information could not be loaded."}</p>
          <button type="button" className="sc-btn" onClick={() => setInfoAttempt((n) => n + 1)}>
            {lang === "hi" ? "फिर से कोशिश करें" : "Try again"}
          </button>
        </div>
      )}

      {!inputs && <p className="sc-hint">{t.needInputs}</p>}
      {inputs && busy && !result && <p className="sc-hint">{t.calculating}</p>}

      {result && base && base40 && (
        <div className="sc-results" aria-busy={busy}>
          <section className="sc-card sc-summary" aria-labelledby={`${idBase}-sum`}>
            <h2 id={`${idBase}-sum`}>{t.summaryTitle}</h2>
            <ul>
              <li>{t.harvest(cropNames[lang][result.crop], harvestMonths(result, lang))}</li>
              {result.baseline.monthly_kist > 0 && <li>{t.kist(money(result.baseline.monthly_kist))}</li>}
              <li>{t.lowest(money(base.lowest_balance), monthLong[lang][(result.start_month + base.lowest_month_index - 2) % 12])}</li>
              <li>{t.lowest40(money(base40.lowest_balance))}</li>
              <li>{t.shortMonths(base.negative_month_indexes.length)}</li>
            </ul>
          </section>

          <section className="sc-card sc-ranking" aria-labelledby={`${idBase}-rank`}>
            <h2 id={`${idBase}-rank`}>{t.rankingTitle}</h2>
            {moneyScheme || riskScheme ? (
              <ul>
                {moneyScheme && (
                  <li>{t.byMoney(nameOf(moneyScheme.id), money(moneyScheme.money_effect_first_year ?? 0), moneyScheme.money_effect_is_one_time)}</li>
                )}
                {riskScheme && (
                  <li>{t.byRisk(nameOf(riskScheme.id), money(riskScheme.risk_change[0].lowest_balance_change))}</li>
                )}
              </ul>
            ) : (
              <p>{t.nothingHelps}</p>
            )}
            <p className="sc-fine">{t.notAdvice}</p>
          </section>

          <section className="sc-card" aria-labelledby={`${idBase}-table`}>
            <h2 id={`${idBase}-table`}>{t.tableTitle}</h2>
            <div className="sc-table-wrap" tabIndex={0} role="region" aria-label={t.tableTitle}>
              <table className="sc-table">
                <thead>
                  <tr>
                    <th scope="col">{t.cols.scheme}</th>
                    <th scope="col">{t.cols.money}</th>
                    <th scope="col">{t.cols.lowest}</th>
                    <th scope="col">{t.cols.lowest40}</th>
                    <th scope="col">{t.cols.short}</th>
                    <th scope="col">{t.cols.risk}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((scheme) => {
                    const on = scheme.status === "may_apply";
                    const normal = scheme.risk_change[0];
                    const drop40 = scheme.risk_change[2];
                    const verdict = riskVerdict(scheme);
                    return (
                      <tr key={scheme.id} data-status={scheme.status}>
                        <th scope="row">
                          {nameOf(scheme.id)}
                          <small>{t.status[scheme.status]}</small>
                        </th>
                        <td>{on && scheme.money_effect_first_year !== null ? signedMoney(scheme.money_effect_first_year) : "—"}</td>
                        <td>{on ? signedMoney(normal.lowest_balance_change) : "—"}</td>
                        <td>{on ? signedMoney(drop40.lowest_balance_change) : "—"}</td>
                        <td>
                          {on
                            ? `${scheme.after[0].negative_month_indexes.length} (${normal.negative_months_change > 0 ? "+" : ""}${normal.negative_months_change})`
                            : "—"}
                        </td>
                        <td><span className={`sc-risk sc-risk-${verdict}`}>{t.risk[verdict]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="sc-cards">
            {ordered.map((scheme) => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                info={infoById.get(scheme.id)}
                lang={lang}
                asOf={info?.as_of ?? result.as_of}
                base={baseBalances}
                loanRate={loanRate}
                baselineKist={result.baseline.monthly_kist}
                baselineLoan={result.baseline.loan_amount}
                copied={copied === scheme.id}
                onCopy={(item) => void copyQuestions(item)}
              />
            ))}
          </div>

          <details className="sc-card sc-assume">
            <summary>{t.assumptions}</summary>
            <ul>{t.assumptionList.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
          <p className="sc-fine">{t.asOf(info?.as_of ?? result.as_of)}</p>
        </div>
      )}
    </section>
  );
}

type CardProps = {
  scheme: SchemeEvaluation;
  info: SchemeInfo | undefined;
  lang: "hi" | "en";
  asOf: string;
  base: number[];
  loanRate: number;
  baselineKist: number;
  baselineLoan: number;
  copied: boolean;
  onCopy: (info: SchemeInfo) => void;
};

function SchemeCard({ scheme, info, lang, asOf, base, loanRate, baselineKist, baselineLoan, copied, onCopy }: CardProps) {
  const t = schemesText[lang];
  const headingId = useId();
  if (!info) return null;
  const lines = figureLines(scheme, { loanRate, baselineKist, baselineLoan, language: lang });
  const reason = scheme.status !== "may_apply" ? (t.reasons as Record<string, string>)[scheme.reason] : null;
  return (
    <article className="sc-card sc-scheme" data-status={scheme.status} aria-labelledby={headingId}>
      <div className="sc-scheme-head">
        <h2 id={headingId}>{info.name[lang]}</h2>
        <span className={`sc-badge sc-badge-${scheme.status}`}>{t.status[scheme.status]}</span>
      </div>
      <h3>{t.what}</h3>
      <p>{info.what[lang]}</p>

      {reason && <p className="sc-reason">{reason}</p>}

      {lines.length > 0 && (
        <>
          <h3>{t.computed}</h3>
          <ul className="sc-lines">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
          <div className="sc-spark-wrap">
            <Sparkline
              base={base}
              after={scheme.balances_normal}
              label={`${t.balanceChart}: ${t.withScheme} / ${t.without}`}
            />
            <ul className="sc-spark-legend">
              <li><i className="sc-sw sc-sw-after" />{t.withScheme}</li>
              <li><i className="sc-sw sc-sw-base" />{t.without}</li>
            </ul>
          </div>
        </>
      )}

      <h3>{t.terms}</h3>
      <ul>{info.terms[lang].map((item) => <li key={item}>{item}</li>)}</ul>
      <h3>{t.watch}</h3>
      <ul>{info.watch_out[lang].map((item) => <li key={item}>{item}</li>)}</ul>

      <h3>{t.ask}</h3>
      <ol className="sc-ask">{info.ask_bank[lang].map((item) => <li key={item}>{item}</li>)}</ol>
      <button type="button" className="sc-btn sc-btn-ghost" onClick={() => onCopy(info)}>
        {copied ? t.copied : t.copy}
      </button>

      <p className="sc-sources">
        {t.sources} ({t.sourceAsOf} {asOf}):{" "}
        {info.sources.map((source, index) => (
          <span key={source.url}>
            {index > 0 && ", "}
            <a href={source.url} target="_blank" rel="noreferrer noopener">{lang === "hi" ? source.title.replace(/\bportal\b/i, "पोर्टल") : source.title}</a>
          </span>
        ))}
      </p>
    </article>
  );
}
